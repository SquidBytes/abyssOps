# AI & Claude

Claude Code skills, prompts, and AI-assisted workflow tooling.

---

## Claude Code Skills

Claude Code workflow helpers can be project-scoped commands in `.claude/commands/`
or reusable skills installed under `~/.claude/skills/`.

Project command files become slash commands in Claude Code sessions opened in
this repo. Reusable skills live in their own directory with a `SKILL.md` file
and can be symlinked into `~/.claude/skills/`.

### How They Work

The filename sets the command name:

```
.claude/commands/audit-script.md  →  /audit-script
```

The file content is the prompt Claude receives when the command is invoked. The special token `$ARGUMENTS` captures anything typed after the command name.

### Creating a Project Command

```sh
mkdir -p .claude/commands
# create the skill file
cat > .claude/commands/my-skill.md <<'EOF'
Do something useful with $ARGUMENTS.
EOF
```

Then in Claude Code: `/my-skill <args>`

### Example Skill

`.claude/commands/audit-script.md`:

```markdown
Review the shell script at $ARGUMENTS for:
- Unquoted variables that could cause word splitting
- Missing error handling (unchecked exit codes, no set -e)
- Hardcoded paths or values that should be flags or arguments
- Commands that assume a working directory

Report findings with line numbers. If the script looks clean, say so.
```

Usage:

```
/audit-script scripts/vscode/install-vscode-server.sh
```

---

## Skills in This Repo

| Command | File | Description |
|---------|------|-------------|
| `/marknotes` | `dotfiles/claude/skills/note-marker/SKILL.md` | Review testing notes and annotate each item with planning status |

---

## Notes

- Project commands are project-scoped and only appear in Claude Code sessions opened in this repo
- Reusable skills can be symlinked into `~/.claude/skills/` for use across projects
- Skills and commands are version-controlled alongside the code they support
- The `.claude/` directory may also contain `settings.json` for project-level Claude Code config

## References

| Reference | Description |
|-----------|-------------|
| [Note Marker](note-marker.md) | Configurable Claude Code skill for marking testing notes |
| [Claude Statuslines](claude-statuslines.md) | Plain and GSD Claude Code statusline hooks |
