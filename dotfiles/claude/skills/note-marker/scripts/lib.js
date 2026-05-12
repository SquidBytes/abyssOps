// note-marker shared library
// Item parser, planning context loader, manifest, config resolution.
// Intentionally dependency-free — only Node builtins.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- Config -----------------------------------------------------------

const DEFAULT_CONFIG = {
  claude_dir: '.claude',
  config_file: 'note-marker.json',
  notes_dir: 'notes/testing',
  working_file: 'WORKING.md',
  manifest_file: 'MANIFEST.json',
  archive_dir: 'archive',
  archive_name_template: '{MM}-{DD}_phase{phase}.md',
  status_marker_format: 'markdown',
  planning_dir: '.planning',
  project_file: 'PROJECT.md',
  roadmap_file: 'ROADMAP.md',
  requirements_file: 'REQUIREMENTS.md',
  state_file: 'STATE.md',
  phases_dir: 'phases',
  planning_files: [],
  context_files: [],
  projects: [],
  max_context_chars_per_file: 20000,
  archive_keep: 5,
};

function loadConfig(projectRoot) {
  const candidates = [];
  if (process.env.NOTE_MARKER_CONFIG) {
    candidates.push(path.isAbsolute(process.env.NOTE_MARKER_CONFIG)
      ? process.env.NOTE_MARKER_CONFIG
      : path.resolve(projectRoot, process.env.NOTE_MARKER_CONFIG));
  }
  candidates.push(path.join(projectRoot, DEFAULT_CONFIG.claude_dir, DEFAULT_CONFIG.config_file));
  candidates.push(path.join(projectRoot, '.note-marker.json'));

  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...raw, _config_path: configPath };
    } catch (e) {
      process.stderr.write(`warn: failed to parse ${configPath}: ${e.message}\n`);
    }
  }
  return { ...DEFAULT_CONFIG, _config_path: null };
}

function resolveProjectPath(projectRoot, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
}

function resolveNotesPath(notesDir, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(notesDir, value);
}

function uniqByPath(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    if (!entry || !entry.path) continue;
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    out.push(entry);
  }
  return out;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeContextEntry(projectRoot, entry, defaults = {}) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const baseRoot = defaults.root || projectRoot;
    return {
      path: path.isAbsolute(entry) ? path.resolve(entry) : path.resolve(baseRoot, entry),
      role: defaults.role || 'context',
      label: defaults.label || entry,
      project: defaults.project || null,
    };
  }
  const baseRoot = entry.root
    ? resolveProjectPath(projectRoot, entry.root)
    : (defaults.root || projectRoot);
  const rawPath = entry.path || entry.file;
  if (!rawPath) return null;
  return {
    path: path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(baseRoot, rawPath),
    role: entry.role || defaults.role || 'context',
    label: entry.label || rawPath,
    project: entry.project || defaults.project || null,
  };
}

function defaultPlanningEntries(projectRoot, config, projectName = null, projectOverride = {}) {
  const root = projectOverride.root
    ? resolveProjectPath(projectRoot, projectOverride.root)
    : projectRoot;
  const planningDir = projectOverride.planning_dir !== undefined
    ? projectOverride.planning_dir
    : config.planning_dir;
  if (!planningDir) return [];

  const files = [
    ['project', projectOverride.project_file !== undefined ? projectOverride.project_file : config.project_file],
    ['roadmap', projectOverride.roadmap_file !== undefined ? projectOverride.roadmap_file : config.roadmap_file],
    ['requirements', projectOverride.requirements_file !== undefined ? projectOverride.requirements_file : config.requirements_file],
    ['state', projectOverride.state_file !== undefined ? projectOverride.state_file : config.state_file],
  ];

  const entries = [];
  for (const [role, fileName] of files) {
    if (!fileName) continue;
    entries.push({
      path: path.resolve(root, planningDir, fileName),
      role,
      label: path.join(planningDir, fileName),
      project: projectName,
    });
  }

  for (const entry of asArray(projectOverride.planning_files || config.planning_files)) {
    entries.push(normalizeContextEntry(projectRoot, entry, {
      root: path.resolve(root, planningDir),
      role: 'planning',
      project: projectName,
    }));
  }

  return entries;
}

