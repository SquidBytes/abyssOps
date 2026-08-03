# Claude Code output styles

An output style replaces Claude Code's default tone-and-style instructions for
every response in a session. Tool use, permissions, and safety behaviour are
untouched — only how it writes.

## Styles

### `short-and-visual.md` — "Short & Visual"

Two halves:

- **Response shape** — line 1 is the next action; structured content renders as a
  table, numbered list, diff, or tree instead of prose; state restated every turn;
  tangents parked; no preamble, recap, or closers; **no time estimates ever**.
- **Codebase prose** — comments explain *why* not *what*; docstrings, log lines,
  and commit messages must be readable cold, with no internal IDs or
  cross-references to planning docs. Sourced from the "Writing for humans" block
  in `~/Documents/tcm-docs/CLAUDE.md`.

Both halves have an escape hatch (`When to break the shape`) so "explain this to
me" still gets a full explanation and destructive actions still get a confirm.

If a machine already has a hand-written `short-and-visual.md` in
`~/.claude/output-styles/`, `install.sh` refuses to overwrite it. Delete the local
copy first, then re-run.

## Install

```sh
./install.sh
```

Symlinks each `*.md` here into `~/.claude/output-styles/`. Then pick it with
`/output-style` inside Claude Code.

```sh
./install.sh --check    # installed and pointing here?
./install.sh --remove   # remove the symlinks
```

For a second account or a work machine with a different config dir:

```sh
OUTPUT_STYLES_INSTALL_DIR=$HOME/.claude-work/output-styles ./install.sh
```

Because they're symlinks, edits here take effect on the next Claude session.

## Notes

- `/output-style` records the choice in a settings file for the project you ran
  it from. To make it the default on every project on a machine, add
  `"outputStyle": "Action First"` to `~/.claude/settings.json`.
- The style name shown in `/output-style` comes from the `name:` frontmatter
  field, not the filename.
