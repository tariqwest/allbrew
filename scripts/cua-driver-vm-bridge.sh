#!/bin/bash
set -euo pipefail

# MCP stdio bridge to the Cua Driver daemon running inside the Lume VM.
# Register with an MCP client on the host, e.g.:
#   claude mcp add --transport stdio cua-driver-vm -- scripts/cua-driver-vm-bridge.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

VM_IP="$(vm_ip)"
if [[ -z "$VM_IP" ]]; then
  echo "Could not determine IP for VM '$ALLBREW_E2E_VM_NAME'. Is it running?" >&2
  exit 1
fi

if [[ ! -f "$ALLBREW_E2E_SSH_KEY" ]]; then
  echo "SSH key not found: $ALLBREW_E2E_SSH_KEY" >&2
  echo "Run scripts/e2e-vm-setup.sh first to generate and copy the key." >&2
  exit 1
fi

exec ssh -q \
  -i "$ALLBREW_E2E_SSH_KEY" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  "$ALLBREW_E2E_USER@$VM_IP" \
  /Users/lume/.local/bin/cua-driver mcp
