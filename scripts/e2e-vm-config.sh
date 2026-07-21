#!/bin/bash
# shellcheck disable=SC2034
# shellcheck disable=SC1091
set -euo pipefail

# Reproducible defaults for the allbrew Lume macOS VM test harness.
# Override any value via environment variables or by editing a local .env file.

LUME_VM_NAME="${LUME_VM_NAME:-allbrew-e2e}"
LUME_IPSW="${LUME_IPSW:-/Users/tariqwest/Downloads/UniversalMac_26.5.2_25F84_Restore.ipsw}"
LUME_VM_CPU="${LUME_VM_CPU:-4}"
LUME_VM_MEMORY="${LUME_VM_MEMORY:-4GB}"
LUME_VM_DISK="${LUME_VM_DISK:-65GB}"
LUME_VM_DISPLAY="${LUME_VM_DISPLAY:-1280x800}"
LUME_SHARED_DIR="${LUME_SHARED_DIR:-/Users/tariqwest/Developer/allbrew}"
LUME_VM_USER="${LUME_VM_USER:-lume}"
LUME_VM_PASSWORD="${LUME_VM_PASSWORD:-lume}"
LUME_VM_SSH_KEY="${LUME_VM_SSH_KEY:-$HOME/.ssh/allbrew_e2e_vm}"

# Explicit remote Lume host mode. Set to true to run the Lume VM over SSH on a
# remote Apple Silicon Mac; leave false for local-only operation.
LUME_REMOTE_ENABLED="${LUME_REMOTE_ENABLED:-false}"
# Remote host defaults (used only when LUME_REMOTE_ENABLED=true).
LUME_REMOTE_HOST="${LUME_REMOTE_HOST:-app-user@homeserver.local}"
# Directory on the remote host where the repo is synced and mounted into the VM.
LUME_REMOTE_DIR="${LUME_REMOTE_DIR:-/Users/app-user/Developer/allbrew}"
# Directory on the remote host where the IPSW is expected or synced to.
LUME_REMOTE_IPSW_DIR="${LUME_REMOTE_IPSW_DIR:-/Users/app-user/Downloads}"
# Paths excluded when syncing the repo to the remote Lume host.
LUME_SYNC_EXCLUDES="${LUME_SYNC_EXCLUDES:-.git node_modules .lume .env}"

LUME_VM_REPO_MOUNT="/Volumes/Shared"

# Run-record directory on the host. Each test run gets a timestamped
# subdirectory containing the readout, test output, reset log, and metadata.
LUME_RUNS_DIR="${LUME_RUNS_DIR:-$LUME_SHARED_DIR/tests/e2e-runs}"

# Generate a timestamp for this run (idempotent within a single shell session)
LUME_RUN_TS="${LUME_RUN_TS:-$(date -u +%Y-%m-%dT%H-%M-%SZ)}"
LUME_RUN_DIR="$LUME_RUNS_DIR/$LUME_RUN_TS"

is_remote() {
  [[ "${LUME_REMOTE_ENABLED:-false}" == "true" ]]
}

# Derive sensible remote defaults when a remote Lume host is configured.
if is_remote; then
  _remote_user="${LUME_REMOTE_HOST%@*}"
  [[ "$LUME_REMOTE_HOST" == *@* ]] || _remote_user="${USER:-$LOGNAME}"
  LUME_REMOTE_DIR="${LUME_REMOTE_DIR:-/Users/$_remote_user/Developer/allbrew}"
  LUME_REMOTE_IPSW_DIR="${LUME_REMOTE_IPSW_DIR:-/Users/$_remote_user/Downloads}"
  unset _remote_user
fi

remote_exec() {
  if [[ $# -ne 1 ]]; then
    echo "remote_exec: expected a single command string" >&2
    return 1
  fi
  ssh -q -o BatchMode=yes -o ConnectTimeout=10 \
    "$LUME_REMOTE_HOST" "$1"
}

lume_cmd() {
  if is_remote; then
    local args
    printf -v args '%q ' "$@"
    remote_exec "lume $args"
  else
    lume "$@"
  fi
}

lume_ssh_cmd() {
  lume_cmd ssh "$LUME_VM_NAME" "$@"
}

host_shared_dir() {
  if is_remote; then
    printf '%s' "${LUME_REMOTE_DIR:-}"
  else
    printf '%s' "$LUME_SHARED_DIR"
  fi
}

host_ipsw_path() {
  if ! is_remote; then
    printf '%s' "$LUME_IPSW"
    return 0
  fi
  local remote_path
  remote_path="${LUME_REMOTE_IPSW_DIR}/$(basename "$LUME_IPSW")"
  if remote_exec "test -f $(printf '%q' "$remote_path")" >/dev/null 2>&1; then
    printf '%s' "$remote_path"
    return 0
  fi
  echo "Syncing IPSW to $LUME_REMOTE_HOST:$remote_path ..." >&2
  rsync -av --progress "$LUME_IPSW" \
    "$LUME_REMOTE_HOST:$(printf '%q' "$remote_path")" >&2
  printf '%s' "$remote_path"
}

start_vm_headless() {
  local shared_dir
  shared_dir="$(host_shared_dir)"
  if is_remote; then
    remote_exec "nohup lume run --no-display $(printf '%q' "$LUME_VM_NAME") --shared-dir $(printf '%q' "$shared_dir") >/tmp/lume-run-$(printf '%q' "$LUME_VM_NAME").log 2>&1 & disown"
  else
    nohup lume run --no-display "$LUME_VM_NAME" --shared-dir "$shared_dir" \
      >/tmp/lume-run-"$LUME_VM_NAME".log 2>&1 &
    disown
  fi
}

vm_exists() {
  lume_cmd get "$LUME_VM_NAME" --format json >/dev/null 2>&1
}

vm_state() {
  lume_cmd get "$LUME_VM_NAME" --format json 2>/dev/null \
    | jq -r '.[0].status // "missing"' 2>/dev/null \
    || echo "missing"
}

vm_running() {
  [[ "$(vm_state)" == "running" ]]
}

vm_ip() {
  lume_cmd get "$LUME_VM_NAME" --format json 2>/dev/null \
    | jq -r '.[0].ipAddress // empty' 2>/dev/null
}

repo_mount_path() {
  printf '%s' "$LUME_VM_REPO_MOUNT"
}

run_dir() {
  printf '%s' "$LUME_RUN_DIR"
}

init_run_dir() {
  mkdir -p "$LUME_RUN_DIR"
  # Update 'latest' symlink for convenience
  ln -sfn "$LUME_RUN_DIR" "$LUME_RUNS_DIR/latest"
}
