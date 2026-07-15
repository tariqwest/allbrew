#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

MODE="${1:-}"
case "$MODE" in
  --help|-h)
    echo "Usage: $(basename "$0") [--stop | --delete]"
    exit 0
    ;;
  --stop)
    echo "Stopping VM '$ALLBREW_E2E_VM_NAME'..."
    lume stop "$ALLBREW_E2E_VM_NAME" || true
    ;;
  --delete)
    echo "Stopping VM '$ALLBREW_E2E_VM_NAME'..."
    lume stop "$ALLBREW_E2E_VM_NAME" || true
    echo "Deleting VM '$ALLBREW_E2E_VM_NAME'..."
    lume delete "$ALLBREW_E2E_VM_NAME" || true
    ;;
  *)
    echo "Usage: $(basename "$0") [--stop | --delete]" >&2
    exit 1
    ;;
esac
