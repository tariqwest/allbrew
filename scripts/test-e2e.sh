#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "[e2e] Running E2E catalog tests..."
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
# and parse a Test Results Summary section for readout.txt.
TEST_LOG="$(mktemp -t allbrew-e2e-log)"
trap 'rm -f "$TEST_LOG"' EXIT
export ALLBREW_TEST_LOG="$TEST_LOG"

E2E=1 bun run vitest run --project=e2e "$@" 2>&1 | tee "$TEST_LOG"
