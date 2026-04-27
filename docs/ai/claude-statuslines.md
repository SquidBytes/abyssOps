# Claude Statuslines

Reusable Claude Code StatusLine hooks live in [`dotfiles/claude/hooks/`](../../dotfiles/claude/hooks/).

## Files

| File | Use |
|------|-----|
| `plain-statusline.js` | Global/default statusline for non-GSD repos |
| `gsd-statusline.js` | Project statusline for GSD repos with `.planning/STATE.md` |
| `statusline-label.txt.example` | Example account label shown in the statusline |

## Format

Plain:

```text
time │ account │ branch │ model │ directory │ context │ reset │ limits
```

GSD:

```text
time │ account │ branch │ model │ task or GSD state │ directory │ context │ reset │ limits
```

The account segment is read from:

```text
~/.claude/statusline-label.txt
```

or from:

```text
$CLAUDE_CONFIG_DIR/statusline-label.txt
```

## Install

```sh
mkdir -p ~/.claude/hooks
cp dotfiles/claude/hooks/plain-statusline.js ~/.claude/hooks/plain-statusline.js
cp dotfiles/claude/hooks/gsd-statusline.js ~/.claude/hooks/gsd-statusline.js
cp dotfiles/claude/statusline-label.txt.example ~/.claude/statusline-label.txt
chmod +x ~/.claude/hooks/plain-statusline.js ~/.claude/hooks/gsd-statusline.js
```

Use `plain-statusline.js` as the global Claude Code StatusLine hook.
Use `gsd-statusline.js` in GSD project-local Claude Code settings.
