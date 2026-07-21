#!/bin/bash
# shellcheck disable=SC2034
# Shared VM detection logic for test-e2e.sh and test-e2e-tap.sh.
#
# Sources e2e-vm-config.sh for LUME_* defaults, then probes availability in
# priority order:
#   1. Remote Lume host (LUME_REMOTE_HOST, default app-user@homeserver.local)
#   2. Local `lume` CLI
#   3. Local filesystem fallback
#
# Sets:
#   VM_MODE            — "remote" | "local-vm" | "local-fs"
#   LUME_REMOTE_ENABLED — "true" | "false"  (exported, consumed by e2e-vm-*.sh)
#
# Usage:
#   source "$SCRIPT_DIR/test-vm-detect.sh"
#   detect_vm_mode "$FORCE_LOCAL"   # "true" or "false"

SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

detect_vm_mode() {
  local force_local="${1:-false}"

  VM_MODE="local-fs"
  export LUME_REMOTE_ENABLED="false"

  if [[ "$force_local" == "true" ]]; then
    VM_MODE="local-fs"
    return 0
  fi

  # 1. Probe remote Lume host.
  local remote_host="${LUME_REMOTE_HOST:-app-user@homeserver.local}"
  if ssh -q -o BatchMode=yes -o ConnectTimeout=3 "$remote_host" \
       'command -v lume >/dev/null 2>&1' >/dev/null 2>&1; then
    VM_MODE="remote"
    export LUME_REMOTE_ENABLED="true"
    return 0
  fi

  # 2. Probe local Lume CLI.
  if command -v lume >/dev/null 2>&1; then
    VM_MODE="local-vm"
    export LUME_REMOTE_ENABLED="false"
    return 0
  fi

  # 3. Fallback: local filesystem.
  VM_MODE="local-fs"
  return 0
}

# Print a human-readable description of the detected mode for log output.
describe_vm_mode() {
  case "$VM_MODE" in
    remote)
      echo "remote Lume VM on ${LUME_REMOTE_HOST:-app-user@homeserver.local}"
      ;;
    local-vm)
      echo "local Lume VM ($LUME_VM_NAME)"
      ;;
    local-fs)
      echo "local filesystem (no VM available)"
      ;;
  esac
}
