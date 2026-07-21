#!/bin/bash
set -euo pipefail

# Reset the E2E VM to a virgin state for the next test run.
# Removes all installed packages, taps, allbrew config/manifests, tap repos,
# MAS apps, Setapp apps, and brew cache.
#
# The run record (readout, test output, metadata) from the current run is
# preserved in the run-record directory on the host.
#
# Usage:
#   scripts/e2e-vm-reset.sh              # full reset (keeps Homebrew/Bun/mas CLI)
#   scripts/e2e-vm-reset.sh --nuclear    # also uninstall Homebrew, Bun, mas CLI
#   scripts/e2e-vm-reset.sh --readout    # run readout before reset
#   scripts/e2e-vm-reset.sh --readout /path/to/test.log

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e2e-vm-config.sh
source "$SCRIPT_DIR/e2e-vm-config.sh"

NUCLEAR=false
DO_READOUT=false
TEST_LOG=""

for arg in "$@"; do
  case "$arg" in
    --nuclear) NUCLEAR=true ;;
    --readout) DO_READOUT=true ;;
    --help|-h)
      echo "Usage: $(basename "$0") [--nuclear] [--readout [test-log-path]]"
      echo ""
      echo "  --nuclear   Also uninstall Homebrew, Bun, and mas CLI"
      echo "  --readout   Run e2e-vm-readout.sh before resetting"
      echo ""
      echo "If --readout is passed, an optional test log path can follow it."
      exit 0
      ;;
    --*)
      # Could be a path argument after --readout
      if $DO_READOUT && [[ -z "$TEST_LOG" && -f "$arg" ]]; then
        TEST_LOG="$arg"
      else
        echo "Unknown option: $arg" >&2
        exit 1
      fi
      ;;
    *)
      if $DO_READOUT && [[ -z "$TEST_LOG" ]]; then
        TEST_LOG="$arg"
      else
        echo "Unknown argument: $arg" >&2
        exit 1
      fi
      ;;
  esac
done

log() { echo "[e2e-vm-reset] $*"; }

if ! vm_running; then
  echo "[e2e-vm-reset] ERROR: VM '$LUME_VM_NAME' is not running" >&2
  exit 1
fi

init_run_dir
RESET_LOG="$RUN_DIR/reset.log"

log "Reset log: $RESET_LOG"
log "Run record preserved at: $RUN_DIR"

# Optionally run readout first
if $DO_READOUT; then
  log "Running readout before reset..."
  "$SCRIPT_DIR/e2e-vm-readout.sh" "$TEST_LOG" || log "WARNING: readout failed, continuing with reset"
fi

# Helper: run a command in the VM, log to reset.log, don't fail the whole script
vm_run() {
  local description="$1"
  shift
  echo "" >> "$RESET_LOG"
  echo "=== $description ===" >> "$RESET_LOG"
  lume_ssh_cmd --timeout 0 "
    export PATH=\"/opt/homebrew/bin:/usr/local/bin:\$HOME/.bun/bin:\$PATH\"
    ${*}
  " >> "$RESET_LOG" 2>&1 || echo "  (command failed — see above)" >> "$RESET_LOG"
}

log "Starting VM reset..."

# 1. Uninstall all casks first (casks may depend on formulae)
vm_run "Uninstall all casks" '
  CASKS=$(brew list --cask 2>/dev/null || true)
  if [ -n "$CASKS" ]; then
    brew uninstall --cask $CASKS 2>&1 || true
  else
    echo "(no casks installed)"
  fi
'

# 2. Uninstall all formulae
vm_run "Uninstall all formulae" '
  FORMULAE=$(brew list --formula 2>/dev/null | grep -v "^allbrew$" || true)
  if [ -n "$FORMULAE" ]; then
    brew uninstall --formula $FORMULAE 2>&1 || true
    # Second pass for dependencies
    brew uninstall --formula $(brew list --formula 2>/dev/null) 2>&1 || true
  else
    echo "(no formulae installed)"
  fi
'

# 3. Uninstall allbrew formula if it exists
vm_run "Uninstall allbrew formula" '
  brew uninstall --formula allbrew 2>/dev/null || echo "(allbrew formula not installed)"
'

# 4. Remove custom taps (preserve core taps)
vm_run "Remove custom taps" '
  TAPS=$(brew tap 2>/dev/null || true)
  for tap in $TAPS; do
    case "$tap" in
      homebrew/core|homebrew/cask|homebrew/bundle|homebrew/services) ;;
      *) brew untap "$tap" 2>&1 || echo "  (could not untap $tap)" ;;
    esac
  done
  echo "Remaining taps:"
  brew tap 2>/dev/null || echo "(none)"
'

