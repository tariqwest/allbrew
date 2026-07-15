#!/bin/bash
# shellcheck disable=SC2034
# shellcheck disable=SC1091
set -euo pipefail

# Reproducible defaults for the allbrew Lume macOS VM test harness.
# Override any value via environment variables or by editing a local .env file.

ALLBREW_E2E_VM_NAME="${ALLBREW_E2E_VM_NAME:-allbrew-e2e}"
ALLBREW_E2E_IPSW="${ALLBREW_E2E_IPSW:-/Users/tariqwest/Downloads/UniversalMac_26.5.2_25F84_Restore.ipsw}"
ALLBREW_E2E_CPU="${ALLBREW_E2E_CPU:-4}"
ALLBREW_E2E_MEMORY="${ALLBREW_E2E_MEMORY:-16GB}"
ALLBREW_E2E_DISK="${ALLBREW_E2E_DISK:-100GB}"
ALLBREW_E2E_DISPLAY="${ALLBREW_E2E_DISPLAY:-1280x800}"
ALLBREW_E2E_SHARED_DIR="${ALLBREW_E2E_SHARED_DIR:-/Users/tariqwest/Developer/allbrew}"
ALLBREW_E2E_USER="${ALLBREW_E2E_USER:-lume}"
ALLBREW_E2E_PASSWORD="${ALLBREW_E2E_PASSWORD:-lume}"
ALLBREW_E2E_SSH_KEY="${ALLBREW_E2E_SSH_KEY:-$HOME/.ssh/allbrew_e2e_vm}"

ALLBREW_E2E_REPO_MOUNT="/Volumes/My Shared Files"

vm_exists() {
  lume get "$ALLBREW_E2E_VM_NAME" --format json >/dev/null 2>&1
}

vm_state() {
  lume get "$ALLBREW_E2E_VM_NAME" --format json 2>/dev/null \
    | jq -r '.[0].status // "missing"' 2>/dev/null \
    || echo "missing"
}

vm_running() {
  [[ "$(vm_state)" == "running" ]]
}

vm_ip() {
  lume get "$ALLBREW_E2E_VM_NAME" --format json 2>/dev/null \
    | jq -r '.[0].ipAddress // empty' 2>/dev/null
}

repo_mount_path() {
  printf '%s' "$ALLBREW_E2E_REPO_MOUNT"
}
