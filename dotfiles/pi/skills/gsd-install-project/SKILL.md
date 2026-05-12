---
pi_install:
  destination: ~/.pi/agent/skills/gsd-install-project/SKILL.md
  scope: global
  depends_on_plugins:
    - "@juicesharp/rpiv-ask-user-question"
name: gsd-install-project
description: Bootstrap a new project with GSD-aware Pi configuration. Generates <project>/.pi/project.yaml plus a project AGENTS.md and any project-specific rule files. Use when the user says "install pi setup", "bootstrap gsd here", "set up dotfiles for this project", or invokes this skill by name.
---

# gsd-install-project

One-time per-project bootstrap. Asks the questions, writes `<project>/.pi/` from templates.

## When to activate

- User says *install pi setup*, *install gsd*, *set up dotfiles*, *bootstrap*, *scaffold this project*.
- User explicitly invokes the skill by name.
- A skill (e.g. `gsd-discuss-phase`) detected missing `<project>/.pi/project.yaml` and asked the user to run the installer.

## Pre-flight

1. Identify the project root: walk up from `cwd` until you find a `.git/` directory or the user-supplied root. If multiple `.git/` directories nest, ask the user which is the project root (the *outer* one is usually correct for the docs/planning root; the inner one is usually the code root).
2. Check whether `<project-root>/.pi/project.yaml` already exists. If yes:
   - Ask via `ask_user_question`: *update*, *overwrite*, or *abort*. Default to abort if unclear.
3. Locate the abyssOps templates directory. Default: `~/Documents/projects/abyssOps/dotfiles/pi/templates/`. If unset, ask the user.

## Discovery (read-only)

Detect what you can without asking:
- Existing planning directory: look for `.planning/`, `docs/plans/`, `planning/`, `notes/plans/`.
- Existing working notes: look for `dev/notes/WORKING.md`, `WORKING.md`, `docs/working.md`.
- Repo shape: count `.git/` directories within the tree (depth 2 max); detect git submodules via `.gitmodules`.
- Existing commit conventions: read `.gitmessage`, `CONTRIBUTING.md`, `.planning/CONVENTIONS.md` if present.
- Branch list: `git branch -a` to suggest `branching.main`, `branching.integration`, version-branch patterns.

Surface what you found in one block before asking questions, so the user can correct false detections.

## Question flow

Use **one** `ask_user_question` call with all the questions batched (Pi presents them as tabs). Defaults should reflect what discovery found.

Required answers:
- **Project name** (display string).
- **Planning root** — single-select: detected path, common alternatives, `Other`, or `None (not a GSD-shaped project)`.
- **Working notes** — single-select: detected path, common alternatives, `Other`, or `None`.
- **Repo shape** — single-select: `mono`, `nested`, `submodule`, `multi`.
- **Code root** (only if shape ≠ mono) — single-select from detected subdirs, or `Other`.
- **Push gate** — single-select: `agent_never` (recommended), `confirm_per_push`, `allowed`.
- **Commit forbidden strings** — multi-select free-text: any literal strings agents must never put in a commit message (e.g. internal path prefixes, codenames). Default empty.
- **PII enabled** — yes / no.
- **PII categories** (only if PII enabled) — multi-select: vins, names, emails, addresses, gps_coords, phone_numbers.

Skip the commits.format / allowed_types / scope_pattern questions unless the user volunteers — defaults from the template are reasonable for most projects.

## Generate

Write three files (overwrite or merge per the pre-flight decision):

### 1. `<project-root>/.pi/project.yaml`

Render from `templates/project-manifest.yaml`, filling in the answers. Preserve comments — they help the user edit by hand later.

### 2. `<project-root>/.pi/AGENTS.md`

Render from `templates/system-prompt-overlay-template.md`, dropping the authoring-notes block. Fill in repo shape, hard rules (push gates, forbidden strings), branching summary, and any project-specific MCP / tooling notes the user wants.

If the user said *None* for planning root, omit the GSD-specific sections entirely.

### 3. `<project-root>/.pi/rules/pii-policy.md` (only if PII enabled)

Render from `examples/lightningrod/rules/pii-policy.md` as a starting point. Strip LightningROD-specific examples (VINs, EVs, GPS coords). Re-populate with the categories the user selected.

## Confirm and finish

After writing, surface:
- Files created (with paths).
- One-sentence summary of what each file does.
- Reminder: project-local config is loaded by Pi on next session in this directory tree. `/reload` if Pi is already running here.
- Suggested next step: open a Pi session, exercise `gsd-discuss-phase` against an existing or new phase to verify the manifest's planning path is right.

## Hard nos

- Never write outside `<project-root>/.pi/` from this skill. Project source files are not touched.
- Never commit anything from this skill. The user reviews and commits the new `.pi/` files themselves.
- Never push.
- If `<project-root>/.pi/` would be committed to a public repo and PII is enabled, surface that explicitly — the user may want `.pi/` in `.gitignore` or to keep it in a private parent repo.

## Output shape

- `<project-root>/.pi/project.yaml` written.
- `<project-root>/.pi/AGENTS.md` written.
- `<project-root>/.pi/rules/pii-policy.md` written if PII enabled.
- One-block summary surfaced to user.
