#!/usr/bin/env node
// postprocess.js — apply STATUS updates OR archive the working file.
//
// Usage:
//   node postprocess.js apply <working-file> <updates.json> [--project <dir>] [--config <file>]
//   node postprocess.js archive <working-file> [--phase N] [--project <dir>] [--config <file>]
//
// `apply` inserts **STATUS**: lines after the item at item_id's end_line.
// `archive` renames the file to MM-DD_phaseN.md, scaffolds a fresh
// WORKING.md, and rotates older archives out of the main notes dir.

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_CONFIG,
  loadConfig,
  resolvePaths,
  parseItems,
  getContinuationIndent,
  loadContext,
  sha256,
  readManifest,
  writeManifest,
} = require('./lib');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = argv[++i];
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--phase') args.phase = argv[++i];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
    else args._.push(a);
  }
  return args;
}

function ensureInside(child, parent, label) {
  const rel = path.relative(parent, child);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    process.stderr.write(`error: ${label} must be inside notes_dir: ${child}\n`);
    process.exit(2);
  }
}

// ---- apply ------------------------------------------------------------

function apply(workingFile, updatesPath, projectRoot) {
  const config = loadConfig(projectRoot);
  const paths = resolvePaths(projectRoot, config);
  ensureInside(workingFile, paths.notesDir, 'working file');

  const updatesRaw = fs.readFileSync(updatesPath, 'utf8');
  const { updates } = JSON.parse(updatesRaw);
  if (!Array.isArray(updates)) {
    process.stderr.write('error: updates.json must have shape { updates: [...] }\n');
    process.exit(2);
  }

  const content = fs.readFileSync(workingFile, 'utf8');
  const items = parseItems(content);
  const byId = new Map(items.map(i => [i.id, i]));

  const lines = content.split('\n');
  // Build insertions: map end_line -> array of status lines to insert after.
  const insertions = [];
  const counts = { applied: 0, skipped: 0 };

  for (const upd of updates) {
    const item = byId.get(upd.id);
    if (!item) { counts.skipped++; continue; }
    if (item.reviewed) { counts.skipped++; continue; }
    const indent = getContinuationIndent(item.first_line);
    const statusLine = indent + upd.status_line.trim();
    insertions.push({ after: item.end_line, statusLine });
    counts.applied++;
  }

  // Apply in reverse order of `after` so earlier indices don't shift.
  insertions.sort((a, b) => b.after - a.after);
  for (const ins of insertions) {
    lines.splice(ins.after + 1, 0, ins.statusLine);
  }

  const newContent = lines.join('\n');
  fs.writeFileSync(workingFile, newContent);

  // Update manifest
  const manifest = readManifest(paths.manifestFile);
  const reparsed = parseItems(newContent);
  manifest.working = {
    file: path.relative(paths.notesDir, workingFile),
    hash: sha256(newContent),
    item_count: reparsed.length,
    unreviewed: reparsed.filter(i => !i.reviewed).length,
    last_reviewed: new Date().toISOString(),
  };
  writeManifest(paths.manifestFile, manifest);

  process.stdout.write(JSON.stringify({
    ok: true,
    applied: counts.applied,
    skipped: counts.skipped,
    working_file: path.relative(projectRoot, workingFile),
    unreviewed_remaining: manifest.working.unreviewed,
  }, null, 2) + '\n');
}

// ---- archive ----------------------------------------------------------

function pickCurrentPhase(paths, override, config) {
  if (override) return String(override).replace(/^phase/i, '');
  const ctx = loadContext(paths, config);
  if (ctx.current_phase) return ctx.current_phase;
  // Fallback: first planned phase by num
  const all = [...ctx.planned_phases, ...ctx.in_progress_phases];
  all.sort((a, b) => cmpPhase(a.num, b.num));
  if (all.length > 0) return all[0].num;
  return '0';
}

function cmpPhase(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10));
  const pb = String(b).split('.').map(n => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function renderArchiveName(template, date, phase) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return String(template || DEFAULT_CONFIG.archive_name_template)
    .replaceAll('{YYYY}', yyyy)
    .replaceAll('{MM}', mm)
    .replaceAll('{DD}', dd)
    .replaceAll('{phase}', phase);
}

