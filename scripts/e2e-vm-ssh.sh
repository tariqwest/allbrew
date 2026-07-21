#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

if [[ $# -eq 0 ]]; then
  echo "Usage: $(basename "$0") <command>" >&2
  exit 1
fi

if is_remote; then
  # Tunnel through the remote Lume host. -t allocates a tty so that
  # interactive shells and programs behave correctly.
  exec ssh -t "$LUME_REMOTE_HOST" \
    "lume ssh $(printf '%q' "$LUME_VM_NAME") $(printf '%q ' "$@")"
fi

exec lume ssh "$LUME_VM_NAME" "$@"
