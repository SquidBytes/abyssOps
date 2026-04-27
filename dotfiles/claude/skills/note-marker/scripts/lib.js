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
  planning_dir: '.planning',
  project_file: 'PROJECT.md',
  roadmap_file: 'ROADMAP.md',
  requirements_file: 'REQUIREMENTS.md',
  state_file: 'STATE.md',
  phases_dir: 'phases',
  context_files: [],
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

function resolvePaths(projectRoot, config) {
  const claudeDir = resolveProjectPath(projectRoot, config.claude_dir);
  const notesDir = resolveProjectPath(projectRoot, config.notes_dir);
  const planningDir = resolveProjectPath(projectRoot, config.planning_dir);
  const phasesDir = resolveNotesPath(planningDir, config.phases_dir);
  const configuredContext = Array.isArray(config.context_files) ? config.context_files : [];
  const defaultContext = [
    config.project_file && path.join(config.planning_dir, config.project_file),
    config.roadmap_file && path.join(config.planning_dir, config.roadmap_file),
    config.requirements_file && path.join(config.planning_dir, config.requirements_file),
    config.state_file && path.join(config.planning_dir, config.state_file),
  ].filter(Boolean);
  const contextPaths = [...new Set([...defaultContext, ...configuredContext])]
    .map(p => resolveProjectPath(projectRoot, p));

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
    projectPath: resolveNotesPath(planningDir, config.project_file),
    roadmapPath: resolveNotesPath(planningDir, config.roadmap_file),
    requirementsPath: resolveNotesPath(planningDir, config.requirements_file),
    statePath: resolveNotesPath(planningDir, config.state_file),
    contextPaths,
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

function parseItems(content) {
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
    const reviewed = /\*\*STATUS\*\*(?:\s*\[#\d+\])?\s*:/i.test(text);
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

function loadContext(paths, config = DEFAULT_CONFIG) {
  const context = {
    planned_phases: [],
    completed_phases: [],
    in_progress_phases: [],
    requirements: [],
    current_phase: null,
    reference_files: [],
  };

  if (fs.existsSync(paths.roadmapPath)) {
    const roadmap = fs.readFileSync(paths.roadmapPath, 'utf8');

    // Extract the phase checklist (top-level summary list)
    const checklistRe = /-\s*\[([ x])\]\s*\*\*Phase\s+([\d.]+)\s*:\s*([^*]+)\*\*\s*(?:-\s*([^\n]*))?/g;
    const checklist = {};
    let m;
    while ((m = checklistRe.exec(roadmap)) !== null) {
      const status = m[1] === 'x' ? 'complete' : 'planned';
      const num = m[2].trim();
      const name = m[3].trim();
      const blurb = (m[4] || '').trim();
      checklist[num] = { num, name, blurb, status };
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
      const entry = checklist[sectionPositions[i].num] || { num: sectionPositions[i].num, name: sectionPositions[i].name, status: 'planned' };
      entry.name = sectionPositions[i].name;
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

    // Bucket by status
    for (const entry of Object.values(checklist)) {
      if (entry.status === 'complete') context.completed_phases.push(entry);
      else if (entry.status === 'in_progress') context.in_progress_phases.push(entry);
      else context.planned_phases.push(entry);
    }
  }

  if (fs.existsSync(paths.requirementsPath)) {
    const reqs = fs.readFileSync(paths.requirementsPath, 'utf8');
    const rowRe = /\|\s*([A-Z][A-Z0-9-]+)\s*\|\s*Phase\s*([\d.]+)\s*\|\s*(Complete|Pending|In Progress)\s*\|/gi;
    let m;
    while ((m = rowRe.exec(reqs)) !== null) {
      context.requirements.push({ id: m[1], phase: m[2], status: m[3] });
    }
  }

  if (fs.existsSync(paths.statePath)) {
    const state = fs.readFileSync(paths.statePath, 'utf8');
    const phMatch = state.match(/\*\*Current Phase:\*\*\s*([\d.]+)/i)
      || state.match(/Phase:\s*([\d.]+)\s*\(/);
    if (phMatch) context.current_phase = phMatch[1];
  }

  for (const filePath of paths.contextPaths || []) {
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    const { text, truncated } = readTextLimited(filePath, config.max_context_chars_per_file);
    context.reference_files.push({
      path: path.relative(paths.projectRoot, filePath),
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
    return { active_file: 'WORKING.md', working: null, archives: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return { active_file: 'WORKING.md', working: null, archives: [] };
  }
}

function writeManifest(manifestPath, data) {
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2) + '\n');
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
};
