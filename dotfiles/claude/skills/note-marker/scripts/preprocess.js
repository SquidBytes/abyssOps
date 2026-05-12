#!/usr/bin/env node
// preprocess.js — extract unreviewed items and planning context as JSON.
//
// Usage:
//   node preprocess.js [<working-file>] [--refresh] [--project <dir>] [--config <file>]
//
// Defaults:
//   working-file = <project>/notes/testing/WORKING.md
//   project      = $PWD
//
// Output (stdout): JSON payload the agent uses to classify items.

const fs = require('fs');
const path = require('path');
const {
  loadConfig,
  resolvePaths,
  parseItems,
  loadContext,
  sha256,
  readManifest,
} = require('./lib');

function parseArgs(argv) {
  const args = { refresh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--refresh') args.refresh = true;
    else if (a === '--project') args.project = argv[++i];
    else if (a === '--config') args.config = argv[++i];
    else if (!args.file && !a.startsWith('--')) args.file = a;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = args.project ? path.resolve(args.project) : process.cwd();
  if (args.config) process.env.NOTE_MARKER_CONFIG = args.config;
  const config = loadConfig(projectRoot);
  const paths = resolvePaths(projectRoot, config);
  const workingFile = args.file ? path.resolve(args.file) : paths.workingFile;

  if (!fs.existsSync(workingFile)) {
    process.stderr.write(`error: working file not found: ${workingFile}\n`);
    process.stderr.write(`hint: run 'node scripts/init.js' to scaffold\n`);
    process.exit(2);
  }

  const content = fs.readFileSync(workingFile, 'utf8');
  const allItems = parseItems(content);
  const items = args.refresh ? allItems : allItems.filter(i => !i.reviewed);

  const context = loadContext(paths, config);

  // Build a compact payload. Drop fields the agent doesn't need.
  const payload = {
    working_file: path.relative(projectRoot, workingFile),
    project_root: projectRoot,
    config_file: paths.configPath ? path.relative(projectRoot, paths.configPath) : null,
    config: {
      status_marker_format: config.status_marker_format,
      notes_dir: path.relative(projectRoot, paths.notesDir),
      planning_dir: paths.planningDir ? path.relative(projectRoot, paths.planningDir) : null,
      projects: context.projects,
    },
    refresh: args.refresh,
    total_items: allItems.length,
    unreviewed_count: allItems.filter(i => !i.reviewed).length,
    items: items.map(i => ({
      id: i.id,
      heading_path: i.heading_path,
      first_line: i.first_line,
      text: i.text,
      reviewed: i.reviewed,
    })),
    context: {
      current_phase: context.current_phase,
      projects: context.projects,
      planned_phases: context.planned_phases.map(p => ({
        num: p.num, name: p.name, project: p.project || null, goal: p.goal || null,
        plan_status: p.plan_status || null, blurb: p.blurb || null,
      })),
      in_progress_phases: context.in_progress_phases.map(p => ({
        num: p.num, name: p.name, project: p.project || null, goal: p.goal || null, plan_status: p.plan_status || null,
      })),
      completed_phases: context.completed_phases.map(p => ({
        num: p.num, name: p.name, project: p.project || null,
      })),
      requirements: context.requirements,
      reference_files: context.reference_files,
    },
    manifest: readManifest(paths.manifestFile),
    content_hash: sha256(content),
  };

  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

main();
