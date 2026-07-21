#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

RUN_INTEGRATION=false
RUN_E2E=false
RESET_AFTER=false
NUCLEAR_RESET=false
SKIP_READOUT=false
for arg in "$@"; do
  case "$arg" in
    --integration) RUN_INTEGRATION=true ;;
    --e2e) RUN_E2E=true ;;
    --reset) RESET_AFTER=true ;;
    --nuclear) NUCLEAR_RESET=true; RESET_AFTER=true ;;
    --no-readout) SKIP_READOUT=true ;;
    --help|-h)
      echo "Usage: $(basename "$0") [--integration] [--e2e] [--reset] [--nuclear] [--no-readout]"
      echo ""
      echo "  --integration  Run integration tests (live APIs)"
      echo "  --e2e          Run E2E catalog tests (requires E2E=1 inside VM)"
      echo "  --reset        Reset VM to virgin state after tests complete"
      echo "  --nuclear      Reset + also uninstall Homebrew/Bun/mas CLI (--reset implied)"
      echo "  --no-readout   Skip the post-test state readout"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $(basename "$0") [--integration] [--e2e] [--reset] [--nuclear] [--no-readout]" >&2
      exit 1
      ;;
  esac
done

log() { echo "[e2e-vm-tests] $*"; }

# In remote mode, sync the latest repo tree before anything else
if is_remote; then
  "$SCRIPT_DIR/e2e-vm-sync.sh"
fi

# Ensure the VM is running before executing tests
if ! vm_running; then
  log "VM is not running; running setup first"
  "$SCRIPT_DIR/e2e-vm-setup.sh"
fi

init_run_dir
export LUME_RUN_TS
TEST_LOG="$(run_dir)/test-output.log"

REPO_MOUNT="$(repo_mount_path)"
log "Running allbrew tests inside VM at $REPO_MOUNT"
log "Test output log: $TEST_LOG"

run_in_vm() {
  local description="$1"
  shift
  log "$description"
  lume_ssh_cmd --timeout 0 "
    export PATH=\"/opt/homebrew/bin:/usr/local/bin:\$HOME/.bun/bin:\$PATH\"
    cd \"$REPO_MOUNT\"
    ${*}
  " 2>&1 | tee -a "$TEST_LOG"
}

# Tee header
tiers="unit"
if $RUN_INTEGRATION; then tiers+=" +integration"; fi
if $RUN_E2E; then tiers+=" +e2e"; fi
{
  echo "=========================================="
  echo "  allbrew E2E Test Run"
  echo "  Timestamp: $LUME_RUN_TS"
  echo "  VM: $LUME_VM_NAME"
  echo "  Tiers: $tiers"
  echo "=========================================="
} | tee "$TEST_LOG"

TESTS_FAILED=false

run_in_vm "Type check" bun run check || TESTS_FAILED=true
run_in_vm "Unit tests" bun run test || TESTS_FAILED=true

if $RUN_INTEGRATION; then
  run_in_vm "Integration tests" bun run test:int || TESTS_FAILED=true
fi

if $RUN_E2E; then
  run_in_vm "E2E tests" E2E=1 bun run test:e2e || TESTS_FAILED=true
fi

log "All tests completed (failures: $TESTS_FAILED)"

# Post-test readout
if ! $SKIP_READOUT; then
  log "Running post-test readout..."
  "$SCRIPT_DIR/e2e-vm-readout.sh" "$TEST_LOG" || log "WARNING: readout failed"
fi

# Optional reset
if $RESET_AFTER; then
  if $NUCLEAR_RESET; then
    log "Running nuclear reset (uninstalling Homebrew/Bun/mas)..."
    "$SCRIPT_DIR/e2e-vm-reset.sh" --nuclear || log "WARNING: reset failed"
  else
    log "Running VM reset..."
    "$SCRIPT_DIR/e2e-vm-reset.sh" || log "WARNING: reset failed"
  fi
fi

log "Run record: $(run_dir)"
if $TESTS_FAILED; then
  log "Some tests failed — review $TEST_LOG"
  exit 1
fi
