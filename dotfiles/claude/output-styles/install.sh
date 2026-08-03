#!/usr/bin/env bash
# install.sh — symlink every output style in this directory into
# ~/.claude/output-styles so Claude Code offers them under /output-style.
#
# Usage:
#   ./install.sh           # creates the symlinks
#   ./install.sh --check   # reports current install status, no changes
#   ./install.sh --remove  # removes the symlinks
#
# The symlinks point at the files here, so edits are picked up on the next
# session — no reinstall needed.
#
# Override the install location (e.g. a work account using a different
# CLAUDE_CONFIG_DIR) with:
#   OUTPUT_STYLES_INSTALL_DIR=$HOME/.claude-work/output-styles ./install.sh

set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${OUTPUT_STYLES_INSTALL_DIR:-$HOME/.claude/output-styles}"

styles=()
for f in "$SELF_DIR"/*.md; do
  [[ -e "$f" ]] || continue
  [[ "$(basename "$f")" == "README.md" ]] && continue
  styles+=("$f")
done
if [[ ${#styles[@]} -eq 0 ]]; then
  echo "error: no .md output styles found in $SELF_DIR"
  exit 1
fi

cmd="${1:-install}"
status=0

case "$cmd" in
  --check|check)
    for src in "${styles[@]}"; do
      name="$(basename "$src")"
      target="$INSTALL_DIR/$name"
      if [[ -L "$target" ]]; then
        resolved="$(readlink "$target")"
        if [[ "$resolved" == "$src" ]]; then
          echo "up to date: $target"
        else
          echo "wrong target: $target -> $resolved (expected $src)"
          status=1
        fi
      elif [[ -e "$target" ]]; then
        echo "conflict: $target exists and is not a symlink"
        status=1
      else
        echo "not installed: $name"
        status=1
      fi
    done
    exit "$status"
    ;;

  --remove|remove|uninstall)
    for src in "${styles[@]}"; do
      target="$INSTALL_DIR/$(basename "$src")"
      if [[ -L "$target" ]]; then
        rm "$target"
        echo "removed: $target"
      else
        echo "nothing to remove: $target is not a symlink"
      fi
    done
    ;;

  install|"")
    mkdir -p "$INSTALL_DIR"
    for src in "${styles[@]}"; do
      name="$(basename "$src")"
      target="$INSTALL_DIR/$name"
      if [[ -e "$target" && ! -L "$target" ]]; then
        echo "error: $target exists and is not a symlink — refusing to overwrite"
        exit 1
      fi
      [[ -L "$target" ]] && rm "$target"
      ln -s "$src" "$target"
      echo "installed: $target -> $src"
    done
    echo ""
    echo "Select it with /output-style on the next session start."
    ;;

  *)
    echo "usage: $0 [install|--check|--remove]"
    exit 2
    ;;
esac
