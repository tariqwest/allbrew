#!/bin/bash
set -euo pipefail

# Post-test readout: capture the full state of allbrew, Homebrew, installed
# apps, tap repos, and system state inside the VM after a test run.
# All output is written to a timestamped run-record directory on the host.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

TEST_LOG="${1:-}"

log() { echo "[e2e-vm-readout] $*"; }

if ! vm_running; then
  echo "[e2e-vm-readout] ERROR: VM '$LUME_VM_NAME' is not running" >&2
  exit 1
fi

init_run_dir
READOUT_FILE="$(run_dir)/readout.txt"
METADATA_FILE="$(run_dir)/metadata.json"

log "Writing readout to $(run_dir)"

# Header with run metadata
{
  echo "=========================================="
  echo "  allbrew E2E Run Readout"
  echo "  Timestamp:  $LUME_RUN_TS"
  echo "  VM:         $LUME_VM_NAME"
  echo "  Host repo:  $LUME_SHARED_DIR"
  echo "  VM mount:   $LUME_VM_REPO_MOUNT"
  echo "=========================================="
  echo ""
} > "$READOUT_FILE"

# Helper: run a command in the VM and append output to the readout
vm_section() {
  local title="$1"
  shift
  echo "" >> "$READOUT_FILE"
  echo "------------------------------------------" >> "$READOUT_FILE"
  echo "  $title" >> "$READOUT_FILE"
  echo "------------------------------------------" >> "$READOUT_FILE"
  lume_ssh_cmd --timeout 60 "
    export PATH=\"/opt/homebrew/bin:/usr/local/bin:\$HOME/.bun/bin:\$PATH\"
    ${*}
  " >> "$READOUT_FILE" 2>&1 || echo "  (command failed or produced no output)" >> "$READOUT_FILE"
}

# Helper: run a local command and append to readout
host_section() {
  local title="$1"
  shift
  echo "" >> "$READOUT_FILE"
  echo "------------------------------------------" >> "$READOUT_FILE"
  echo "  $title" >> "$READOUT_FILE"
  echo "------------------------------------------" >> "$READOUT_FILE"
  (cd "$LUME_SHARED_DIR" && eval "${*}") >> "$READOUT_FILE" 2>&1 || echo "  (command failed or produced no output)" >> "$READOUT_FILE"
}

# --- System state ---
vm_section "System Info" 'echo "macOS: $(sw_vers -productVersion)"; echo "Arch: $(uname -m)"; echo "CPU: $(sysctl -n hw.ncpu) cores"; echo "RAM: $(($(sysctl -n hw.memsize) / 1024 / 1024 / 1024)) GB"; echo "Disk:"; df -h / | tail -1'

vm_section "Running Processes (brew/allbrew/node/bun)" 'ps aux | grep -E "brew|allbrew|node|bun" | grep -v grep || echo "(none)"'

# --- allbrew state ---
vm_section "allbrew Version" 'allbrew --version 2>/dev/null || bun run "'"${LUME_VM_REPO_MOUNT}"'/bin/allbrew.ts" --version 2>/dev/null || echo "(allbrew not found)"'

vm_section "allbrew Config" 'cat ~/.config/allbrew/config.json 2>/dev/null || echo "(no config file)"'

vm_section "allbrew Manifests" 'ls -la ~/.config/allbrew/packages/ 2>/dev/null && echo "---" && for f in ~/.config/allbrew/packages/*.json; do echo "=== $(basename "$f") ==="; cat "$f"; echo; done 2>/dev/null || echo "(no manifests)"'

vm_section "allbrew Global Link" 'which allbrew 2>/dev/null && ls -la "$(which allbrew)" 2>/dev/null || echo "(not linked)"'

# --- Homebrew state ---
vm_section "Homebrew Version" 'brew --version 2>/dev/null || echo "(Homebrew not installed)"'

vm_section "Homebrew Taps" 'brew tap 2>/dev/null || echo "(none)"'

vm_section "Installed Formulae" 'brew list --formula --versions 2>/dev/null || echo "(none)"'

vm_section "Installed Casks" 'brew list --cask --versions 2>/dev/null || echo "(none)"'

vm_section "Cellar Contents" 'ls -la "$(brew --prefix)/Cellar/" 2>/dev/null || echo "(empty or missing)"'

vm_section "Caskroom Contents" 'ls -la "$(brew --prefix)/Caskroom/" 2>/dev/null || echo "(empty or missing)"'

vm_section "Homebrew Cache" 'du -sh "$(brew --cache)" 2>/dev/null || echo "(no cache)"'

