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
    echo "Stopping VM '$LUME_VM_NAME'..."
    lume_cmd stop "$LUME_VM_NAME" || true
    ;;
  --delete)
    echo "Stopping VM '$LUME_VM_NAME'..."
    lume_cmd stop "$LUME_VM_NAME" || true
    echo "Deleting VM '$LUME_VM_NAME'..."
    lume_cmd delete "$LUME_VM_NAME" || true
    ;;
  *)
    echo "Usage: $(basename "$0") [--stop | --delete]" >&2
    exit 1
    ;;
esac
