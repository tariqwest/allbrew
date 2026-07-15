#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

RUN_INTEGRATION=false
RUN_E2E=false
for arg in "$@"; do
  case "$arg" in
    --integration) RUN_INTEGRATION=true ;;
    --e2e) RUN_E2E=true ;;
    --help|-h)
      echo "Usage: $(basename "$0") [--integration] [--e2e]"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $(basename "$0") [--integration] [--e2e]" >&2
      exit 1
      ;;
  esac
done

log() { echo "[e2e-vm-tests] $*"; }

# Ensure the VM is running before executing tests
if ! vm_running; then
  log "VM is not running; running setup first"
  "$SCRIPT_DIR/e2e-vm-setup.sh"
fi

REPO_MOUNT="$(repo_mount_path)"
log "Running allbrew tests inside VM at $REPO_MOUNT"

run_in_vm() {
  local description="$1"
  shift
  log "$description"
  lume ssh "$ALLBREW_E2E_VM_NAME" --timeout 0 '
    export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"
    cd "'"$REPO_MOUNT"'"
    '"${*}"'
  '
}

run_in_vm "Type check" bun run check
run_in_vm "Unit tests" bun run test

if $RUN_INTEGRATION; then
  run_in_vm "Integration tests" bun run test:int
fi

if $RUN_E2E; then
  run_in_vm "E2E tests" E2E=1 bun run test:e2e
fi

log "All tests completed"
