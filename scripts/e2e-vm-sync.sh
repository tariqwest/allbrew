#!/bin/bash
set -euo pipefail

# Sync the local allbrew repo to the remote Lume host.
# Required when LUME_REMOTE_HOST is set, because Lume's --shared-dir
# can only mount a directory that lives on the host running the VM.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

log() { echo "[e2e-vm-sync] $*"; }
error() { echo "[e2e-vm-sync] ERROR: $*" >&2; exit 1; }

if ! is_remote; then
  log "Local mode: nothing to sync."
  exit 0
fi

[[ -n "${LUME_REMOTE_DIR:-}" ]] || error "LUME_REMOTE_DIR must be set in remote mode"
[[ -d "$LUME_SHARED_DIR" ]] || error "Local shared dir not found: $LUME_SHARED_DIR"

log "Syncing repo to $LUME_REMOTE_HOST:$LUME_REMOTE_DIR"

excludes=()
for item in $LUME_SYNC_EXCLUDES; do
  excludes+=(--exclude="$item")
done

rsync -avz --delete \
  "${excludes[@]}" \
  "$LUME_SHARED_DIR"/ \
  "$LUME_REMOTE_HOST:$LUME_REMOTE_DIR"/

log "Repo sync complete."
