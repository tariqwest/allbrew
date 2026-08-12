#!/bin/bash
set -euo pipefail

# Manual cleanup / recovery for local allbrew E2E test runs.
#
# Default (no args): dry-run — show test residue and available snapshots
# without changing anything.
#
# Usage:
#   scripts/test-local-cleanup.sh                  # dry-run (safe, default)
#   scripts/test-local-cleanup.sh --dry-run        # explicit dry-run
#   scripts/test-local-cleanup.sh --restore        # restore latest snapshot
#   scripts/test-local-cleanup.sh --force          # restore + remove disposable taps +
#                                                  #        kill orphaned fixtures +
#                                                  #        stop registered services
#   scripts/test-local-cleanup.sh --help

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNS_DIR="$REPO_ROOT/tests/e2e-runs/local"
LATEST_LINK="$RUNS_DIR/latest"
ALLBREW_CONFIG_DIR="$HOME/.config/allbrew"
# Registry dir mirrors tests/helpers/test-cleanup-registry.ts (TMPDIR default).
REGISTRY_DIR="${TMPDIR:-/tmp}/allbrew-test-registries"

MODE="dry-run"
for arg in "$@"; do
  case "$arg" in
    --dry-run)  MODE="dry-run" ;;
    --restore)  MODE="restore" ;;
    --force)    MODE="force" ;;
    --help|-h)
      echo "Usage: $(basename "$0") [--dry-run|--restore|--force]"
      echo ""
      echo "  --dry-run   Show test residue and available snapshots (default, safe)"
      echo "  --restore   Restore ~/.config/allbrew from the latest snapshot"
      echo "  --force     Restore + untap disposable test/e2e-tap-* taps, uninstall their"
      echo "              packages, kill orphaned fixture processes, and stop registered"
      echo "              Homebrew services"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

log()  { echo "[local-cleanup] $*"; }
warn() { echo "[local-cleanup] WARNING: $*" >&2; }

# --- Process-alive check (portable, no /proc dependency) ---
proc_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

# --- Iterate registry files and emit lines: <testPid> <alive> <fixturePid> <port> <label> ---
# Used by both dry-run (report) and force (kill) modes. Reads JSON via python3.
iter_registry_fixtures() {
  [[ -d "$REGISTRY_DIR" ]] || return 0
  for f in "$REGISTRY_DIR"/registry-*.json; do
    [[ -f "$f" ]] || continue
    python3 - "$f" <<'PY' 2>/dev/null || true
import json, sys, os
with open(sys.argv[1]) as fh:
    reg = json.load(fh)
test_pid = reg.get("testPid", 0)
try:
    os.kill(test_pid, 0)
    alive = "alive"
except Exception:
    alive = "dead"
for fx in reg.get("fixtures", []):
    print(f"{test_pid}\t{alive}\t{fx.get('pid',0)}\t{fx.get('port',0)}\t{fx.get('label','')}")
PY
  done
}

iter_registry_services() {
  [[ -d "$REGISTRY_DIR" ]] || return 0
  for f in "$REGISTRY_DIR"/registry-*.json; do
    [[ -f "$f" ]] || continue
    python3 - "$f" <<'PY' 2>/dev/null || true
import json, sys, os
with open(sys.argv[1]) as fh:
    reg = json.load(fh)
test_pid = reg.get("testPid", 0)
try:
    os.kill(test_pid, 0)
    alive = "alive"
except Exception:
    alive = "dead"
for svc in reg.get("services", []):
    print(f"{test_pid}\t{alive}\t{svc.get('formulaName','')}\t{svc.get('plistLabel','')}\t{svc.get('tap','')}")
PY
  done
}

# --- Resolve latest snapshot ---
resolve_snapshot_dir() {
  if [[ -L "$LATEST_LINK" ]]; then
    readlink "$LATEST_LINK"
  elif [[ -f "$LATEST_LINK" ]]; then
    cat "$LATEST_LINK" | tr -d '\n'
  else
    echo ""
  fi
}

SNAPSHOT_DIR="$(resolve_snapshot_dir)"

# --- List disposable taps (test/e2e-tap-<pid>-<seq>) ---
list_disposable_taps() {
  brew tap 2>/dev/null | grep -E '^test/e2e-tap-[0-9]+-[0-9]+$' || true
}

