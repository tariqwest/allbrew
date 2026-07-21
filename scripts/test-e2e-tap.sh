#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

NO_CLEANUP=false
VITEST_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --no-cleanup)
      NO_CLEANUP=true
      ;;
    --help|-h)
      echo "Usage: $(basename "$0") [--no-cleanup] [extra vitest args]"
      echo ""
      echo "  --no-cleanup  Skip the automatic ~/.config/allbrew snapshot/restore."
      echo "                (The e2e-tap globalSetup normally handles this; this"
      echo "                flag disables it for debugging.)"
      echo ""
      echo "Note: snapshot/restore is built into the test harness via a Vitest"
      echo "globalSetup. This wrapper is a convenience that documents the behavior"
      echo "and tees test output to a log file in the run record."
      exit 0
      ;;
    *)
      VITEST_ARGS+=("$arg")
      ;;
  esac
done

echo "[e2e-tap] Running E2E tap tests with fixture server..."
echo "[e2e-tap] These tests create disposable git taps and install real Homebrew packages."
echo "[e2e-tap] Requires: macOS, Homebrew, Bun."
echo ""

# Tee test output to a temp log so the globalSetup teardown can copy it into
# the run record and parse a Test Results Summary section for readout.txt.
TEST_LOG="$(mktemp -t allbrew-e2e-tap-log)"
trap 'rm -f "$TEST_LOG"' EXIT
export ALLBREW_TEST_LOG="$TEST_LOG"

if [[ "$NO_CLEANUP" == "true" ]]; then
  echo "[e2e-tap] WARNING: --no-cleanup set; ~/.config/allbrew will NOT be restored."
  echo "[e2e-tap] Manual recovery: scripts/test-local-cleanup.sh --restore"
  echo ""
  E2E_TAP=1 ALLBREW_SKIP_GLOBAL_SETUP=1 bun run vitest run --project=e2e-tap "${VITEST_ARGS[@]}" 2>&1 | tee "$TEST_LOG"
else
  echo "[e2e-tap] ~/.config/allbrew will be snapshotted before tests and restored after."
  echo "[e2e-tap] Snapshots saved to tests/e2e-runs/local/<timestamp>/"
  echo "[e2e-tap]   - readout.txt       (post-test system state, before restore)"
  echo "[e2e-tap]   - test-output.log   (captured stdout/stderr)"
  echo "[e2e-tap]   - metadata.json     (run metadata)"
  echo "[e2e-tap] Manual recovery: scripts/test-local-cleanup.sh --restore"
  echo ""
  E2E_TAP=1 bun run vitest run --project=e2e-tap "${VITEST_ARGS[@]}" 2>&1 | tee "$TEST_LOG"
fi
