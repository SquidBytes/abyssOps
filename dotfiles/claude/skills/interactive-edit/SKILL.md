---
name: interactive-edit
description: Walk through a code change interactively before applying it. Use when the user runs /iedit. Analyzes the target file(s), groups candidate changes into a small number of decision buckets, asks the user about each bucket via AskUserQuestion (surfacing tradeoffs in plain English with code previews), then shows a full plan and applies the edits only after a final confirm. Behavior is steered by an optional preset (presets/<name>.md). Sessions checkpoint to disk so `/iedit --resume` picks up where you left off if you stop, /clear, or run out of context.
---

# Interactive Edit — `/iedit`

Takes a target file (or files) plus a task description, then walks through
the change in three phases: **analyze → bucketed Q&A → confirm & apply**.
The point is to surface choices and their consequences *before* editing,
not to silently best-guess a large change.

Designed for users who are still learning the topic. Every option is
explained in plain English with a small before/after preview, and the
matched preset's **Best practices** section feeds the recommendations.

## Command

```
/iedit <file> [more files...] "<task description>"
/iedit --resume [<id>]
/iedit --list
/iedit --abandon [<id>]
```

Examples:

- `/iedit src/app.py "add mypy type annotations"`
- `/iedit src/parser.py src/lexer.py "convert to dataclasses"`
- `/iedit --resume` — pick up the most recent pending session for this project.
- `/iedit --list` — show pending sessions.

## Execution runbook

### 1. Resolve the skill installation root

Resolve `INTERACTIVE_EDIT_HOME` in this order:

1. `$INTERACTIVE_EDIT_HOME`
2. `$HOME/.claude-personal/skills/interactive-edit`
3. `$HOME/.claude/skills/interactive-edit`
4. `$PWD/dotfiles/claude/skills/interactive-edit`

Verify `<root>/presets/_generic.md` exists; abort with a clear error if not.

### 2. Parse the invocation

First, handle session-management flags. These short-circuit the rest of
the runbook:

- `--list` — read all state files matching this project, print a table
  (id, started, task, phase, % complete). Stop.
- `--abandon` — delete the most recent pending session (or the one
  identified by `<id>`). Stop.
- `--resume` — load the most recent pending session for this project
  (or the one identified by `<id>`) and jump to **§ Sessions & resume**.

For a regular invocation:

1. Split the args into target files (paths) and the task description
   (the quoted free-text string). If any target file does not exist,
   stop and report. If no task description is given, ask for one before
   continuing.
2. **Auto-detect pending sessions.** Look in
   `~/.claude-personal/state/interactive-edit/` for any session JSON
   where `project == $PWD`, `files` overlap the requested targets, and
   `phase != "applied"`. If a match exists, AskUserQuestion:
   > "Found a pending session from <relative time> on these files
   > (bucket <N>/<M>). Resume or start fresh?"
   - **Resume** — jump to **§ Sessions & resume**.
   - **Start fresh** — archive the old state file to `completed/` and
     continue.
   - **Cancel** — stop.

### 3. Match a preset

Read each `presets/*.md` frontmatter. Pick the first preset whose
`triggers:` list contains a substring of the task description
(case-insensitive). If nothing matches, load `_generic.md`. State which
preset was chosen in one line ("Using preset: types-python") so the user
can correct it before analysis runs.

### 4. Analyze

Read each target file in full. Enumerate every candidate location for the
change requested. For each candidate, capture:

- `file:line` location
- Current state (the existing code at that location)
- The *kind* of change (which bucket it belongs to — see preset)
- Any cross-references that suggest a tradeoff (callers, return value
  usage, exception handlers, etc.)

If there are zero candidates, report "Nothing to change in <file>" and
stop. If there is exactly one candidate, skip bucketing — go straight to
step 7 (plan + confirm) with a single-line plan.

### 5. Categorize into buckets

Group candidates into **2 to 5 buckets**, no more. A bucket is a set of
candidates that share the same *type of decision*. The preset declares
the bucket templates; if using `_generic.md`, derive buckets from the
task description on the fly and state them in one line each.

