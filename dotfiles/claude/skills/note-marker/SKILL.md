---
name: note-marker
description: Review and annotate testing notes. Use when the user runs /marknotes. Reads unreviewed items from a configurable working notes file, classifies each against configured planning/context files, and writes a **STATUS** [#N] line under each item indicating whether it is DONE, TRACKED, NOT TRACKED, NEEDS TRIAGE, or DEFERRED.
---

# Note Marker — `/marknotes`

Takes a free-form testing-notes file and annotates each item with a one-line
STATUS saying whether it is already tracked in planning, shipped, or needs
a new phase / quick task. Never modifies planning files — suggestions only.

## Command

```
/marknotes [file] [--archive] [--refresh] [--init] [--write-config] [--config path]
```

- `file` — optional. Defaults to the configured working file in the project root.
- `--archive` — after marking, rename the working file to `MM-DD_phaseN.md`, scaffold a fresh `WORKING.md`, and rotate older archives.
- `--refresh` — re-review items that already have a STATUS (normally skipped).
- `--init` — scaffold `notes/testing/` in the current project. Run this once per project.
- `--write-config` — with `--init`, also scaffold the config file if it does not exist.
- `--config path` — use an explicit project config file for this run.

## Execution runbook

When the user invokes this command:

### 1. Resolve the skill installation root

Resolve the skill root in this order:

1. `$NOTE_MARKER_HOME`
2. `$HOME/.claude/skills/note-marker`
3. `$PWD/dotfiles/claude/skills/note-marker`

Verify `<root>/scripts/preprocess.js` exists; abort with a clear error if not.
Use that resolved root as `NOTE_MARKER_HOME` in the commands below.

### 2. Handle `--init` upfront

If the `--init` flag is present, run:

```bash
node $NOTE_MARKER_HOME/scripts/init.js --project "$PWD" [--write-config] [--config <path>]
```

Include `--config <path>` if supplied by the user. Parse the JSON response,
report the created files, skipped files, config file, and stop.

### 3. Preprocess

Run the preprocessor to get a compact JSON payload — just the unreviewed
items plus the planning context. This is the only time a markdown file is
read during the run; do NOT read `WORKING.md` directly yourself.

```bash
node $NOTE_MARKER_HOME/scripts/preprocess.js [file] [--refresh] [--config <path>] --project "$PWD"
```

If `unreviewed_count` is 0 and `--refresh` was not set, report "Nothing to
review" and stop. If `--archive` was requested, continue to step 6.

### 4. Classify each item

For every item in `payload.items`, produce one `**STATUS** [#N]:` line using
`payload.context` and especially `payload.context.reference_files`. These
rules apply in order; first match wins:

Every STATUS line must begin with `**STATUS** [#N]:` where `N` is the item's `id` from the payload.

| Test | STATUS line |
|---|---|
| Item describes something clearly shipped by a completed phase (check `context.completed_phases` + any SUMMARY references in roadmap) | `**STATUS** [#N]: DONE — Phase X[-YY]` |
| Item appears in an in-progress phase's success criteria (`context.in_progress_phases`) | `**STATUS** [#N]: TRACKED — Phase X (in progress)` |
| Item appears in a planned phase's success criteria or blurb (`context.planned_phases`) | `**STATUS** [#N]: TRACKED — Phase X` |
| Partially covered — a planned phase addresses part of it but a gap remains | `**STATUS** [#N]: PARTIALLY TRACKED — Phase X covers [brief], [gap]` |
| Unplanned but fits cleanly into an existing planned phase's scope | `**STATUS** [#N]: NOT TRACKED → fits Phase X (planned) [TAG]` |
| Unplanned and doesn't map to any existing phase | `**STATUS** [#N]: NOT TRACKED → Proposed Phase Y (NEW): <short name> [TAG]` |
| Bug, crash, regression, or blocker that needs diagnosis | `**STATUS** [#N]: NEEDS TRIAGE — <brief>. Route to /gsd:debug.` |
| Explicitly deferred in any configured context file | `**STATUS** [#N]: DEFERRED — <ref>` |

**`[TAG]` is required on any NOT TRACKED item.** Choose one:

- `[QUICK]` — single file, single function, or contained bug fix. Small enough for `/gsd:quick`.
- `[SUB-PHASE]` — decimal phase like `26.1`. Moderate scope, no research needed.
- `[RESEARCH]` — multi-component or architectural. Needs `/gsd:research-phase` before planning.

**Proposed phase numbering rule:** when suggesting a NEW phase, pick the next
integer *after the highest planned phase number* in `context.planned_phases`.
Use decimals (e.g. `26.1`) only for SUB-PHASE tags. Mark the phase `(NEW)`
when it doesn't exist; mark it `(planned)` when you're fitting into an existing
entry.

**Never modify ROADMAP.md, REQUIREMENTS.md, STATE.md, PROJECT.md, phase files,
or any configured planning/context file.**
Your job is only to emit suggestions in the STATUS line.

**Evidence style:** cite phase numbers only (e.g. `Phase 22-03`, `Phase 17.1`).
Do not cite `file:line` — the user doesn't want that level of detail.

**Ambiguity escalation:** if an item's classification is genuinely unclear —
for example, a planned phase *might* cover it but the success criteria are
vague — it's fine to emit a `PARTIALLY TRACKED` with a note about what to
verify. Do not guess with false confidence.

### 5. Write the updates file

Write a temp file at `/tmp/marknotes-updates-$$.json`:

```json
{
  "updates": [
    { "id": 1, "status_line": "**STATUS** [#1]: DONE — Phase 22-03" },
    { "id": 2, "status_line": "**STATUS** [#2]: NOT TRACKED → Proposed Phase 27 (NEW): Vehicle Preset Overhaul [RESEARCH]" }
  ]
}
```

Then apply it:

```bash
node $NOTE_MARKER_HOME/scripts/postprocess.js apply <working-file> /tmp/marknotes-updates-$$.json [--config <path>] --project "$PWD"
```

Parse the response. It reports `applied`, `skipped`, `unreviewed_remaining`.

### 6. If `--archive`, rotate

```bash
node $NOTE_MARKER_HOME/scripts/postprocess.js archive <working-file> [--config <path>] --project "$PWD"
```

The postprocessor will:
- Pick the current phase from the configured state/roadmap context, or fall back to the first planned phase
- Rename the working file using `archive_name_template` with frontmatter stamped
- Scaffold a fresh working file from the template
- Rotate archives older than the configured `archive_keep` window into the configured archive directory

### 7. Report to the user

Summarize succinctly:

- Count of items marked, bucketed by status (e.g. "2 DONE, 1 TRACKED, 3 NOT TRACKED, 1 NEEDS TRIAGE")
- If any items were flagged NEEDS TRIAGE, call them out prominently — these are the user's next action items
- If any items were flagged NOT TRACKED with `[RESEARCH]` tag, mention them as candidates for `/gsd:discuss-phase` or `/gsd:research-phase`
- If `--archive` ran, give the new archive filename
- Leave the `unreviewed_remaining` count so the user knows if anything slipped through

## Safety invariants

- Never read the full working file contents directly — always go through the preprocessor.
- Never write to any file outside the configured `notes_dir`, except when `--init --write-config` is explicitly requested.
- Never mutate planning files (ROADMAP, REQUIREMENTS, STATE, or phase dirs).
- Running `/marknotes` twice without `--refresh` is a no-op on already-marked items.

## Per-project config

Optional: `<project>/.claude/note-marker.json` overrides defaults. You can
also set `NOTE_MARKER_CONFIG` or pass `--config <path>`:

```json
{
  "claude_dir": ".claude",
  "config_file": "note-marker.json",
  "notes_dir": "notes/testing",
  "working_file": "WORKING.md",
  "manifest_file": "MANIFEST.json",
  "archive_dir": "archive",
  "archive_name_template": "{MM}-{DD}_phase{phase}.md",
  "planning_dir": ".planning",
  "project_file": "PROJECT.md",
  "roadmap_file": "ROADMAP.md",
  "requirements_file": "REQUIREMENTS.md",
  "state_file": "STATE.md",
  "phases_dir": "phases",
  "context_files": [],
  "max_context_chars_per_file": 20000,
  "archive_keep": 5
}
```

If no config is present, defaults in `scripts/lib.js` apply.