function resolvePaths(projectRoot, config) {
  const claudeDir = resolveProjectPath(projectRoot, config.claude_dir);
  const notesDir = resolveProjectPath(projectRoot, config.notes_dir);
  const planningDir = config.planning_dir ? resolveProjectPath(projectRoot, config.planning_dir) : null;
  const phasesDir = planningDir ? resolveNotesPath(planningDir, config.phases_dir) : null;
  const projects = asArray(config.projects).map((project, idx) => {
    const name = project.name || project.id || `project-${idx + 1}`;
    const root = project.root ? resolveProjectPath(projectRoot, project.root) : projectRoot;
    return { ...project, name, root };
  });

  const defaultEntries = defaultPlanningEntries(projectRoot, config);
  const configuredContext = asArray(config.context_files)
    .map(entry => normalizeContextEntry(projectRoot, entry));
  const projectEntries = projects.flatMap(project => [
    ...defaultPlanningEntries(projectRoot, config, project.name, project),
    ...asArray(project.context_files).map(entry => normalizeContextEntry(projectRoot, entry, {
      root: project.root,
      project: project.name,
    })),
  ]);
  const contextEntries = uniqByPath([...defaultEntries, ...configuredContext, ...projectEntries]);

  return {
    projectRoot,
    claudeDir,
    configPath: config._config_path,
    notesDir,
    workingFile: resolveNotesPath(notesDir, config.working_file),
    manifestFile: resolveNotesPath(notesDir, config.manifest_file),
    archiveDir: resolveNotesPath(notesDir, config.archive_dir),
    planningDir,
    phasesDir,
    projectPath: planningDir ? resolveNotesPath(planningDir, config.project_file) : null,
    roadmapPath: planningDir ? resolveNotesPath(planningDir, config.roadmap_file) : null,
    requirementsPath: planningDir ? resolveNotesPath(planningDir, config.requirements_file) : null,
    statePath: planningDir ? resolveNotesPath(planningDir, config.state_file) : null,
    projects,
    contextEntries,
    contextPaths: contextEntries.map(entry => entry.path),
  };
}

// ---- Item parser ------------------------------------------------------

// Parses a markdown file into a flat list of "items".
// An item = a text block under a heading, delimited by:
//   - a new heading at any level
//   - a sibling-level bullet at equal/shallower indentation
//   - a blank line followed by a top-level paragraph (different block)
//   - a horizontal rule
// An item is considered reviewed if it contains a status marker line.
// Strip all HTML comments (single- and multi-line) while preserving line
// structure so downstream line numbers stay accurate. Replaces comment
// content with spaces and newlines only.
function stripHtmlComments(content) {
  let out = '';
  let i = 0;
  let inComment = false;
  while (i < content.length) {
    if (!inComment && content.substr(i, 4) === '<!--') {
      const end = content.indexOf('-->', i + 4);
      const comment = end === -1 ? content.slice(i) : content.slice(i, end + 3);
      if (/^<!--\s*NOTE-MARKER\b/i.test(comment)) {
        out += comment;
        i += comment.length;
        continue;
      }
      inComment = true;
      i += 4;
    } else if (inComment && content.substr(i, 3) === '-->') {
      inComment = false;
      i += 3;
    } else if (inComment) {
      // Preserve newlines so line indices stay aligned with the source
      out += content[i] === '\n' ? '\n' : ' ';
      i++;
    } else {
      out += content[i];
      i++;
    }
  }
  return out;
}

function stripYamlFrontmatter(content) {
  if (!content.startsWith('---\n')) return content;
  const end = content.indexOf('\n---', 4);
  if (end === -1) return content;
  const closeEnd = content.indexOf('\n', end + 4);
  const frontmatter = content.slice(0, closeEnd === -1 ? content.length : closeEnd + 1);
  return frontmatter.replace(/[^\n]/g, ' ') + content.slice(frontmatter.length);
}

