#!/usr/bin/env node
// init.js — scaffold notes/testing/ for a new project.
//
// Creates the configured notes dir, working file, and manifest.
// Safe to run repeatedly — never overwrites existing files.
//
// Usage:
//   node init.js [--project <dir>] [--config <file>] [--write-config] [--force]

const fs = require('fs');
const path = require('path');
const { loadConfig, resolvePaths, loadContext, writeManifest, buildManifestWorking } = require('./lib');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = argv[++i];
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--write-config') args.writeConfig = true;
    else if (a === '--force') args.force = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = args.project ? path.resolve(args.project) : process.cwd();
  if (args.config) process.env.NOTE_MARKER_CONFIG = args.config;
  const config = loadConfig(projectRoot);
  const paths = resolvePaths(projectRoot, config);

  const created = [];
  const skipped = [];
  let writtenConfigPath = null;

  if (!fs.existsSync(paths.notesDir)) {
    fs.mkdirSync(paths.notesDir, { recursive: true });
    created.push(path.relative(projectRoot, paths.notesDir) + '/');
  }

  if (!fs.existsSync(paths.workingFile) || args.force) {
    const templatePath = path.resolve(__dirname, '..', 'templates', 'WORKING.template.md');
    const template = fs.existsSync(templatePath)
      ? fs.readFileSync(templatePath, 'utf8')
      : '# Working Notes\n\nDump thoughts here. Run /marknotes to review.\n';
    fs.writeFileSync(paths.workingFile, template);
    created.push(path.relative(projectRoot, paths.workingFile));
  } else {
    skipped.push(path.relative(projectRoot, paths.workingFile));
  }

  if (!fs.existsSync(paths.manifestFile) || args.force) {
    const workingContent = fs.existsSync(paths.workingFile)
      ? fs.readFileSync(paths.workingFile, 'utf8')
      : '';
    const context = loadContext(paths, config);
    writeManifest(paths.manifestFile, {
      version: 2,
      active_file: path.basename(paths.workingFile),
      config: {
        config_file: paths.configPath ? path.relative(projectRoot, paths.configPath) : null,
        status_marker_format: config.status_marker_format,
        notes_dir: path.relative(projectRoot, paths.notesDir),
        planning_dir: paths.planningDir ? path.relative(projectRoot, paths.planningDir) : null,
      },
      working: buildManifestWorking(projectRoot, paths, paths.workingFile, workingContent, {
        reference_files: context.reference_files.map(f => ({
          path: f.path,
          role: f.role,
          label: f.label,
          project: f.project,
          truncated: f.truncated,
        })),
        projects: context.projects,
        last_reviewed: null,
      }),
      archives: [],
    });
    created.push(path.relative(projectRoot, paths.manifestFile));
  } else {
    skipped.push(path.relative(projectRoot, paths.manifestFile));
  }

  if (args.writeConfig) {
    const configPath = args.config
      ? (path.isAbsolute(args.config) ? args.config : path.resolve(projectRoot, args.config))
      : path.join(paths.claudeDir, config.config_file);
    writtenConfigPath = configPath;
    if (!fs.existsSync(path.dirname(configPath))) fs.mkdirSync(path.dirname(configPath), { recursive: true });
    if (!fs.existsSync(configPath) || args.force) {
      const templatePath = path.resolve(__dirname, '..', 'templates', 'note-marker.json');
      const template = fs.existsSync(templatePath)
        ? fs.readFileSync(templatePath, 'utf8')
        : JSON.stringify(config, null, 2) + '\n';
      fs.writeFileSync(configPath, template);
      created.push(path.relative(projectRoot, configPath));
    } else {
      skipped.push(path.relative(projectRoot, configPath));
    }
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    project_root: projectRoot,
    config_file: paths.configPath
      ? path.relative(projectRoot, paths.configPath)
      : (writtenConfigPath ? path.relative(projectRoot, writtenConfigPath) : null),
    notes_dir: path.relative(projectRoot, paths.notesDir),
    created,
    skipped,
    planning_detected: fs.existsSync(paths.planningDir),
  }, null, 2) + '\n');
}

main();
