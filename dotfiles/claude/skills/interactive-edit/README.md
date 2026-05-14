# Interactive Edit (`/iedit`)

A Claude Code skill that walks through a code change interactively before
applying it. Instead of asking Claude to "add mypy to this file" and
getting one large diff, you get:

1. **Analysis** of the target file(s).
2. **A handful of decisions** — bucketed by the *type* of choice, not by
   line number. Each option lists what changes and what callers/tests
   will need to handle.
3. **A full plan** showing every edit that would be made.
4. **One final confirm**, then the edits happen.

It is steered by **presets** — small markdown files that tell Claude how
to categorize candidates and what tradeoffs to surface for a particular
kind of task.

## Install

```sh
./install.sh
```

Symlinks this directory into `~/.claude-personal/skills/interactive-edit`.
Override the install location with `INTERACTIVE_EDIT_INSTALL_DIR=...`.

```sh
./install.sh --check    # is it installed and pointing here?
./install.sh --remove   # remove the symlink
```

Because it's a symlink, any edits in this directory take effect on the
next Claude session — no reinstall needed.

## Usage

```
/iedit <file> [more files...] "<task description>"
/iedit --resume [<id>]
/iedit --list
/iedit --abandon [<id>]
```

Examples:

```
/iedit src/app.py "add mypy type annotations"
/iedit src/parser.py src/lexer.py "convert these to dataclasses"
/iedit api/handlers.py "add structured logging to each handler"
/iedit --resume                   # continue the most recent pending session
/iedit --list                     # show pending sessions for this project
```

Each bucket question uses `AskUserQuestion` with a `preview` field, so
options render side-by-side with a small before/after code snippet —
not just a label. Designed for working through choices when you are
still learning the topic.

## Sessions & resume

A session can be interrupted at any point — you step away, you hit
`/clear`, or the context window fills up. The skill checkpoints state
to disk after every meaningful step, so re-entering picks up cleanly.

**State files** live in `~/.claude-personal/state/interactive-edit/`,
keyed by id (`iedit-<YYYYMMDD-HHMM>-<short-project-hash>`). Completed
sessions move to `.../completed/` rather than getting deleted, so
nothing is ever lost outright.

**Auto-detect.** A plain `/iedit <files> "..."` invocation will notice
a pending session for those files and ask whether to **Resume**,
**Start fresh**, or **Cancel** before doing anything else. No flag
required.

**On file drift.** If files on disk changed between sessions (different
hash than recorded), the skill stops and asks whether to re-analyze
keeping prior answers as defaults, see a diff first, or abandon.

See `SKILL.md` for the full state file schema and resume semantics.

## Presets

Presets live in `presets/*.md`. Each has frontmatter declaring its
trigger keywords and (optionally) a verifier command:

```markdown
---
name: types-python
triggers:
  - mypy
  - ty
  - type annotations
verifier_candidates:
  - mypy {file}
  - ty check {file}
---
```

The skill picks the first preset whose `triggers` substring-matches the
task description. If nothing matches, it falls back to `_generic.md`.

### Adding a new preset

1. Copy `presets/_generic.md` to `presets/<your-name>.md`.
2. Edit the frontmatter — set `triggers` to the keywords that should
   activate it.
3. Define **bucket templates** in the body: the categories of decision
   the user should be asked about, with the typical options + tradeoffs
   for each.
4. Fill in **Best practices** — the canonical/idiomatic choices for
   this topic. The skill uses this to mark a `(Recommended)` option
   per bucket and to add a *why* phrase. If you leave this empty, the
   skill presents options neutrally.
5. Fill in **Tone hints** — terms to gloss on first use, analogies
   that work for newcomers, claims to avoid. Optional but useful for
   topics with their own jargon.
6. Optionally declare a `verifier:` (a shell command to run post-apply)
   or `verifier_candidates:` (a list — first available wins).

Good preset ideas:
- `dataclasses.md` — converting classes to `@dataclass`.
- `logging.md` — adding structured logging to handlers.
- `error-handling.md` — replacing bare `except:` blocks.
- `pytest-fixtures.md` — extracting setup into fixtures.

## Hard nos

The skill is configured to never:

- Edit any file before the final confirm.
- Show more than 5 buckets or more than 4 options per question.
- Invent file paths or line numbers — every candidate must come from a
  file it actually read.
- Auto-retry a failed verifier — failures are reported, not fixed.

## Layout

```
interactive-edit/
├── SKILL.md           # runbook Claude follows
├── README.md          # this file
├── install.sh         # symlink installer
└── presets/
    ├── _generic.md    # fallback
    └── types-python.md
```
