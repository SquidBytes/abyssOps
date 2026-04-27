#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── DEFAULTS (override with flags) ──────────────────────────────────────────
COMMIT=""
TARBALL="$SCRIPT_DIR/vscode-server-linux-x64.tar.gz"
DOCKER_CONTAINER=""
SSH_HOST=""
REMOTE_USER=""   # Docker default: "vscode"  |  SSH default: current SSH config
SSH_KEY=""
# ─────────────────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: $(basename "$0") -c <commit> [options]

Required:
  -c <commit>     VS Code commit hash

Options:
  -t <tarball>    Path to tarball on this machine
                  (default: <script dir>/vscode-server-linux-x64.tar.gz)
  -d <container>  Docker mode: container name or ID
  -r <host>       SSH mode: remote hostname or IP
  -u <user>       Remote user
                    Docker default: vscode
                    SSH default:   current SSH config / user
  -i <key>        SSH identity file (SSH mode only)
  -h              Show this help

Modes:
  Local   $(basename "$0") -c <commit>
  Docker  $(basename "$0") -c <commit> -d <container>
  SSH     $(basename "$0") -c <commit> -r <host>
EOF
}

while getopts "c:t:d:r:u:i:h" opt; do
  case $opt in
    c) COMMIT="$OPTARG" ;;
    t) TARBALL="$OPTARG" ;;
    d) DOCKER_CONTAINER="$OPTARG" ;;
    r) SSH_HOST="$OPTARG" ;;
    u) REMOTE_USER="$OPTARG" ;;
    i) SSH_KEY="$OPTARG" ;;
    h) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done

if [ -z "$COMMIT" ]; then
  echo "ERROR: commit hash is required (-c <hash>)"
  usage; exit 1
fi

if [ -n "$DOCKER_CONTAINER" ] && [ -n "$SSH_HOST" ]; then
  echo "ERROR: -d (Docker) and -r (SSH) are mutually exclusive"
  exit 1
fi

if [ ! -f "$TARBALL" ]; then
  echo "ERROR: tarball not found: $TARBALL"
  exit 1
fi

REMOTE_TARBALL="/tmp/vscode-server-linux-x64.tar.gz"

# ─── DOCKER MODE ─────────────────────────────────────────────────────────────
if [ -n "$DOCKER_CONTAINER" ]; then
  DOCKER_USER="${REMOTE_USER:-vscode}"

  if [ "$DOCKER_USER" = "root" ]; then
    SERVER_DIR="/root/.vscode-server/bin/$COMMIT"
  else
    SERVER_DIR="/home/$DOCKER_USER/.vscode-server/bin/$COMMIT"
  fi

  echo "Docker mode: container=$DOCKER_CONTAINER user=$DOCKER_USER"

  RUNNING=$(docker inspect --format '{{.State.Running}}' "$DOCKER_CONTAINER" 2>/dev/null || echo "false")
  if [ "$RUNNING" != "true" ]; then
    echo "ERROR: container '$DOCKER_CONTAINER' is not running"
    exit 1
  fi

  echo "Copying tarball into container..."
  docker cp "$TARBALL" "$DOCKER_CONTAINER:$REMOTE_TARBALL"

  echo "Installing VS Code Server inside container..."
  docker exec -u "$DOCKER_USER" "$DOCKER_CONTAINER" bash -c "
    set -e
    mkdir -p '$SERVER_DIR'
    tar -xzf '$REMOTE_TARBALL' --strip-components=1 -C '$SERVER_DIR'
    echo 'Installed to: $SERVER_DIR'
  "

# ─── SSH MODE ────────────────────────────────────────────────────────────────
elif [ -n "$SSH_HOST" ]; then
  SSH_OPTS=()
  [ -n "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")

  if [ -n "$REMOTE_USER" ]; then
    SSH_TARGET="$REMOTE_USER@$SSH_HOST"
  else
    SSH_TARGET="$SSH_HOST"
  fi

  echo "SSH mode: target=$SSH_TARGET"

  echo "Fetching remote home directory..."
  REMOTE_HOME=$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" 'echo $HOME')
  SERVER_DIR="$REMOTE_HOME/.vscode-server/bin/$COMMIT"

  echo "Copying tarball to remote..."
  scp "${SSH_OPTS[@]}" "$TARBALL" "$SSH_TARGET:$REMOTE_TARBALL"

  echo "Installing VS Code Server on remote..."
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "
    set -e
    mkdir -p '$SERVER_DIR'
    tar -xzf '$REMOTE_TARBALL' --strip-components=1 -C '$SERVER_DIR'
    echo 'Installed to: $SERVER_DIR'
  "

# ─── LOCAL MODE ──────────────────────────────────────────────────────────────
else
  SERVER_DIR="$HOME/.vscode-server/bin/$COMMIT"
  echo "Local mode: installing to $SERVER_DIR"
  mkdir -p "$SERVER_DIR"
  tar -xzf "$TARBALL" --strip-components=1 -C "$SERVER_DIR"
  echo "Installed to: $SERVER_DIR"
fi

echo "Done."