function parseItems(content) {
  content = stripYamlFrontmatter(content);
  content = stripHtmlComments(content);
  const lines = content.split('\n');
  const items = [];
  let headingPath = [];
  let current = null;
  let nextId = 1;

  const flush = () => {
    if (!current) return;
    // Trim trailing blanks
    while (current.lines.length > 0 && current.lines[current.lines.length - 1].trim() === '') {
      current.lines.pop();
      current.endLine--;
    }
    if (current.lines.length === 0) { current = null; return; }
    const text = current.lines.join('\n');
    const reviewed = /\*\*STATUS\*\*(?:\s*\[#\d+\])?\s*:/i.test(text)
      || /<!--\s*NOTE-MARKER\b/i.test(text);
    items.push({
      id: nextId++,
      start_line: current.startLine,
      end_line: current.endLine,
      heading_path: current.headingPath.filter(Boolean),
      first_line: current.lines[0],
      indent: current.indent,
      text,
      reviewed,
    });
    current = null;
  };

  const isBullet = (line) => /^\s*([-*+]|\d+\.)\s/.test(line);
  const indentOf = (line) => line.match(/^(\s*)/)[1].length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      headingPath = headingPath.slice(0, level - 1);
      headingPath[level - 1] = headingMatch[2].trim();
      continue;
    }

    // Horizontal rule — bare `---`, `___`, `***` — acts as an item break.
    if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      continue;
    }

    if (line.trim() === '') {
      if (!current) continue;
      // Lookahead to the next non-blank line
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length) { flush(); continue; }
      const next = lines[j];
      if (/^#{1,6}\s/.test(next)) { flush(); continue; }
      const nextIndent = indentOf(next);
      const nextBullet = isBullet(next);
      if (nextBullet && nextIndent <= current.indent) { flush(); continue; }
      if (!nextBullet && nextIndent === 0 && current.indent === 0) { flush(); continue; }
      if (!nextBullet && nextIndent < current.indent) { flush(); continue; }
      // Treat as continuation
      current.lines.push(line);
      current.endLine = i;
      continue;
    }

    // Non-blank line
    if (current) {
      const lineIndent = indentOf(line);
      const lineBullet = isBullet(line);
      if (lineBullet && lineIndent <= current.indent) {
        flush();
      } else if (!lineBullet && lineIndent < current.indent) {
        flush();
      }
    }

    if (!current) {
      current = {
        startLine: i,
        endLine: i,
        headingPath: [...headingPath],
        indent: indentOf(line),
        lines: [line],
      };
    } else {
      current.lines.push(line);
      current.endLine = i;
    }
  }

  flush();
  return items;
}

// For an item block, derive the indentation a STATUS continuation line
// should use so it visually attaches to the item in markdown.
function getContinuationIndent(firstLine) {
  const bulletMatch = firstLine.match(/^(\s*)([-*+]|\d+\.)\s+/);
  if (bulletMatch) return ' '.repeat(bulletMatch[0].length);
  const plainMatch = firstLine.match(/^(\s*)/);
  return plainMatch[1];
}

// ---- Planning context loader -----------------------------------------

// Reads ROADMAP.md and extracts phase sections as simple records.
// Tolerant to formatting variations — best-effort.
function readTextLimited(filePath, maxChars) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!maxChars || text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

