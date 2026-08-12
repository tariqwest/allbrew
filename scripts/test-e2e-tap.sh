#!/usr/bin/env bash
set -euo pipefail

# E2E tap test wrapper (local filesystem only).
#
# Runs the E2E tap tests with ~/.config/allbrew snapshot/restore and
# post-test readout capture. For isolated VM execution, use the Lume harness:
#   bun run vm:test:e2e-tap
#
# Usage:
#   scripts/test-e2e-tap.sh                    # run full E2E tap tier
#   scripts/test-e2e-tap.sh --no-cleanup       # skip snapshot/restore
#   scripts/test-e2e-tap.sh tests/e2e-tap/foo.test.ts  # bun test file filter
#   scripts/test-e2e-tap.sh --help

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

NO_CLEANUP=false
BUNTEST_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-cleanup)   NO_CLEANUP=true; shift ;;
    --help|-h)
      cat <<EOF
Usage: $(basename "$0") [options] [bun test file filters...]

Runs the E2E tap tests on the local filesystem.
These tests create disposable git taps and install real Homebrew packages.

Options:
  --no-cleanup   Skip ~/.config/allbrew snapshot/restore

~/.config/allbrew will be snapshotted before tests and restored after (unless --no-cleanup).
Snapshots saved to tests/e2e-runs/local/<timestamp>/
  - readout.txt       (post-test system state, before restore)
  - test-output.log   (captured stdout/stderr)
  - metadata.json     (run metadata)
Manual recovery: scripts/test-local-cleanup.sh --restore

For VM execution use: bun run vm:test:e2e-tap
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

echo "[e2e-tap] Running E2E tap tests on local filesystem."
echo "[e2e-tap] These tests create disposable git taps and install real Homebrew packages."
echo "[e2e-tap] Requires: macOS, Homebrew, Bun."
echo ""

if $NO_CLEANUP; then
  echo "[e2e-tap] WARNING: --no-cleanup set; ~/.config/allbrew will NOT be restored."
  echo "[e2e-tap] Manual recovery: scripts/test-local-cleanup.sh --restore"
  echo ""
  E2E_TAP=1 ALLBREW_SKIP_GLOBAL_SETUP=1 \
    bun test tests/e2e-tap/ --timeout 600000 "${BUNTEST_ARGS[@]}"
else
  echo "[e2e-tap] ~/.config/allbrew will be snapshotted before tests and restored after."
  echo "[e2e-tap] Snapshots saved to tests/e2e-runs/local/<timestamp>/"
  echo "[e2e-tap]   - readout.txt       (post-test system state, before restore)"
  echo "[e2e-tap]   - test-output.log   (captured stdout/stderr)"
  echo "[e2e-tap]   - metadata.json     (run metadata)"
  echo "[e2e-tap] Manual recovery: scripts/test-local-cleanup.sh --restore"
  echo "[e2e-tap] For VM execution use: bun run vm:test:e2e-tap"
  echo ""

  # The runner script handles snapshot -> bun test -> readout -> restore.
  # It writes test output to <runDir>/test-output.log and inherits to console.
  E2E_TAP=1 bun run scripts/e2e-tap-local-runner.ts "${BUNTEST_ARGS[@]}"
fi
