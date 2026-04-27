#!/usr/bin/env bash
# install.sh — symlink Note Marker into ~/.claude/skills/note-marker so
# Claude Code picks it up as a user-invocable skill across all projects.
#
# Usage:
#   ./install.sh           # creates the symlink
#   ./install.sh --check   # reports current install status, no changes
#   ./install.sh --remove  # removes the symlink
#
# The symlink points at this directory, so any changes you make here are
# picked up instantly — no reinstall needed after script edits.

set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="${NOTE_MARKER_SKILL_NAME:-note-marker}"
INSTALL_DIR="${NOTE_MARKER_INSTALL_DIR:-$HOME/.claude/skills}"
TARGET="$INSTALL_DIR/$SKILL_NAME"

cmd="${1:-install}"

case "$cmd" in
  --check|check)
    if [[ -L "$TARGET" ]]; then
      resolved="$(readlink "$TARGET")"
      echo "installed: $TARGET -> $resolved"
      if [[ "$resolved" == "$SELF_DIR" ]]; then
        echo "status: up to date"
      else
        echo "status: symlink points elsewhere (expected $SELF_DIR)"
        exit 1
      fi
    elif [[ -e "$TARGET" ]]; then
      echo "conflict: $TARGET exists and is not a symlink"
      exit 1
    else
      echo "not installed"
      exit 1
    fi
    ;;

  --remove|remove|uninstall)
    if [[ -L "$TARGET" ]]; then
      rm "$TARGET"
      echo "removed: $TARGET"
    else
      echo "nothing to remove: $TARGET is not a symlink"
    fi
    ;;

  install|"")
    mkdir -p "$INSTALL_DIR"
    if [[ -e "$TARGET" && ! -L "$TARGET" ]]; then
      echo "error: $TARGET exists and is not a symlink — refusing to overwrite"
      exit 1
    fi
    if [[ -L "$TARGET" ]]; then
      rm "$TARGET"
    fi
    ln -s "$SELF_DIR" "$TARGET"
    echo "installed: $TARGET -> $SELF_DIR"
    echo ""
    echo "Claude Code will pick up /marknotes on next session start."
    echo "To run without the symlink, export NOTE_MARKER_HOME=$SELF_DIR"
    ;;

  *)
    echo "usage: $0 [install|--check|--remove]"
    exit 2
    ;;
esac