# --- List packages from a tap ---
list_packages_from_tap() {
  local tap="$1"
  brew list --full-name 2>/dev/null | grep "^${tap}/" || true
}

echo "=========================================="
echo "  allbrew local E2E cleanup"
echo "  Mode: $MODE"
echo "=========================================="
echo ""

# --- Show current state ---
log "Current ~/.config/allbrew state:"
if [[ -d "$ALLBREW_CONFIG_DIR" ]]; then
  echo "  config.json: $([[ -f "$ALLBREW_CONFIG_DIR/config.json" ]] && echo 'present' || echo 'absent')"
  echo "  packages/:   $([[ -d "$ALLBREW_CONFIG_DIR/packages" ]] && ls "$ALLBREW_CONFIG_DIR/packages"/*.json 2>/dev/null | wc -l | tr -d ' ' || echo '0') manifests"
else
  echo "  (not present)"
fi
echo ""

log "Available snapshots:"
if [[ ! -d "$RUNS_DIR" ]]; then
  echo "  (none — tests/e2e-runs/local does not exist)"
elif ! ls -1d "$RUNS_DIR"/*/ >/dev/null 2>&1; then
  echo "  (none — no snapshot directories found)"
else
  for d in "$RUNS_DIR"/*/; do
    [[ -d "$d" ]] || continue
    local_ts="$(basename "$d")"
    # Skip the `latest` symlink — it's a duplicate of an actual snapshot dir.
    [[ "$local_ts" == "latest" ]] && continue
    local_empty="(unknown)"
    if [[ -f "$d/snapshot.json" ]]; then
      local_empty="$(grep -oE '"empty":\s*(true|false)' "$d/snapshot.json" | grep -oE '(true|false)')"
    fi
    echo "  $local_ts  empty=$local_empty  $d"
  done
fi
echo ""

log "Latest snapshot: ${SNAPSHOT_DIR:-(none)}"
echo ""

DISPOSABLE_TAPS="$(list_disposable_taps)"
log "Disposable test taps currently registered:"
if [[ -n "$DISPOSABLE_TAPS" ]]; then
  echo "$DISPOSABLE_TAPS" | sed 's/^/  /'
else
  echo "  (none)"
fi
echo ""

# --- T0.2: fixture process + service residue (from test-cleanup-registry) ---
log "Test cleanup registry ($REGISTRY_DIR):"
if [[ ! -d "$REGISTRY_DIR" ]] || ! ls "$REGISTRY_DIR"/registry-*.json >/dev/null 2>&1; then
  echo "  (no registry files)"
else
  echo "  Fixture processes:"
  fixture_lines="$(iter_registry_fixtures)"
  if [[ -z "$fixture_lines" ]]; then
    echo "    (none)"
  else
    echo "$fixture_lines" | awk -F'\t' '{ printf "    testPid=%s (%s)  fixturePid=%s  port=%s  label=%s\n", $1, $2, $3, $4, $5 }'
  fi
  echo "  Registered services:"
  service_lines="$(iter_registry_services)"
  if [[ -z "$service_lines" ]]; then
    echo "    (none)"
  else
    echo "$service_lines" | awk -F'\t' '{ printf "    testPid=%s (%s)  formula=%s  plist=%s  tap=%s\n", $1, $2, $3, $4, $5 }'
  fi
fi
echo ""

# --- Dry run: stop here ---
if [[ "$MODE" == "dry-run" ]]; then
  log "Dry run complete. No changes made."
  log "To restore config:    $(basename "$0") --restore"
  log "To full cleanup:      $(basename "$0") --force"
  exit 0
fi

# --- Restore snapshot ---
if [[ -z "$SNAPSHOT_DIR" || ! -d "$SNAPSHOT_DIR" ]]; then
  warn "No snapshot available to restore. Aborting."
  exit 1
fi

BACKUP_DIR="$SNAPSHOT_DIR/config-backup"
SNAPSHOT_EMPTY="false"
[[ -f "$SNAPSHOT_DIR/snapshot.json" ]] && \
  SNAPSHOT_EMPTY="$(grep -oE '"empty":\s*(true|false)' "$SNAPSHOT_DIR/snapshot.json" | grep -oE '(true|false)')"

