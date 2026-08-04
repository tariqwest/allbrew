#!/usr/bin/env bash
# ==============================================================================
# automate-vm-batch.sh
# Automated VM Provisioning & Skill-Aligned Allbrew Monitored Batch Runner
#
# Abstracted from: https://app.warp.dev/conversation/0132616e-d363-49a5-aab7-6da2145c818f
# ==============================================================================

set -euo pipefail

# --- Color Definitions ---
BOLD='\030[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Default Configurations ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

CONCURRENCY=8
WORKERS="th-allbrew"
FIX_MODE="docs"
STRICT_VERIFY=1
LOCAL_REPRO=1
TIMEOUT_MS=720000
LUME_REMOTE=true
PROVISION_VM=false
RESET_LOCKS=false
MONITOR=false
DRY_RUN=false

# --- Usage Helper ---
usage() {
  local exit_code="${1:-0}"
  cat <<EOF
${BOLD}Usage:${NC} $(basename "$0") [options]

${BOLD}Description:${NC}
  Automates Lume VM provisioning, mutex lock purging, and multi-worker monitored
  allbrew app installation batches.

${BOLD}Options:${NC}
  -c, --concurrency <N>  Set worker concurrency (default: ${CONCURRENCY})
  -w, --workers <list>   Comma-separated VM user pool (default: ${WORKERS})
  -f, --fix-mode <mode>  Fix capture mode: 'docs' (Option-A) or 'off' (default: ${FIX_MODE})
  -t, --timeout <ms>     Timeout per installation in ms (default: ${TIMEOUT_MS})
  -p, --provision        Run VM setup/provisioning prior to starting the batch
  -r, --reset-locks      Purge host lockdirs & force-unlock guest Homebrew locks
  -m, --monitor          Follow state/progress.json in real-time during execution
  -d, --dry-run          Show env vars and command execution plan without running
  --local-only           Disable remote VM execution (LUME_REMOTE_ENABLED=false)
  -h, --help             Display this help menu

${BOLD}Examples:${NC}
  # Standard multi-VM batch with 8 workers and lock reset
  $(basename "$0") --concurrency 8 --reset-locks --monitor

  # Provision VM and run single-worker batch
  $(basename "$0") --provision --concurrency 1 --workers th-allbrew
EOF
  exit "${exit_code}"
}

# --- Parse Arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--concurrency)
      CONCURRENCY="$2"
      shift 2
      ;;
    -w|--workers)
      WORKERS="$2"
      shift 2
      ;;
    -f|--fix-mode)
      FIX_MODE="$2"
      shift 2
      ;;
    -t|--timeout)
      TIMEOUT_MS="$2"
      shift 2
      ;;
    -p|--provision)
      PROVISION_VM=true
      shift
      ;;
    -r|--reset-locks)
      RESET_LOCKS=true
      shift
      ;;
    -m|--monitor)
      MONITOR=true
      shift
      ;;
    -d|--dry-run)
      DRY_RUN=true
      shift
      ;;
    --local-only)
      LUME_REMOTE=false
      shift
      ;;
    -h|--help)
      usage 0
      ;;
    *)
      echo -e "${RED}Error: Unknown option $1${NC}" >&2
      usage 1
      ;;
  esac
done

echo -e "${CYAN}${BOLD}=== Allbrew VM Provisioning & Batch Execution Automation ===${NC}"
echo -e "Repository: ${REPO_DIR}"
echo -e "Batch Dir:  ${SCRIPT_DIR}"

# --- Pre-flight Checks ---
cd "${REPO_DIR}"

if ! command -v lume &>/dev/null; then
  echo -e "${YELLOW}Warning: 'lume' CLI not found in PATH.${NC}"
fi

RUNNER_CMD=""
if command -v bun &>/dev/null; then
  RUNNER_CMD="bun"
elif command -v node &>/dev/null; then
  RUNNER_CMD="node"
else
  echo -e "${RED}Error: Neither 'bun' nor 'node' runtime found.${NC}"
  exit 1
fi
echo -e "JavaScript Runtime: ${RUNNER_CMD}"

URL_FILE="${SCRIPT_DIR}/urls-shuffled.json"
if [[ ! -f "${URL_FILE}" ]]; then
  echo -e "${RED}Error: Target URL list missing at ${URL_FILE}${NC}"
  exit 1
fi

