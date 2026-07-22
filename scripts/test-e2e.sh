#!/usr/bin/env bash
set -euo pipefail

# E2E catalog test wrapper (local filesystem only).
#
# Runs the E2E catalog tests with ~/.config/allbrew snapshot/restore and
# post-test readout capture. For isolated VM execution, use the Lume harness:
#   bun run vm:test:e2e
#
# Usage:
#   scripts/test-e2e.sh                     # run full E2E catalog
#   scripts/test-e2e.sh tests/e2e/foo.test.ts  # bun test file filter
#   scripts/test-e2e.sh --help

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BUNTEST_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      cat <<EOF
Usage: $(basename "$0") [bun test file filters...]

Runs the E2E catalog tests on the local filesystem.
These tests generate real formulas/casks and install them via Homebrew.

~/.config/allbrew will be snapshotted before tests and restored after.
Snapshots saved to tests/e2e-runs/local/<timestamp>/
  - readout.txt       (post-test system state, before restore)
  - test-output.log   (captured stdout/stderr)
  - metadata.json     (run metadata)
Manual recovery: scripts/test-local-cleanup.sh --restore

For VM execution use: bun run vm:test:e2e
EOF
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      BUNTEST_ARGS+=("$1")
      shift
      ;;
  esac
done

cd "$REPO_ROOT"

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
echo "[e2e] For VM execution use: bun run vm:test:e2e"
echo ""

# Tee test output to a temp log so afterAll can copy it into the run record
# and parse a Test Results Summary for readout.txt.
TEST_LOG="$(mktemp -t allbrew-e2e-log)"
trap 'rm -f "$TEST_LOG"' EXIT
export ALLBREW_TEST_LOG="$TEST_LOG"

E2E=1 bun test tests/e2e/ --timeout 300000 "${BUNTEST_ARGS[@]}" 2>&1 | tee "$TEST_LOG"