function appendRoadmapContext(context, filePath, project = null) {
  const roadmap = fs.readFileSync(filePath, 'utf8');

  // Extract the phase checklist (top-level summary list)
  const checklistRe = /-\s*\[([ x])\]\s*\*\*Phase\s+([\d.]+)\s*:\s*([^*]+)\*\*\s*(?:-\s*([^\n]*))?/g;
  const checklist = {};
  let m;
  while ((m = checklistRe.exec(roadmap)) !== null) {
    const status = m[1] === 'x' ? 'complete' : 'planned';
    const num = m[2].trim();
    const name = m[3].trim();
    const blurb = (m[4] || '').trim();
    checklist[num] = { num, name, blurb, status, project };
  }

  // Extract detailed phase sections
  const sectionRe = /^###\s+Phase\s+([\d.]+)\s*:\s*([^\n]+)$/gm;
  const sectionPositions = [];
  while ((m = sectionRe.exec(roadmap)) !== null) {
    sectionPositions.push({ num: m[1].trim(), name: m[2].trim(), index: m.index });
  }
  for (let i = 0; i < sectionPositions.length; i++) {
    const start = sectionPositions[i].index;
    const end = i + 1 < sectionPositions.length ? sectionPositions[i + 1].index : roadmap.length;
    const body = roadmap.slice(start, end);
    const goalMatch = body.match(/\*\*Goal\*\*:\s*([^\n]+)/i);
    const planStatusMatch = body.match(/\*\*Plans:?\*\*\s*(\d+)\s*\/\s*(\d+)/i);
    const reqMatch = body.match(/\*\*Requirements\*\*:\s*([^\n]+)/i);
    const entry = checklist[sectionPositions[i].num] || { num: sectionPositions[i].num, name: sectionPositions[i].name, status: 'planned', project };
    entry.name = sectionPositions[i].name;
    entry.project = project;
    if (goalMatch) entry.goal = goalMatch[1].trim();
    if (planStatusMatch) {
      const done = parseInt(planStatusMatch[1], 10);
      const total = parseInt(planStatusMatch[2], 10);
      entry.plan_status = `${done}/${total}`;
      if (done > 0 && done < total) entry.status = 'in_progress';
    }
    if (reqMatch) entry.requirements = reqMatch[1].replace(/[\[\]]/g, '').split(/[,\s]+/).filter(Boolean);
    checklist[sectionPositions[i].num] = entry;
  }

  for (const entry of Object.values(checklist)) {
    if (entry.status === 'complete') context.completed_phases.push(entry);
    else if (entry.status === 'in_progress') context.in_progress_phases.push(entry);
    else context.planned_phases.push(entry);
  }
}

function appendRequirementsContext(context, filePath, project = null) {
  const reqs = fs.readFileSync(filePath, 'utf8');
  const rowRe = /\|\s*([A-Z][A-Z0-9-]+)\s*\|\s*Phase\s*([\d.]+)\s*\|\s*(Complete|Pending|In Progress)\s*\|/gi;
  let m;
  while ((m = rowRe.exec(reqs)) !== null) {
    context.requirements.push({ id: m[1], phase: m[2], status: m[3], project });
  }
}

function applyStateContext(context, filePath) {
  const state = fs.readFileSync(filePath, 'utf8');
  const phMatch = state.match(/\*\*Current Phase:\*\*\s*([\d.]+)/i)
    || state.match(/Phase:\s*([\d.]+)\s*\(/);
  if (phMatch && !context.current_phase) context.current_phase = phMatch[1];
}

function loadContext(paths, config = DEFAULT_CONFIG) {
  const context = {
    planned_phases: [],
    completed_phases: [],
    in_progress_phases: [],
    requirements: [],
    current_phase: null,
    projects: (paths.projects || []).map(p => ({
      name: p.name,
      root: path.relative(paths.projectRoot, p.root || paths.projectRoot) || '.',
      planning_dir: p.planning_dir || config.planning_dir || null,
    })),
    reference_files: [],
  };

  for (const entry of paths.contextEntries || []) {
    if (!entry.path || !fs.existsSync(entry.path) || !fs.statSync(entry.path).isFile()) continue;
    if (entry.role === 'roadmap') appendRoadmapContext(context, entry.path, entry.project || null);
    if (entry.role === 'requirements') appendRequirementsContext(context, entry.path, entry.project || null);
    if (entry.role === 'state') applyStateContext(context, entry.path);
  }

  for (const entry of paths.contextEntries || []) {
    const filePath = entry.path;
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    const { text, truncated } = readTextLimited(filePath, config.max_context_chars_per_file);
    context.reference_files.push({
      path: path.relative(paths.projectRoot, filePath),
      role: entry.role || 'context',
      label: entry.label || path.basename(filePath),
      project: entry.project || null,
      truncated,
      text,
    });
  }

  return context;
}

// ---- Manifest ---------------------------------------------------------

function sha256(content) {
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return { version: 2, active_file: 'WORKING.md', working: null, archives: [] };
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.version) manifest.version = 1;
    if (!Array.isArray(manifest.archives)) manifest.archives = [];
    return manifest;
  } catch {
    return { version: 2, active_file: 'WORKING.md', working: null, archives: [] };
  }
}