Inside a bucket, candidates can still differ in detail — that is what
makes the bucket worth asking about. Do **not** create a bucket with
fewer than 2 candidates unless it represents a genuinely distinct
decision; merge singletons into the closest sibling bucket.

**Checkpoint.** Write the initial state file (see § Sessions & resume).

### 6. Ask per bucket, in order

Follow **§ Explanation style** exactly. For each bucket, call
**AskUserQuestion** with one question:

- **question** — 1–2 sentences of plain-language intro to the category
  (what it is, why it matters), then the count, then the actual
  question.
- **header** — short chip label (≤ 12 chars).
- **options** — 2–4 options. Each option must have `label`,
  `description` (plain English: *what changes* + *what it means for
  callers/tests/runtime*), and a `preview` (small before/after code
  snippet — single-select buckets only).

Quote 1–2 concrete `file:line` examples from the candidates inside the
question text so the user can see what is actually being changed.

If the matched preset has a `## Best practices` section, mark the
preset-recommended option with **(Recommended)** in its label and
include a short *why* phrase in its description.

If a bucket has more than 4 plausible options, split into two questions
or use `multiSelect: true` for "apply X to these subsets". `preview` is
not supported on multiSelect — fall back to richer descriptions.

If the user picks "Other" (free-text), treat it as authoritative and
adjust the plan accordingly.

**Checkpoint.** After each answer, append to the state file's `answers`
array and bump `next_bucket_index`.

### 7. Build the plan

Synthesize the answers into a concrete change list. Show it as a single
fenced block:

```
PLAN (N changes across M files)

src/app.py
  L42  add return type → Optional[dict]
  L58  add param type   → list[str]
  L73  add return type → None
  ...

src/parser.py
  L11  ...
```

Group by file, list every change, keep each line short. Below the block,
note any pre-apply checks (e.g. "will run `mypy src/app.py` after").

**Checkpoint.** Write the full plan to the state file and set
`phase: "planned"`.

### 8. Final confirm

Call **AskUserQuestion** once:

- question: "Apply this plan?"
- options:
  - **Apply** — make the edits as listed.
  - **Modify** — loop back to bucket questions. Ask which bucket to
    revisit, then re-run step 6 for that bucket only, then re-build the
    plan.
  - **Cancel** — stop without changes. The state file is preserved so
    you can `/iedit --resume` later.

### 9. Apply

If confirmed, use the `Edit` tool to make each change. Apply edits
file-by-file. After all edits, if the preset declares a `verifier:` (or
the first available command in `verifier_candidates:`), run it and
surface the output verbatim — do not auto-fix failures; report them and
let the user decide.

On success, move the state file to
`~/.claude-personal/state/interactive-edit/completed/` so the project
keeps a short history without cluttering active sessions.

## Explanation style

Audience: the user is learning the topic. Default tone is plain English,
short sentences, no jargon without a one-line gloss the first time it
appears.

### Bucket intro (the `question` field)

Open with 1–2 sentences explaining what this *category of decision* is,
why it exists, and what it affects. Then state the count. Then ask the
actual question.

Good:
> "When a function looks up something that might not exist, it has to
> tell the caller somehow. Right now 6 functions in this file return
> `None` silently — we need to make that explicit so other code knows
> to check. How should these signal 'not found'?"

Bad:
> "Optional handling? (6 candidates)"

### Per option

Required fields:

- **label** — the choice in plain words. Not type syntax alone.
  *Good:* "Return `Optional[dict]` when not found".
  *Bad:* "`Optional[dict]`".
- **description** — 1–2 sentences answering:
  1. *What changes in the code?*
  2. *What does that mean for me, for callers, for tests?*
- **preview** — small before/after snippet (single-select only). Use
  real code from the file when possible.

Define a term the first time it appears in a description. Examples:
- `Optional[X]` → "X or None"
- `Protocol` → "an interface — any class with these methods counts"
- `TypeVar` → "a placeholder meaning 'remember whatever type came in'"
- `Union[A, B]` → "either A or B"