# --- Lock Reset & Hygiene ---
if [[ "${RESET_LOCKS}" == true ]]; then
  echo -e "\n${YELLOW}--> Purging host mutex lockdirs and guest locks...${NC}"
  if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY-RUN] rm -rf ${SCRIPT_DIR}/logs/vm-mutex-*.lockdir"
  else
    rm -rf "${SCRIPT_DIR}/logs"/vm-mutex-*.lockdir 2>/dev/null || true
    echo -e "${GREEN}Host lockdirs purged.${NC}"
  fi
fi

# --- VM Provisioning ---
if [[ "${PROVISION_VM}" == true ]]; then
  echo -e "\n${CYAN}--> Provisioning VM Harness...${NC}"
  if [[ "${DRY_RUN}" == true ]]; then
    echo "[DRY-RUN] ${RUNNER_CMD} run vm:setup"
  else
    npm run vm:setup || true
  fi
fi

# --- Environment Configuration ---
export TH_BATCH_CONCURRENCY="${CONCURRENCY}"
export TH_BATCH_WORKERS="${WORKERS}"
export TH_BATCH_FIX_MODE="${FIX_MODE}"
export TH_BATCH_STRICT_VERIFY="${STRICT_VERIFY}"
export TH_BATCH_LOCAL_REPRO="${LOCAL_REPRO}"
export TH_BATCH_INSTALL_TIMEOUT_MS="${TIMEOUT_MS}"
export LUME_REMOTE_ENABLED="${LUME_REMOTE}"
export ALLBREW_NONINTERACTIVE=1

echo -e "\n${BOLD}Environment Settings:${NC}"
echo "  TH_BATCH_CONCURRENCY        = ${TH_BATCH_CONCURRENCY}"
echo "  TH_BATCH_WORKERS            = ${TH_BATCH_WORKERS}"
echo "  TH_BATCH_FIX_MODE           = ${TH_BATCH_FIX_MODE}"
echo "  TH_BATCH_STRICT_VERIFY      = ${TH_BATCH_STRICT_VERIFY}"
echo "  TH_BATCH_LOCAL_REPRO        = ${TH_BATCH_LOCAL_REPRO}"
echo "  TH_BATCH_INSTALL_TIMEOUT_MS = ${TH_BATCH_INSTALL_TIMEOUT_MS}"
echo "  LUME_REMOTE_ENABLED         = ${LUME_REMOTE_ENABLED}"

# --- Execution Plan ---
BATCH_SCRIPT="${SCRIPT_DIR}/run-orchestrator.mjs"
EXEC_CMD="${RUNNER_CMD} ${BATCH_SCRIPT}"

echo -e "\n${CYAN}--> Executing Batch Orchestrator...${NC}"
echo "Command: ${EXEC_CMD}"

if [[ "${DRY_RUN}" == true ]]; then
  echo -e "${YELLOW}[DRY-RUN] Automation plan generated successfully. Exiting without execution.${NC}"
  exit 0
fi

# --- Launch & Monitor ---
if [[ "${MONITOR}" == true ]]; then
  PROGRESS_FILE="${SCRIPT_DIR}/state/progress.json"
  echo -e "${GREEN}Starting background batch execution with real-time monitoring...${NC}"
  ${EXEC_CMD} &
  BATCH_PID=$!

  # Trap SIGINT to clean up monitoring
  trap "kill ${BATCH_PID} 2>/dev/null || true; exit 1" INT TERM

  sleep 2
  if [[ -f "${PROGRESS_FILE}" ]]; then
    echo -e "${CYAN}Tailing ${PROGRESS_FILE}:${NC}"
    tail -f "${PROGRESS_FILE}" &
    TAIL_PID=$!
    wait ${BATCH_PID} || true
    kill ${TAIL_PID} 2>/dev/null || true
  else
    wait ${BATCH_PID} || true
  fi
else
  ${EXEC_CMD}
fi

echo -e "\n${GREEN}${BOLD}=== Batch Execution Complete ===${NC}"
echo "Outcomes & Artifacts:"
echo "  - Index:        ${SCRIPT_DIR}/state/index.jsonl"
echo "  - Fix Index:    ${SCRIPT_DIR}/state/fix-index.jsonl"
echo "  - Progress:     ${SCRIPT_DIR}/state/progress.json"
echo "  - Run Records:  ${REPO_DIR}/tests/monitored-install-runs/"
