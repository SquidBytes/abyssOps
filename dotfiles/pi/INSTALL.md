# Install guide — abyssOps Pi setup

Two stages: install the universal toolkit globally once per machine, then bootstrap each project's `.pi/` via the installer skill.

## Stage 1 — Global toolkit (once per machine)

### 1. Install Pi plugins

Run these from anywhere. They install globally to `~/.pi/agent/`.

```bash
# Orchestration — sub-agents you can spawn from skills
pi install npm:@tintinweb/pi-subagents

# Workflow primitives
pi install npm:@juicesharp/rpiv-ask-user-question
pi install npm:@juicesharp/rpiv-todo

# UX and safety
pi install npm:pi-powerline-footer
pi install npm:@claaslange/pi-context-budget
pi install npm:pi-rewind

# Optional — try in isolation before keeping
pi install npm:pi-lens                 # heavy; secrets-scan + LSP + autofix
pi install npm:@aretw0/git-skills      # git/commit/gh/glab primitives
pi install npm:@ifi/oh-pi-prompts      # generic prompt templates
```

Restart Pi (or `/reload`) after the batch.

### 2. Place the universal files

Each file in this tree carries a `pi_install:` frontmatter block with its destination. The table below is the canonical map — keep both in sync if you move things.

| Source (relative to `dotfiles/pi/`) | Destination |
|---|---|
| `system-prompt/base.md` | `~/.pi/agent/AGENTS.md` (composed with gsd-overlay.md) |
| `system-prompt/gsd-overlay.md` | `~/.pi/agent/AGENTS.md` (appended below base) |
| `skills/gsd-discuss-phase/SKILL.md` | `~/.pi/agent/skills/gsd-discuss-phase/SKILL.md` |
| `skills/gsd-plan-phase/SKILL.md` | `~/.pi/agent/skills/gsd-plan-phase/SKILL.md` |
| `skills/gsd-execute-phase/SKILL.md` | `~/.pi/agent/skills/gsd-execute-phase/SKILL.md` |
| `skills/gsd-debug/SKILL.md` | `~/.pi/agent/skills/gsd-debug/SKILL.md` |
| `skills/note-marker/SKILL.md` | `~/.pi/agent/skills/note-marker/SKILL.md` (shares Node scripts with `~/.claude/skills/note-marker/scripts/`) |
| `skills/gsd-commit-guard/SKILL.md` | `~/.pi/agent/skills/gsd-commit-guard/SKILL.md` |
| `skills/gsd-install-project/SKILL.md` | `~/.pi/agent/skills/gsd-install-project/SKILL.md` |
| `rules/planning-directory.md` | `~/.pi/agent/rules/planning-directory.md` |
| `rules/commit-messages.md` | `~/.pi/agent/rules/commit-messages.md` |
| `rules/push-gates.md` | `~/.pi/agent/rules/push-gates.md` |

Path assumptions:
- `~/.pi/agent/` is Pi's user config home (verify with `pi --help` or `ls ~/.pi/agent/`). Adjust below if your Pi install uses a different path.

### 3. Two install styles

**Symlink (recommended while iterating)**

```bash
DOTFILES_PI=~/Documents/projects/abyssOps/dotfiles/pi
PI_HOME=~/.pi/agent

mkdir -p "$PI_HOME/skills" "$PI_HOME/rules"
for s in gsd-discuss-phase gsd-plan-phase gsd-execute-phase gsd-debug \
         note-marker gsd-commit-guard gsd-install-project; do
  ln -snf "$DOTFILES_PI/skills/$s" "$PI_HOME/skills/$s"
done

# note-marker shares its Node scripts with the Claude install; symlink them
# into the Pi skill so $NOTE_MARKER_HOME resolution finds them locally too.
if [ -d "$HOME/.claude/skills/note-marker/scripts" ]; then
  ln -snf "$HOME/.claude/skills/note-marker/scripts"   "$PI_HOME/skills/note-marker/scripts"
  ln -snf "$HOME/.claude/skills/note-marker/templates" "$PI_HOME/skills/note-marker/templates"
fi
ln -snf "$DOTFILES_PI/rules/planning-directory.md" "$PI_HOME/rules/planning-directory.md"
ln -snf "$DOTFILES_PI/rules/commit-messages.md"    "$PI_HOME/rules/commit-messages.md"
ln -snf "$DOTFILES_PI/rules/push-gates.md"         "$PI_HOME/rules/push-gates.md"
```

Edits to `dotfiles/pi/` then take effect on next `/reload`.

**Copy (when content has stabilized)**

Swap `ln -snf` for `cp -r` in the same loop.

### 4. Compose the global AGENTS.md

Pi reads one `AGENTS.md` at `~/.pi/agent/AGENTS.md`. Compose it from `base.md` + `gsd-overlay.md`:

```bash
cat "$DOTFILES_PI/system-prompt/base.md" \
    "$DOTFILES_PI/system-prompt/gsd-overlay.md" \
    > "$PI_HOME/AGENTS.md"
```

Re-run after editing either source. (Or symlink one and append a `cat` of the other in your shell rc.)

### 5. Verify the global setup

In a Pi session anywhere:

```
/skills            # gsd-* skills should appear, including gsd-install-project
/todos             # rpiv-todo should respond
/rewind            # pi-rewind should respond
```

Status bar should show powerline. Context-budget should be silent below 100k tokens.

## Stage 2 — Per-project bootstrap (once per project)

Open a Pi session inside the project's root directory and invoke the installer skill:

```
Run gsd-install-project for this project.
```

The skill walks you through:
- Project name and shape.
- Planning directory location (if any).
- Working-notes file (if any).
- Repo shape (mono / nested / submodule / multi).
- Push gate policy.
- Commit format and forbidden-content rules.
- PII categories and placeholders (if enabled).

It then writes:
- `<project-root>/.pi/project.yaml` — the manifest.
- `<project-root>/.pi/AGENTS.md` — project-specific overlay.
- `<project-root>/.pi/rules/pii-policy.md` — only if PII is enabled.

`/reload` Pi inside that project, and all the `gsd-*` skills will now resolve project paths through the manifest.

### Manual bootstrap (if you'd rather skip the skill)

```bash
PROJECT=~/path/to/your/project
mkdir -p "$PROJECT/.pi/rules"
cp ~/Documents/projects/abyssOps/dotfiles/pi/templates/project-manifest.yaml "$PROJECT/.pi/project.yaml"
# Edit project.yaml to taste, then write a minimal AGENTS.md alongside it.
```

The example at `examples/lightningrod/` is a fully-populated reference for a nested-repo project with strict commit hygiene and PII.

## Adding new skills / rules / overlays

Use `templates/`:
- New skill: `cp -r templates/skill-template skills/<your-skill>` and edit.
- New rule: `cp templates/rule-template.md rules/<your-rule>.md` and edit.
- New project overlay (manual): the installer skill normally produces these from `templates/system-prompt-overlay-template.md`. Copy it directly only if you want to bypass the installer.

## Known unknowns

- Exact Pi config paths (`~/.pi/agent/` vs alternatives) — verify locally and update this file if different.
- Whether `AGENTS.md` supports `@include` directives for splitting base/overlay. If yes, replace the `cat` composition with includes.
- Whether the `pi_install:` frontmatter is recognized by Pi or purely documentary. Today it's documentary; if a future Pi extension reads it, all the better.
- Exact `ctx.ui.*` and event hook signatures inside Pi extensions, should we later port the powerline statusline companion or other hook-style logic.