function writeManifest(manifestPath, data) {
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2) + '\n');
}

function stripStatusMarkup(line) {
  return String(line || '')
    .replace(/^\s*\*\*STATUS\*\*(?:\s*\[#\d+\])?\s*:\s*/i, '')
    .trim();
}

function statusBucket(statusLine) {
  const text = stripStatusMarkup(statusLine);
  if (/^PARTIALLY TRACKED\b/i.test(text)) return 'PARTIALLY TRACKED';
  if (/^NOT TRACKED\b/i.test(text)) return 'NOT TRACKED';
  if (/^NEEDS TRIAGE\b/i.test(text)) return 'NEEDS TRIAGE';
  if (/^TRACKED\b/i.test(text)) return 'TRACKED';
  if (/^DONE\b/i.test(text)) return 'DONE';
  if (/^DEFERRED\b/i.test(text)) return 'DEFERRED';
  return text.split(/\s+/)[0] || 'UNKNOWN';
}

function escapeHtmlMarkerValue(value) {
  return String(value || '').replace(/--/g, '- -');
}

function renderHtmlStatusMarker(id, statusLine) {
  const payload = {
    id,
    status: statusBucket(statusLine),
    text: stripStatusMarkup(statusLine),
  };
  return `<!-- NOTE-MARKER ${escapeHtmlMarkerValue(JSON.stringify(payload))} -->`;
}

function renderStatusLines(update, config = DEFAULT_CONFIG) {
  const format = config.status_marker_format || 'markdown';
  const statusLine = String(update.status_line || '').trim();
  const lines = [];
  if (format === 'markdown' || format === 'both') lines.push(statusLine);
  if (format === 'html' || format === 'both') lines.push(renderHtmlStatusMarker(update.id, statusLine));
  if (lines.length === 0) lines.push(statusLine);
  return lines;
}

function extractStatusLines(text) {
  return String(text || '').split('\n').filter(line =>
    /\*\*STATUS\*\*(?:\s*\[#\d+\])?\s*:/i.test(line)
    || /<!--\s*NOTE-MARKER\b/i.test(line)
  );
}

function statusFromLine(statusLine) {
  const htmlMatch = String(statusLine || '').match(/<!--\s*NOTE-MARKER\s+({.*})\s*-->/i);
  if (htmlMatch) {
    try {
      const parsed = JSON.parse(htmlMatch[1]);
      if (parsed.status) return parsed.status;
    } catch {
      // Fall through to text-based detection.
    }
  }
  return statusBucket(statusLine);
}

function summarizeItems(items) {
  const summarized = [];
  const counts = {};
  for (const item of items) {
    const statusLines = extractStatusLines(item.text);
    if (statusLines.length === 0) continue;
    const statusLine = statusLines.find(line => /\*\*STATUS\*\*/i.test(line)) || statusLines[0];
    const status = statusFromLine(statusLine);
    counts[status] = (counts[status] || 0) + 1;
    summarized.push({
      id: item.id,
      status,
      heading_path: item.heading_path,
      line: item.start_line + 1,
      first_line: item.first_line.trim().slice(0, 160),
      status_line: statusLine.trim(),
    });
  }
  return { items: summarized, status_counts: counts };
}

function buildManifestWorking(projectRoot, paths, workingFile, content, options = {}) {
  const items = parseItems(content);
  const summary = summarizeItems(items);
  return {
    file: path.relative(paths.notesDir, workingFile),
    path: path.relative(projectRoot, workingFile),
    hash: sha256(content),
    item_count: items.length,
    reviewed: summary.items.length,
    unreviewed: items.filter(i => !i.reviewed).length,
    status_counts: summary.status_counts,
    items: summary.items,
    reference_files: options.reference_files || [],
    projects: options.projects || [],
    last_reviewed: options.last_reviewed === undefined ? new Date().toISOString() : options.last_reviewed,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  resolvePaths,
  parseItems,
  getContinuationIndent,
  loadContext,
  sha256,
  readManifest,
  writeManifest,
  renderStatusLines,
  summarizeItems,
  buildManifestWorking,
};
