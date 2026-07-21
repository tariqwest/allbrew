#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

DEST_NAME="${1:-}"
if [[ -z "$DEST_NAME" ]]; then
  echo "Usage: $(basename "$0") <clone-name>" >&2
  exit 1
fi

log() { echo "[e2e-vm-clone] $*"; }

log "Stopping source VM '$LUME_VM_NAME'"
lume_cmd stop "$LUME_VM_NAME" || true

log "Cloning '$LUME_VM_NAME' to '$DEST_NAME'"
lume_cmd clone "$LUME_VM_NAME" "$DEST_NAME"

log "Restarting source VM '$LUME_VM_NAME'"
start_vm_headless

log "Clone '$DEST_NAME' is ready. Source VM '$LUME_VM_NAME' is starting."