function archive(workingFile, projectRoot, phaseOverride) {
  const config = loadConfig(projectRoot);
  const paths = resolvePaths(projectRoot, config);
  ensureInside(workingFile, paths.notesDir, 'working file');

  if (!fs.existsSync(workingFile)) {
    process.stderr.write(`error: working file not found: ${workingFile}\n`);
    process.exit(2);
  }

  const now = new Date();
  const phase = pickCurrentPhase(paths, phaseOverride, config);
  let archiveName = renderArchiveName(config.archive_name_template, now, phase);
  let archivePath = path.join(paths.notesDir, archiveName);

  // Collision avoidance — add -b, -c, etc.
  let suffix = 0;
  while (fs.existsSync(archivePath)) {
    suffix++;
    const letter = String.fromCharCode('a'.charCodeAt(0) + suffix);
    const parsed = path.parse(archiveName);
    archivePath = path.join(paths.notesDir, `${parsed.name}-${letter}${parsed.ext || '.md'}`);
    if (suffix > 25) { process.stderr.write('error: too many same-day archives\n'); process.exit(2); }
  }
  archiveName = path.basename(archivePath);

  // Stamp frontmatter onto the archived content if missing
  const original = fs.readFileSync(workingFile, 'utf8');
  const stamped = stampFrontmatter(original, {
    date: now.toISOString().split('T')[0],
    phase,
    archived: now.toISOString(),
  });

  fs.writeFileSync(archivePath, stamped);

  // Scaffold a fresh WORKING.md from template
  const templatePath = path.resolve(__dirname, '..', 'templates', 'WORKING.template.md');
  const template = fs.existsSync(templatePath)
    ? fs.readFileSync(templatePath, 'utf8')
    : `# Working Notes\n\nDump thoughts, bugs, ideas here. Run /marknotes to review.\n`;

  fs.writeFileSync(workingFile, template);

  const recent = listDatedArchives(paths.notesDir);

  // Rotate: move anything beyond the keep window to archive/
  rotateArchives(paths, config.archive_keep);

  // Update manifest
  const manifest = readManifest(paths.manifestFile);
  const archived = fs.readFileSync(archivePath, 'utf8');
  const reparsedArchive = parseItems(archived);
  manifest.archives = (manifest.archives || []).filter(a => a.file !== archiveName);
  manifest.archives.unshift({
    file: archiveName,
    date: now.toISOString().split('T')[0],
    phase,
    hash: sha256(archived),
    item_count: reparsedArchive.length,
  });
  manifest.working = {
    file: path.relative(paths.notesDir, workingFile),
    hash: sha256(fs.readFileSync(workingFile, 'utf8')),
    item_count: 0,
    unreviewed: 0,
    last_reviewed: null,
  };
  writeManifest(paths.manifestFile, manifest);

  process.stdout.write(JSON.stringify({
    ok: true,
    archived_to: path.relative(projectRoot, archivePath),
    fresh_working: path.relative(projectRoot, workingFile),
    kept_in_notes_dir: Math.min(recent.length, config.archive_keep),
  }, null, 2) + '\n');
}

function stampFrontmatter(content, fields) {
  if (content.startsWith('---')) {
    // Already has frontmatter — leave it alone, user may have written it
    return content;
  }
  const fm = ['---'];
  for (const [k, v] of Object.entries(fields)) fm.push(`${k}: ${v}`);
  fm.push('---', '');
  return fm.join('\n') + content;
}

function listDatedArchives(notesDir) {
  if (!fs.existsSync(notesDir)) return [];
  return fs.readdirSync(notesDir)
    .filter(f => /^\d{2}-\d{2}_phase[\w.-]+\.md$/.test(f) || /^\d{4}-\d{2}-\d{2}[_-].*\.md$/.test(f))
    .sort()
    .reverse();
}

function rotateArchives(paths, keep) {
  const all = listDatedArchives(paths.notesDir);
  if (all.length <= keep) return;
  const overflow = all.slice(keep);
  if (!fs.existsSync(paths.archiveDir)) fs.mkdirSync(paths.archiveDir, { recursive: true });
  for (const f of overflow) {
    const from = path.join(paths.notesDir, f);
    const to = path.join(paths.archiveDir, f);
    if (fs.existsSync(to)) fs.unlinkSync(to);
    fs.renameSync(from, to);
  }
}

// ---- main -------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args._[0];
  const workingFile = args._[1] ? path.resolve(args._[1]) : null;
  const projectRoot = args.project ? path.resolve(args.project) : process.cwd();
  if (args.config) process.env.NOTE_MARKER_CONFIG = args.config;

  if (mode === 'apply') {
    const updatesPath = args._[2] ? path.resolve(args._[2]) : null;
    if (!workingFile || !updatesPath) {
      process.stderr.write('usage: postprocess.js apply <working-file> <updates.json>\n');
      process.exit(2);
    }
    apply(workingFile, updatesPath, projectRoot);
  } else if (mode === 'archive') {
    if (!workingFile) {
      process.stderr.write('usage: postprocess.js archive <working-file> [--phase N]\n');
      process.exit(2);
    }
    archive(workingFile, projectRoot, args.phase);
  } else {
    process.stderr.write('usage: postprocess.js <apply|archive> <working-file> ...\n');
    process.exit(2);
  }
}

main();
