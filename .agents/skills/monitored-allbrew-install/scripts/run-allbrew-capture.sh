#!/usr/bin/env bash
# Run Homebrew-installed allbrew against a URL with non-interactive defaults
# and full log capture. Service detection is left to allbrew (no --service /
# --no-service). Prints log path and exit code on the last lines.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: run-allbrew-capture.sh --url <url> [options]

Options:
  --url <url>           Required package/repo/asset URL
  --name <name>         Formula/cask name (--name)
  --package <name>      Registry package override (--package)
  --desc <text>         Description (--desc)
  --bin-name <name>     Binary name override
  --app-name <name>     Cask app name override
  --type <generator>    Force generator type
  --allbrew <path>      allbrew binary (default: /opt/homebrew/bin/allbrew)
  --extra <args>        Extra args as a single string (split on spaces)
  --log <path>          Log file path (default: /tmp/allbrew-monitor-*.log)
  -h, --help            Show help

Note: Do not pass --service / --no-service here. allbrew auto-detects service
blocks; the monitored-allbrew-install skill compares that decision to an
independent agent expectation.
EOF
}

URL=""
NAME=""
PACKAGE=""
DESC=""
BIN_NAME=""
APP_NAME=""
TYPE=""
ALLBREW_BIN="${ALLBREW_BIN:-/opt/homebrew/bin/allbrew}"
EXTRA=""
LOG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --name) NAME="${2:-}"; shift 2 ;;
    --package) PACKAGE="${2:-}"; shift 2 ;;
    --desc) DESC="${2:-}"; shift 2 ;;
    --bin-name) BIN_NAME="${2:-}"; shift 2 ;;
    --app-name) APP_NAME="${2:-}"; shift 2 ;;
    --type) TYPE="${2:-}"; shift 2 ;;
    --service|--no-service)
      echo "Refusing $1: service detection must remain automatic for monitored installs." >&2
      exit 2
      ;;
    --allbrew) ALLBREW_BIN="${2:-}"; shift 2 ;;
    --extra) EXTRA="${2:-}"; shift 2 ;;
    --log) LOG="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$URL" ]]; then
  echo "--url is required" >&2
  usage >&2
  exit 2
fi

if [[ ! -x "$ALLBREW_BIN" ]]; then
  if command -v allbrew >/dev/null 2>&1; then
    ALLBREW_BIN="$(command -v allbrew)"
  else
    echo "allbrew not found at $ALLBREW_BIN and not on PATH" >&2
    exit 127
  fi
fi

slug="$(basename "${NAME:-$URL}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//')"
ts="$(date +%Y%m%d%H%M%S)"
if [[ -z "$LOG" ]]; then
  LOG="/tmp/allbrew-monitor-${slug:-pkg}-${ts}.log"
fi

args=("$URL" --verbose)
if [[ -n "$NAME" ]]; then args+=(--name "$NAME"); fi
if [[ -n "$PACKAGE" ]]; then args+=(--package "$PACKAGE"); fi
if [[ -n "$DESC" ]]; then args+=(--desc "$DESC"); fi
if [[ -n "$BIN_NAME" ]]; then args+=(--bin-name "$BIN_NAME"); fi
if [[ -n "$APP_NAME" ]]; then args+=(--app-name "$APP_NAME"); fi
if [[ -n "$TYPE" ]]; then args+=(--type "$TYPE"); fi
if [[ -n "$EXTRA" ]]; then
  # shellcheck disable=SC2206
  extra_arr=($EXTRA)
  for a in "${extra_arr[@]}"; do
    if [[ "$a" == "--service" || "$a" == "--no-service" ]]; then
      echo "Refusing $a in --extra: service detection must remain automatic." >&2
      exit 2
    fi
  done
  args+=("${extra_arr[@]}")
fi

{
  echo "# allbrew monitored run"
  echo "# date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# binary: $ALLBREW_BIN"
  echo "# version: $($ALLBREW_BIN --version 2>/dev/null || true)"
  echo "# argv: $ALLBREW_BIN ${args[*]}"
  echo "# service_flags: none (auto-detect)"
  echo
} >"$LOG"

set +e
"$ALLBREW_BIN" "${args[@]}" >>"$LOG" 2>&1
ec=$?
set -e

{
  echo
  echo "# exit_code: $ec"
} >>"$LOG"

echo "LOG=$LOG"
echo "EXIT_CODE=$ec"
exit "$ec"
