# Note Marker

A Claude Code skill (`/marknotes`) for reviewing testing-notes files and
annotating each item with a one-line **STATUS** that says whether it's already
tracked in planning, shipped in a completed phase, needs a new phase, or
should be triaged as a bug.

**Designed for the workflow where you dump thoughts into a working file as
you test/use a project, then periodically have an agent sweep through and
tell you what's already covered and what's genuinely new.**

---

## Why

You test your project, notice things, write them down. Over time the notes
pile up. Some are already tracked in a planned phase. Some have already
shipped and you forgot. Some are genuinely new. Figuring out which is which
by hand every time is the friction this skill removes.

`/marknotes` hands each unreviewed item to an agent that reads your project's
configured planning/context files, classifies it, and writes a
`**STATUS** [#N]:` line directly under it. Run `/marknotes --archive` when you're ready to close
out the current batch and start fresh — your file is renamed to
`MM-DD_phaseN.md`, a new `WORKING.md` is scaffolded, and older archives roll
off into a subfolder.

---

## Installation

### One-time: install the skill globally

```bash
cd dotfiles/claude/skills/note-marker
./install.sh
```

This symlinks `~/.claude/skills/note-marker` to this directory. Claude Code
discovers it and `/marknotes` becomes available in every project on the next
session start. Because the install is a symlink, edits made in `abyssOps` are
picked up without reinstalling.

To move this project later, re-run `./install.sh` from the new location. To
uninstall: `./install.sh --remove`.

If you want a non-default install target:

```bash
NOTE_MARKER_INSTALL_DIR="$HOME/.claude/skills" NOTE_MARKER_SKILL_NAME="note-marker" ./install.sh
```

If you want to run without installing the symlink, set `NOTE_MARKER_HOME`:

```bash
export NOTE_MARKER_HOME=/path/to/abyssOps/dotfiles/claude/skills/note-marker
```

### Per project: one-time scaffold

The first time you use it in a project:

```
/marknotes --init
```

This creates `notes/testing/WORKING.md` (from the template), `MANIFEST.json`,
and verifies the planning directory is detectable. Safe to run repeatedly —
it won't overwrite existing files.

Use `/marknotes --init --write-config` to also scaffold the default config
file into the target project.

If your project doesn't use the defaults (`notes/testing/` +
`.planning/ROADMAP.md`), drop a config at `.claude/note-marker.json`, set
`NOTE_MARKER_CONFIG`, or pass `--config path/to/note-marker.json`:

```json
{
  "claude_dir": ".claude",
  "config_file": "note-marker.json",
  "notes_dir": "docs/notes",
  "working_file": "WORKING.md",
  "manifest_file": "MANIFEST.json",
  "archive_dir": "archive",
  "archive_name_template": "{YYYY}-{MM}-{DD}_phase{phase}.md",
  "planning_dir": ".planning",
  "project_file": "PROJECT.md",
  "roadmap_file": "ROADMAP.md",
  "requirements_file": "REQUIREMENTS.md",
  "state_file": "STATE.md",
  "phases_dir": "phases",
  "context_files": [
    "docs/product-notes.md"
  ],
  "max_context_chars_per_file": 20000,
  "archive_keep": 5
}
```

A copy is shipped at `templates/note-marker.json` for reference.

---

## Writing rules (read these)

The parser is strict about a small number of things so it can reliably find
the boundary of each "item" without forcing you to add syntax to everything.

1. **Each item is one paragraph or one top-level bullet.** Numbered (`1. foo`)
   or dashed (`- foo`) — either works. Blank lines separate items.
2. **Nested content stays with its parent.** Indented bullets and wrapped
   lines under a top-level bullet are treated as continuation of that item,
   not as separate items.
3. **Use `---` on its own line to break between dates, topics, or phases.**
   Not `---- some label` — put labels on a heading instead.
4. **Use `## <heading>` for date/section markers.** E.g. `## 11 April 2026`
   or `## After Phase 25`. The agent uses the heading path as context when
   classifying items.
5. **Don't write `**STATUS** [#N]:` yourself.** The agent adds it. If a line with
   a status marker appears inside an item block, that item is considered
   reviewed and the agent will skip it on subsequent runs (unless you pass
   `--refresh`).
6. **Anything under a heading is an item and will be reviewed.** Including
   context paragraphs — if something is *not* meant to be reviewed, put it in
   a blockquote or an HTML comment instead.

The `WORKING.md` template has these rules embedded as an HTML comment at the
top of the file so you see them every time you open a fresh notes file.

---

## Directory layout (per project)

