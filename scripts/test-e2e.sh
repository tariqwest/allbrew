#!/usr/bin/env bash
set -euo pipefail

# E2E catalog test wrapper.
#
# Defaults to running inside a Lume VM (remote if homeserver.local is
# reachable, else local Lume). Falls back to the local filesystem only when
# no VM is available or --local is passed.
#
# Usage:
#   scripts/test-e2e.sh                     # auto-detect VM, run e2e tier
#   scripts/test-e2e.sh --local             # force local filesystem mode
#   scripts/test-e2e.sh --reset             # VM mode: reset VM after tests
#   scripts/test-e2e.sh --nuclear           # VM mode: nuclear reset after tests
#   scripts/test-e2e.sh --no-readout        # VM mode: skip post-test readout
#   scripts/test-e2e.sh tests/e2e/foo.test.ts  # local mode: vitest file filter
#   scripts/test-e2e.sh --help

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=test-vm-detect.sh
source "$SCRIPT_DIR/test-vm-detect.sh"

FORCE_LOCAL=false
VM_RESET=false
VM_NUCLEAR=false
VM_NO_READOUT=false
VITEST_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local)        FORCE_LOCAL=true; shift ;;
    --reset)        VM_RESET=true; shift ;;
    --nuclear)      VM_NUCLEAR=true; VM_RESET=true; shift ;;
    --no-readout)   VM_NO_READOUT=true; shift ;;
    --help|-h)
      cat <<EOF
Usage: $(basename "$0") [options] [vitest file filters...]

Default: auto-detect VM (remote → local Lume → local filesystem).

Options:
  --local        Force local filesystem mode (skip VM)
  --reset        VM mode: reset VM to virgin state after tests
  --nuclear      VM mode: nuclear reset (also uninstall Homebrew/Bun/mas)
  --no-readout   VM mode: skip post-test readout capture
  --help         Show this help

In local mode, extra args are passed to vitest as file filters.
In VM mode, the entire e2e tier runs (no file filtering).
EOF
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      VITEST_ARGS+=("$1")
      shift
      ;;
  esac
done

cd "$REPO_ROOT"

detect_vm_mode "$FORCE_LOCAL"
MODE_DESC="$(describe_vm_mode)"

echo "[e2e] Mode: $MODE_DESC"
echo ""

case "$VM_MODE" in
  remote|local-vm)
    # ── VM mode: delegate to e2e-vm-run-tests.sh ──
    echo "[e2e] Delegating to e2e-vm-run-tests.sh --e2e"
    echo "[e2e] The VM harness handles setup, readout, and optional reset."
    echo ""

    VM_ARGS=(--e2e)
    $VM_RESET && VM_ARGS+=(--reset)
    $VM_NUCLEAR && VM_ARGS+=(--nuclear)
    $VM_NO_READOUT && VM_ARGS+=(--no-readout)

    exec "$SCRIPT_DIR/e2e-vm-run-tests.sh" "${VM_ARGS[@]}"
    ;;

  local-fs)
    # ── Local filesystem mode ──
    echo "[e2e] Running E2E catalog tests on local filesystem."
    echo "[e2e] These tests generate real formulas/casks and install them via Homebrew."
    echo "[e2e] Requires: macOS, Homebrew, Bun."
    echo "[e2e]"
    echo "[e2e] ~/.config/allbrew will be snapshotted before tests and restored after."
    echo "[e2e] Snapshots saved to tests/e2e-runs/local/<timestamp>/"
    echo "[e2e]   - readout.txt       (post-test system state, before restore)"
    echo "[e2e]   - test-output.log   (captured stdout/stderr)"
    echo "[e2e]   - metadata.json     (run metadata)"
    echo "[e2e] Manual recovery: scripts/test-local-cleanup.sh --restore"
    echo ""

    # Tee test output to a temp log so afterAll can copy it into the run record
    # and parse a Test Results Summary for readout.txt.
    TEST_LOG="$(mktemp -t allbrew-e2e-log)"
    trap 'rm -f "$TEST_LOG"' EXIT
    export ALLBREW_TEST_LOG="$TEST_LOG"

    E2E=1 bun run vitest run --project=e2e "${VITEST_ARGS[@]}" 2>&1 | tee "$TEST_LOG"
    ;;
esac
