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

log "Stopping source VM '$ALLBREW_E2E_VM_NAME'"
lume stop "$ALLBREW_E2E_VM_NAME" || true

log "Cloning '$ALLBREW_E2E_VM_NAME' to '$DEST_NAME'"
lume clone "$ALLBREW_E2E_VM_NAME" "$DEST_NAME"

log "Restarting source VM '$ALLBREW_E2E_VM_NAME'"
nohup lume run --no-display "$ALLBREW_E2E_VM_NAME" --shared-dir "$ALLBREW_E2E_SHARED_DIR" \
  >/tmp/lume-run-"$ALLBREW_E2E_VM_NAME".log 2>&1 &
disown

log "Clone '$DEST_NAME' is ready. Source VM '$ALLBREW_E2E_VM_NAME' is starting."