```
notes/testing/
├── WORKING.md              ← your single working file. write here.
├── MANIFEST.json           ← tool-managed bookkeeping (committed)
├── 04-11_phase26.md        ← most recent archive
├── 04-09_phase25.md
├── 04-05_phase24.md
├── 03-29_phase22.md
├── 03-26_phase21.md        ← oldest of the rolling 5 kept in-dir
└── archive/
    ├── 03-15_phase20.md    ← pushed out of the rolling 5, still on disk
    └── ...
```

The rolling window is set by `archive_keep` in config (default: 5). Older
archives go into `archive/` — **never deleted**, just moved out of the way.

---

## Status vocabulary

Every annotated item gets exactly one `**STATUS** [#N]:` line, drawn from this
vocabulary. The agent picks the first rule that matches.

| STATUS | Meaning |
|---|---|
| `DONE — Phase X[-YY]` | Already shipped in a completed phase. Reference by phase/plan number only. |
| `TRACKED — Phase X` | Listed in a planned phase's success criteria, not yet shipped. |
| `TRACKED — Phase X (in progress)` | Listed in a phase that's currently being executed. |
| `PARTIALLY TRACKED — Phase X covers [...], [gap]` | A planned phase addresses part of it but something remains open. |
| `NOT TRACKED → fits Phase X (planned) [TAG]` | Unplanned, but maps cleanly into an existing planned phase's scope. |
| `NOT TRACKED → Proposed Phase Y (NEW): <name> [TAG]` | Unplanned, doesn't fit any existing phase — agent proposes a new one. |
| `NEEDS TRIAGE — <brief>` | Bug, crash, or blocker. Route to `/gsd:debug`. |
| `DEFERRED — ref` | Explicitly postponed in a phase or PROJECT file. |

**Complexity tag (required on any NOT TRACKED item):**

- `[QUICK]` — single file, single function, or contained bug fix. Fits `/gsd:quick`.
- `[SUB-PHASE]` — decimal phase like `26.1`, moderate scope, no research needed.
- `[RESEARCH]` — multi-component or architectural, needs `/gsd:research-phase` before planning.

**`(NEW)` vs `(planned)`:** when the agent proposes a phase number, `(NEW)`
means the phase doesn't exist in `ROADMAP.md` yet; `(planned)` means it's
already on the roadmap and you're just fitting the item into it.

**The agent never modifies `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, or
any phase directory.** All phase suggestions are suggestions — you run
`/gsd:add-phase`, `/gsd:quick`, or `/gsd:discuss-phase` manually when you're
ready to act on them.

---

## Usage

```
/marknotes                 # review unreviewed items in WORKING.md
/marknotes --archive       # review, then archive WORKING.md to MM-DD_phaseN.md and scaffold a new one
/marknotes --refresh       # re-review items that already have a STATUS
/marknotes --init          # scaffold notes/testing/ in this project (one-time)
/marknotes --init --write-config # scaffold notes/testing/ and config
/marknotes --config .claude/custom-note-marker.json
/marknotes path/to/file.md # review a specific file instead of WORKING.md
```

After a run the agent reports something like:

```
Marked 6 items: 1 TRACKED, 3 NOT TRACKED (2 QUICK, 1 RESEARCH), 1 NEEDS TRIAGE, 1 DEFERRED.
Action items:
  - NEEDS TRIAGE: /battery 500 error — run /gsd:debug
  - RESEARCH: Vehicle Preset Overhaul — candidate for /gsd:discuss-phase