Reserve theory vocabulary (covariance, invariant, monad) for cases
where it changes the decision. If it doesn't, don't say it.

### Drawing on Best practices

If the matched preset has a `## Best practices` section, treat it as
authoritative for **tone** and **recommendations**:

- Mark the preset-favored option with **(Recommended)** in its label.
- Include a short *why* phrase in that option's description ("the
  community style guides this because...").
- Do not invent best practices the preset does not state. If the user
  asks "which is best?" and the preset is silent, say so.

## Sessions & resume

Long interactive runs can be interrupted: stepping away, `/clear`,
context overflow, or stopping to inspect something. The skill
checkpoints to disk so any `/iedit` invocation can pick up cleanly.
**Nothing critical lives in Claude's context.**

### State file

Location: `~/.claude-personal/state/interactive-edit/<id>.json`
Completed sessions move to `.../interactive-edit/completed/<id>.json`.

`<id>` format: `iedit-<YYYYMMDD-HHMM>-<short-project-hash>`.

Schema:

```json
{
  "id": "iedit-20260514-1430-a7c3",
  "started_at": "2026-05-14T14:30:00Z",
  "project": "/home/rmasters/Documents/projects/abyssOps",
  "task": "add mypy type annotations",
  "preset": "types-python",
  "files": ["src/app.py"],
  "file_hashes": {"src/app.py": "sha256:..."},
  "candidates": [{"file": "src/app.py", "line": 42, "bucket": 0, "current": "def find_user(id):"}],
  "buckets": [{"id": 0, "title": "Return types", "intro": "..."}],
  "answers": [{"bucket": 0, "choice_label": "Return Optional[dict]", "choice_value": "Optional[dict]"}],
  "plan": null,
  "phase": "asking",
  "next_bucket_index": 1
}
```

### When to write

- After **step 5** (Categorize): write initial state, `phase: "asking"`,
  `next_bucket_index: 0`.
- After each answer in **step 6**: append to `answers`, bump
  `next_bucket_index`.
- After **step 7** (Build the plan): write `plan`, set
  `phase: "planned"`.
- After **step 9** (Apply) on success: move file to `completed/`.

### Resume behavior

When entering via `--resume` or via the auto-detect prompt in step 2:

1. Read the state file.
2. Re-hash each file in `files`. Compare to `file_hashes`. If any
   differs, the file was edited between sessions. AskUserQuestion:
   - **Re-analyze keeping prior answers as defaults** — re-run step 4
     against the current file, map old answers onto matching buckets,
     ask only for new/changed ones.
   - **Show me what changed first** — run `git diff <file>` and surface
     the output, then re-ask.
   - **Abandon and start fresh** — move state to `completed/`, restart.
3. If no drift, jump to `phase`:
   - `"asking"` → resume step 6 at `next_bucket_index`.
   - `"planned"` → re-show the plan, jump to step 8.

### Flag behavior

- `--resume` — most recent pending session for `$PWD`; if multiple,
  list and ask which.
- `--resume <id>` — resume the specified session by id.
- `--list` — print pending sessions for `$PWD`: id, started (relative),
  task, phase, `next_bucket_index/len(buckets)`.
- `--abandon [<id>]` — move to `completed/` (do not delete — preserves
  history).

## Hard nos

- Never edit any target file before step 9.
- Never present more than 5 buckets or more than 4 options per question.
- Never invent file paths, function names, or line numbers — every
  candidate must come from a file you actually read in step 4.
- Never skip the final confirm in step 8, even if a previous answer
  was "apply to all".
- Never auto-retry a failed verifier; report and stop.
- Never delete a state file outright; move it to `completed/` so the
  user can recover.
- Never invent best practices a preset does not state. Silence is fine.

## Output shape

A successful run leaves:
- The target file(s) edited with the agreed changes.
- A short summary line: "Applied N changes across M files. Verifier:
  <pass|fail|n/a>."
- The state file moved to `completed/`.
- No new files written by the skill itself outside the state directory.
