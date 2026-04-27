# AI & Claude

Claude Code skills, prompts, and AI-assisted workflow tooling.

---

## Claude Code Skills

Claude Code skills are custom slash commands defined as Markdown files in `.claude/commands/`. Each file in that directory becomes a `/skill-name` command available in any Claude Code session opened in this repo.

### How They Work

The filename sets the command name:

```
.claude/commands/audit-script.md  →  /audit-script
```

The file content is the prompt Claude receives when the command is invoked. The special token `$ARGUMENTS` captures anything typed after the command name.

### Creating a Skill

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
| *(none yet)* | | |

---

## Notes

- Skills are project-scoped — they only appear in Claude Code sessions opened in this repo
- Skills are version-controlled alongside the code they support
- The `.claude/` directory may also contain `settings.json` for project-level Claude Code config

## References

| Reference | Description |
|-----------|-------------|
| [Claude Statuslines](claude-statuslines.md) | Plain and GSD Claude Code statusline hooks |