# --- MAS apps ---
vm_section "MAS Apps" 'mas list 2>/dev/null || echo "(mas not installed or no apps)"'

# --- Setapp ---
vm_section "Setapp Apps" 'ls -la /Applications/Setapp/ 2>/dev/null || echo "(Setapp not installed)"; ls ~/.setapp 2>/dev/null || true'

# --- /Applications listing (GUI apps from any source) ---
vm_section "/Applications Contents" 'ls -la /Applications/ 2>/dev/null | head -50'

# --- Tap repo git state ---
vm_section "Tap Repo Git State" '
  TAP_PATH=$(python3 -c "import json;print(json.load(open(\"$HOME/.config/allbrew/config.json\")).get(\"tapPath\",\"\"))" 2>/dev/null || echo "")
  if [ -n "$TAP_PATH" ] && [ -d "$TAP_PATH/.git" ]; then
    echo "Tap path: $TAP_PATH"
    cd "$TAP_PATH"
    echo "--- git log (last 10) ---"
    git log --oneline -10 2>/dev/null
    echo "--- git status ---"
    git status --short 2>/dev/null
    echo "--- git diff (stat) ---"
    git diff --stat 2>/dev/null
    echo "--- Formula/ contents ---"
    ls -la Formula/ 2>/dev/null || echo "(no Formula dir)"
    echo "--- Casks/ contents ---"
    ls -la Casks/ 2>/dev/null || echo "(no Casks dir)"
  else
    echo "(no tap repo found or not a git repo)"
  fi
'

# --- Host repo git state ---
host_section "Host allbrew Repo Git State" 'echo "Branch: $(git branch --show-current)"; echo "--- git log (last 5) ---"; git log --oneline -5; echo "--- git status ---"; git status --short'

# --- Test results summary ---
if [[ -n "$TEST_LOG" && -f "$TEST_LOG" ]]; then
  if [[ "$TEST_LOG" != "$(run_dir)/test-output.log" ]]; then
    cp "$TEST_LOG" "$(run_dir)/test-output.log"
  fi
  echo "" >> "$READOUT_FILE"
  echo "------------------------------------------" >> "$READOUT_FILE"
  echo "  Test Results Summary (from $TEST_LOG)" >> "$READOUT_FILE"
  echo "------------------------------------------" >> "$READOUT_FILE"
  # Extract pass/fail counts from vitest output
  local_pass=$(grep -oE 'Tests\s+[0-9]+ passed' "$TEST_LOG" | tail -1 || true)
  local_fail=$(grep -oE 'Tests\s+[0-9]+ failed' "$TEST_LOG" | tail -1 || true)
  local_files=$(grep -oE 'Test Files\s+[0-9]+ passed' "$TEST_LOG" | tail -1 || true)
  if [[ -n "$local_pass" || -n "$local_fail" ]]; then
    echo "  $local_files" >> "$READOUT_FILE"
    echo "  $local_pass" >> "$READOUT_FILE"
    [[ -n "$local_fail" ]] && echo "  $local_fail" >> "$READOUT_FILE"
  else
    echo "  (could not parse test results — see test-output.log)" >> "$READOUT_FILE"
  fi
  echo "" >> "$READOUT_FILE"
  echo "  Full test output: $(run_dir)/test-output.log" >> "$READOUT_FILE"
else
  echo "" >> "$READOUT_FILE"
  echo "------------------------------------------" >> "$READOUT_FILE"
  echo "  Test Results Summary" >> "$READOUT_FILE"
  echo "------------------------------------------" >> "$READOUT_FILE"
  echo "  (no test log provided — pass a log file as argument)" >> "$READOUT_FILE"
fi

# --- Write machine-readable metadata ---
if is_remote; then
  remote_host_field="\"remoteHost\": \"$LUME_REMOTE_HOST\","
else
  remote_host_field="\"remoteHost\": null,"
fi

cat > "$METADATA_FILE" <<EOF
{
  "timestamp": "$LUME_RUN_TS",
  "vm": "$LUME_VM_NAME",
  $remote_host_field
  "hostRepo": "$LUME_SHARED_DIR",
  "vmMount": "$LUME_VM_REPO_MOUNT",
  "runDir": "$(run_dir)",
  "testLog": "${TEST_LOG:-null}",
  "hostGitSha": "$(cd "$LUME_SHARED_DIR" && git rev-parse HEAD 2>/dev/null || echo unknown)",
  "hostGitBranch": "$(cd "$LUME_SHARED_DIR" && git branch --show-current 2>/dev/null || echo unknown)"
}
EOF

log "Readout complete: $READOUT_FILE"
log "Metadata: $METADATA_FILE"
log "Run directory: $(run_dir)"
