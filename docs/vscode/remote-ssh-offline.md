# VS Code Remote-SSH Offline Setup

Setting up VS Code Remote-SSH and Dev Containers without internet access.

---

## Terminology

- **HOST**: Machine running the VS Code UI
- **TARGET**: Remote machine, VM, or Docker container accessed via SSH or Dev Container

---

## Step 1 - Get Commit ID (HOST)

```sh
code -v
```

Example output:

```
1.97.2
e54c774e0add60467559eb0d1e229c6452cf8447
```

Save the **commit hash**. Every path and filename depends on this matching exactly.

---

## Step 2 - Download Required Files (Online Machine)

### Modern VS Code (1.95+)

Only the server package is needed:

```
https://update.code.visualstudio.com/commit:<COMMIT_ID>/server-linux-x64/stable
```

Downloads as:

```
vscode-server-linux-x64.tar.gz
```

### Legacy VS Code (~1.93)

Older versions required both:

```
https://update.code.visualstudio.com/commit:<COMMIT_ID>/cli-alpine-x64/stable
https://update.code.visualstudio.com/commit:<COMMIT_ID>/server-linux-x64/stable
```

Only needed if maintaining an old environment.

---

## Step 3 - Transfer Files to TARGET

Copy the downloaded `.tar.gz` to the TARGET:

```
/tmp/
```

---

## Modern Install Method

For VS Code **1.95+**.

### Install Server (TARGET)

```sh
COMMIT="<commit_id>"

mkdir -p ~/.vscode-server/bin/$COMMIT
tar -xzf /tmp/vscode-server-linux-x64.tar.gz --strip-components=1 -C ~/.vscode-server/bin/$COMMIT
```

---

## Disable Exec Server (REQUIRED — HOST)

1. `Ctrl + Shift + P`
2. **Remote-SSH: Settings**
3. Disable:

   ```
   Remote-SSH: Use Exec Server
   ```

If left enabled, VS Code will silently attempt downloads and fail without a clear error.

---

## Connect

From HOST:

```
Remote-SSH: Connect to Host
```

VS Code will detect the preinstalled server and connect without any downloads.

---

## Docker / Dev Containers (Offline)

Dev Containers use the same VS Code Server mechanism, but inside a Docker container. When the container has no internet access, VS Code will attempt to download the server inside the container and fail. The container itself is recreated on retry, which wipes any manual changes — unless you intervene at the right moment.

### Workflow

1. **Trigger the initial attempt**

   Open the Dev Container in VS Code. It will build the image, start the container, attempt to install the VS Code Server, and then fail or hang.

2. **Find the running container**

   While the container is still up (do not close or retry yet), find its name or ID:

   ```sh
   docker ps
   ```

3. **Run the install script from the host**

   Pass the container name or ID with `-d` (see [Reusable Install Script](#reusable-install-script) below). The script handles `docker cp` and the install automatically — no exec into the container needed.

   ```sh
   ./install-vscode-server.sh -c <commit> -d <container_name_or_id>
   ```

   > The server installs to `/home/vscode/.vscode-server/bin/<commit>` inside the container. If your image uses a different user (e.g. `root`), add `-u root`.

4. **Retry the Dev Container connection**

   Back in VS Code, use **Reopen in Container** or reconnect. VS Code will find the preinstalled server and connect without downloading.

### If the Container Was Already Recreated

If VS Code already killed and restarted the container, repeat from step 1. The install must happen while the container from the failed attempt is still alive.

---

## Reusable Install Script

Runs from the HOST. Supports three modes via flags — local, Docker, and SSH — all from one script with no manual copying or exec needed.

The tarball defaults to the same directory as the script, so dropping both files together requires only `-c <commit>` to run.

```sh
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
```

```sh
chmod +x install-vscode-server.sh
```

### Usage Examples

**Local** — tarball next to the script, no extra flags needed:

```sh
./install-vscode-server.sh -c e54c774e0add60467559eb0d1e229c6452cf8447
```

**Local** — tarball somewhere else on the machine:

```sh
./install-vscode-server.sh -c e54c774e0add60467559eb0d1e229c6452cf8447 \
  -t ~/Downloads/vscode-server-linux-x64.tar.gz
```

**Docker / Dev Container** — script runs on the host, copies and installs into the container automatically:

```sh
# Find the container after the failed Dev Container attempt
docker ps

./install-vscode-server.sh -c e54c774e0add60467559eb0d1e229c6452cf8447 \
  -d my_devcontainer_1
```

Override the container user if it's not `vscode`:

```sh
./install-vscode-server.sh -c e54c774e0add60467559eb0d1e229c6452cf8447 \
  -d my_devcontainer_1 -u root
```

**SSH remote** — script runs on the host, SCP + SSH handles everything:

```sh
./install-vscode-server.sh -c e54c774e0add60467559eb0d1e229c6452cf8447 \
  -r 192.168.1.50
```

With a specific user and identity file:

```sh
./install-vscode-server.sh -c e54c774e0add60467559eb0d1e229c6452cf8447 \
  -r myserver.local -u ryan -i ~/.ssh/id_ed25519
```

After the script completes, reconnect in VS Code — it will find the preinstalled server and skip any downloads.

---

## Verification

On TARGET or inside container:

```sh
ls ~/.vscode-server/bin/<commit_id>
# or for Dev Containers:
ls /home/vscode/.vscode-server/bin/<commit_id>
```

On HOST:

```
Remote-SSH: Show Log
```

No download attempts should appear in the log.

---

## Common Failure Causes

| Symptom | Likely Cause |
|---|---|
| Silent hang or fail on connect | Exec Server still enabled |
| "Server not found" error | Commit hash mismatch or wrong directory depth |
| Dev Container install wiped | Container was recreated before install completed |
| Works for SSH but not Dev Container | Wrong install path (`~` vs `/home/vscode`) |

Fix is almost always: re-extract using the correct commit hash into the correct path.

---

## Legacy Method (Reference Only)

Used by VS Code ~1.93.

```sh
mkdir -p ~/.vscode-server
tar -xzf /tmp/vscode_cli_alpine_x64_cli.tar.gz -C ~/.vscode-server
mv ~/.vscode-server/code ~/.vscode-server/code-<commit_id>

mkdir -p ~/.vscode-server/cli/servers/Stable-<commit_id>/server
tar -xzf /tmp/vscode-server-linux-x64.tar.gz --strip-components=1 -C ~/.vscode-server/cli/servers/Stable-<commit_id>/server
```

---

## Notes

- CLI packages are no longer required for modern VS Code (1.95+)
- One server directory per commit — no symlinks needed
- No reboot required
- Dev Containers and Remote-SSH use identical server binaries; only the install path differs
