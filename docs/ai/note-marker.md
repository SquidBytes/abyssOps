# Note Marker Claude Skill

`note-marker` is a Claude Code skill for reviewing free-form testing notes and
adding a one-line `**STATUS** [#N]:` marker under each unreviewed item.

The maintained copy lives at:

```text
dotfiles/claude/skills/note-marker/
```

Install it globally for Claude Code:

```sh
cd dotfiles/claude/skills/note-marker
./install.sh
```

That creates a symlink at `~/.claude/skills/note-marker`, so changes made in
this repo are picked up by future Claude Code sessions without copying files.

## Configuration

Per-project defaults live in `.claude/note-marker.json`. You can also set
`NOTE_MARKER_CONFIG` or pass `--config path/to/config.json` to `/marknotes`.

The config controls the notes directory, working file name, manifest file,
archive directory/name format, Claude config directory, planning file names,
phase directory, and extra context files.

Start a project with:

```text
/marknotes --init
```

Use `--init --write-config` when you also want to scaffold the default config
file into the target project.

See the skill README for the full config reference and status vocabulary.
