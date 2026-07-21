#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "[e2e-tap] Running E2E tap tests with fixture server..."
echo "[e2e-tap] These tests create disposable git taps and install real Homebrew packages."
echo "[e2e-tap] Requires: macOS, Homebrew, Bun."
echo ""

E2E_TAP=1 bun run vitest run --project=e2e-tap "$@"