log "Restoring ~/.config/allbrew from $BACKUP_DIR (empty=$SNAPSHOT_EMPTY)..."
rm -rf "$ALLBREW_CONFIG_DIR"
if [[ "$SNAPSHOT_EMPTY" != "true" ]]; then
  cp -R "$BACKUP_DIR" "$ALLBREW_CONFIG_DIR"
fi
log "Config restored."
echo ""

# --- Force mode: also remove disposable taps and their packages ---
if [[ "$MODE" == "force" ]]; then
  log "Force mode: removing disposable taps and their packages..."
  if [[ -z "$DISPOSABLE_TAPS" ]]; then
    echo "  (no disposable taps to remove)"
  else
    while IFS= read -r tap; do
      [[ -z "$tap" ]] && continue
      pkgs="$(list_packages_from_tap "$tap")"
      if [[ -n "$pkgs" ]]; then
        log "  Uninstalling packages from $tap:"
        echo "$pkgs" | sed 's/^/    /'
        brew uninstall --force $pkgs 2>&1 | sed 's/^/    /' || true
      fi
      log "  Untapping $tap"
      brew untap --force "$tap" 2>&1 | sed 's/^/    /' || true
    done <<< "$DISPOSABLE_TAPS"
  fi
  echo ""

  # T0.2: stop registered Homebrew services from orphaned test processes.
  log "Force mode: stopping registered Homebrew services..."
  service_lines="$(iter_registry_services)"
  if [[ -z "$service_lines" ]]; then
    echo "  (no registered services)"
  else
    while IFS=$'\t' read -r test_pid alive formula plist tap; do
      [[ -z "$formula" ]] && continue
      # Only stop services from dead test processes (orphans). Live test
      # processes are still running and own their services.
      if [[ "$alive" == "alive" ]]; then
        echo "  skipping $formula (testPid=$test_pid still alive)"
        continue
      fi
      # Strip the tap prefix for `brew services stop <name>`.
      name="${formula##*/}"
      log "  stopping $name (plist=$plist)"
      brew services stop "$name" 2>&1 | sed 's/^/    /' || true
      if [[ -n "$plist" ]]; then
        launchctl unload "$plist" 2>&1 | sed 's/^/    /' || true
      fi
    done <<< "$service_lines"
  fi
  echo ""

  # T0.2: kill orphaned fixture processes (only those from dead test PIDs).
  log "Force mode: killing orphaned fixture processes..."
  fixture_lines="$(iter_registry_fixtures)"
  if [[ -z "$fixture_lines" ]]; then
    echo "  (no fixture processes registered)"
  else
    while IFS=$'\t' read -r test_pid alive fixture_pid port label; do
      [[ "$fixture_pid" =~ ^[0-9]+$ ]] || continue
      if [[ "$alive" == "alive" ]]; then
        echo "  skipping fixturePid=$fixture_pid (testPid=$test_pid still alive)"
        continue
      fi
      if proc_alive "$fixture_pid"; then
        log "  killing fixturePid=$fixture_pid (port=$port label=$label)"
        kill -TERM "$fixture_pid" 2>/dev/null || true
      else
        echo "  fixturePid=$fixture_pid not alive (already exited)"
      fi
    done <<< "$fixture_lines"
  fi
  echo ""

  # T0.2: purge orphaned registry files (those whose test process is dead).
  log "Force mode: purging orphaned registry files..."
  if [[ ! -d "$REGISTRY_DIR" ]] || ! ls "$REGISTRY_DIR"/registry-*.json >/dev/null 2>&1; then
    echo "  (no registry files)"
  else
    purged=0
    for f in "$REGISTRY_DIR"/registry-*.json; do
      [[ -f "$f" ]] || continue
      test_pid_file="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("testPid",0))' "$f" 2>/dev/null || echo 0)"
      if [[ "$test_pid_file" =~ ^[0-9]+$ ]] && ! proc_alive "$test_pid_file"; then
        rm -f "$f"
        purged=$((purged + 1))
      fi
    done
    echo "  purged $purged orphaned registry file(s)"
  fi
  echo ""

  log "Force cleanup complete."
fi

log "Done."
