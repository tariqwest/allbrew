#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

if [[ $# -eq 0 ]]; then
  echo "Usage: $(basename "$0") <command>" >&2
  exit 1
fi

exec lume ssh "$ALLBREW_E2E_VM_NAME" "$*"