Unreviewed remaining: 0
```

---

## VSCode color highlighting

Markdown doesn't support colors natively, but the
[**Highlight**](https://marketplace.visualstudio.com/items?itemName=fabiospampinato.vscode-highlight)
extension adds regex-based colorization to the editor view. This skill ships a
ready-to-paste settings block at `vscode/highlight-settings.json`.

### Setup

1. **Install the extension:** `code --install-extension fabiospampinato.vscode-highlight`
2. **Open your user settings JSON:** Command Palette → "Preferences: Open User Settings (JSON)"
3. **Merge** the contents of `vscode/highlight-settings.json` into your settings (specifically the `"highlight.regexes"` key — if you already have one, add the entries from this file into it).
4. Open a notes file in `notes/testing/` — colors apply instantly.

### Color map

| Status | Color | Style |
|---|---|---|
| `DONE` | green | bold |
| `TRACKED` | blue | bold |
| `PARTIALLY TRACKED` | orange | bold |
| `NOT TRACKED → fits` | yellow | bold |
| `NOT TRACKED → Proposed` | red | bold |
| `NEEDS TRIAGE` | white on red bg | bold + border |
| `DEFERRED` | gray | italic |
| `[QUICK]` | lime pill | bold |
| `[SUB-PHASE]` | amber pill | bold |
| `[RESEARCH]` | rose pill | bold |
| `(NEW)` | pink | bold |
| `(planned)` | violet | — |

The `filterFileRegex` on every rule is `.*/notes/testing/.*\.md$`, so regular
markdown files in your project that happen to contain the word STATUS are
unaffected. If you changed `notes_dir` in your per-project config, update the
filterFileRegex in settings.json to match.

---

## How it works (internals)

```
           /marknotes invoked
                  │
                  ▼
     ┌────────────────────────┐
     │  preprocess.js         │  reads WORKING.md once
     │  → JSON payload:       │  extracts unreviewed items
     │    items + context     │  loads ROADMAP / REQUIREMENTS / STATE
     └────────┬───────────────┘
              │
              ▼
     ┌────────────────────────┐
     │  Claude classifies     │  never reads WORKING.md directly
     │  each item using       │  context stays lean — only unreviewed
     │  rules in SKILL.md     │  items reach the agent
     └────────┬───────────────┘
              │
              ▼
     ┌────────────────────────┐
     │  postprocess.js apply  │  inserts STATUS lines at item end_line,
     │                        │  respecting bullet/continuation indent
     └────────┬───────────────┘
              │
              ▼
     ┌────────────────────────┐
     │  --archive (optional)  │  rename → MM-DD_phaseN.md,
     │  postprocess.js archive│  scaffold fresh WORKING.md,
     │                        │  rotate old archives to archive/
     └────────────────────────┘
```

The agent never reads the full working file directly — all I/O goes through
the preprocessor/postprocessor. This keeps classification context tight no
matter how big your notes file gets. Only unreviewed items are ever sent to
the model.

---

## File layout (this repo)

```
dotfiles/claude/skills/note-marker/
├── README.md                      # you are here
├── SKILL.md                       # the skill definition (what Claude executes on /marknotes)
├── install.sh                     # symlink to ~/.claude/skills/note-marker
├── scripts/
│   ├── lib.js                     # shared: parser, context loader, manifest helpers
│   ├── preprocess.js              # extract unreviewed items + context → JSON
│   ├── postprocess.js             # apply STATUS updates, archive, rotate
│   └── init.js                    # scaffold notes/testing/ in a project
├── templates/
│   ├── WORKING.template.md        # fresh working file, with rules embedded
│   └── note-marker.json           # example per-project config
└── vscode/
    └── highlight-settings.json    # VSCode Highlight extension color rules
```

All scripts are zero-dependency Node — only stdlib. No `npm install` needed,
works on any machine with Node ≥ 14.

---

## Config reference

Per-project overrides live at `<project>/.claude/note-marker.json` by
default. You can also set `NOTE_MARKER_CONFIG=/path/to/config.json` or pass
`--config path/to/config.json` when running `/marknotes`.

All keys are optional; missing keys fall back to defaults in `scripts/lib.js`:

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

`context_files` is for extra project-specific Markdown or text files the
agent should read when classifying notes. Paths are project-root relative
unless absolute.

If your project has no planning directory at all, the agent falls back to
classifying items purely from their text content — expect more
`NOT TRACKED → Proposed Phase (NEW)` outcomes since there's nothing to match
against.

---

## Troubleshooting

**"working file not found"** — run `/marknotes --init` in the project root.

**"Claude Code doesn't recognize /marknotes"** — verify the symlink exists
with `./install.sh --check`. Then restart Claude Code (the skills list loads
once per session).

**"All my items are marked NOT TRACKED even though they're clearly covered"**
— check that `.planning/ROADMAP.md` exists in the project and uses either
`### Phase N: Name` section headings or `- [x] **Phase N: Name**` checklist
entries. The parser looks for those patterns. If your planning format is
different, either align it or extend `loadContext()` in `scripts/lib.js`.

**"The parser split one item into two"** — you probably have a blank line in
the middle of the item or a dash that looks like a horizontal rule. Move the
content onto a single block or indent continuation lines.

**"Status line appears in the wrong place"** — the item's `end_line` was
computed from the last non-blank line of the block. If you have trailing
blank lines inside a bulleted list that you consider part of the item, remove
them. File an issue with a minimal repro if this keeps happening.

**"I want to re-review an already-marked item"** — delete its status marker
line, or run `/marknotes --refresh` to re-review everything.

---

## License

MIT, or whatever — do what you want with it.