# 5. Uninstall MAS apps
vm_run "Uninstall MAS apps" '
  if command -v mas >/dev/null 2>&1; then
    MAS_APPS=$(mas list 2>/dev/null | awk "{print \$1}" || true)
    if [ -n "$MAS_APPS" ]; then
      for id in $MAS_APPS; do
        mas uninstall "$id" 2>&1 || echo "  (could not uninstall app $id)"
      done
    else
      echo "(no MAS apps installed)"
    fi
  else
    echo "(mas not installed)"
  fi
'

# 6. Remove Setapp
vm_run "Remove Setapp" '
  if [ -d /Applications/Setapp ]; then
    rm -rf /Applications/Setapp 2>&1 || echo "  (could not remove Setapp dir)"
  fi
  rm -rf ~/.setapp 2>/dev/null || true
  # Uninstall setapp-cli if installed via brew
  brew uninstall setapp-cli 2>/dev/null || true
  echo "(Setapp cleanup done)"
'

# 7. Remove allbrew config and manifests
vm_run "Remove allbrew config and manifests" '
  rm -rf ~/.config/allbrew 2>&1 || true
  echo "(allbrew config removed)"
'

# 8. Remove tap checkout directories
vm_run "Remove tap checkout directories" '
  for dir in ~/homebrew-* ~/homebrew-mytapp; do
    if [ -d "$dir" ]; then
      rm -rf "$dir" 2>&1 && echo "  removed: $dir"
    fi
  done
  echo "(tap checkout cleanup done)"
'

# 9. Remove allbrew global link
vm_run "Remove allbrew global link" '
  if command -v allbrew >/dev/null 2>&1; then
    rm -f "$(which allbrew)" 2>/dev/null || true
  fi
  bun remove -g allbrew 2>/dev/null || true
  echo "(allbrew global link removed)"
'

# 10. Clean Homebrew cache and downloads
vm_run "Clean Homebrew cache" '
  brew cleanup --prune=all 2>&1 || true
  rm -rf "$(brew --cache)"/* 2>/dev/null || true
  echo "(cache cleaned)"
'

# 11. Remove any leftover apps in /Applications that were brew-installed
vm_run "Remove leftover /Applications brew artifacts" '
  # List what remains in /Applications for inspection
  ls /Applications/ 2>/dev/null | head -30
'

# --- Nuclear option: remove Homebrew, Bun, mas CLI themselves ---
if $NUCLEAR; then
  log "NUCLEAR mode: uninstalling Homebrew, Bun, and mas CLI..."

  vm_run "Uninstall mas CLI" '
    brew uninstall mas 2>/dev/null || true
    echo "(mas CLI removed)"
  '

  vm_run "Uninstall Homebrew" '
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)" 2>&1 <<< "y"
    echo "(Homebrew uninstalled)"
  '

  vm_run "Uninstall Bun" '
    rm -rf ~/.bun 2>&1 || true
    echo "(Bun removed)"
  '

  vm_run "Remove Homebrew shell config remnants" '
    for f in ~/.zshrc ~/.bash_profile ~/.bashrc; do
      if [ -f "$f" ]; then
        sed -i "" "/homebrew/d; /\.bun/d" "$f" 2>/dev/null || true
      fi
    done
    echo "(shell config cleaned)"
  '
fi

# 12. Final verification — show what remains
vm_run "Post-reset verification" '
  echo "Homebrew: $(brew --version 2>/dev/null || echo NOT INSTALLED)"
  echo "Bun: $(bun --version 2>/dev/null || echo NOT INSTALLED)"
  echo "mas: $(mas version 2>/dev/null || echo NOT INSTALLED)"
  echo "allbrew: $(allbrew --version 2>/dev/null || echo NOT INSTALLED)"
  echo ""
  echo "Installed formulae: $(brew list --formula 2>/dev/null | wc -l | tr -d " ")"
  echo "Installed casks: $(brew list --cask 2>/dev/null | wc -l | tr -d " ")"
  echo "Custom taps: $(brew tap 2>/dev/null | grep -v homebrew | wc -l | tr -d " ")"
  echo "allbrew config: $([ -d ~/.config/allbrew ] && echo EXISTS || echo ABSENT)"
  echo ""
  echo "Disk:"
  df -h / | tail -1
'

log "Reset complete."
log "  Reset log:   $RESET_LOG"
log "  Run record:  $RUN_DIR"
log ""
log "The VM is ready for the next test run."
if $NUCLEAR; then
  log "Note: Homebrew/Bun/mas were uninstalled. Run scripts/e2e-vm-setup.sh to reinstall."
else
  log "Note: Homebrew/Bun/mas CLI preserved. Run scripts/e2e-vm-run-tests.sh for the next run."
fi
