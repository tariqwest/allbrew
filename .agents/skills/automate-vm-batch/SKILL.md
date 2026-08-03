---
name: automate-vm-batch
description: Automate Lume VM provisioning, endpoint lock recovery, and multi-worker monitored allbrew app installation batches. Use whenever the user asks to "run a monitored batch", "automate vm batch", "provision lume vm for batch testing", "run allbrew batch installs across VMs", "purge vm locks", or execute end-to-end multi-worker allbrew installation testing.
---

# Automate VM Provisioning & Monitored Allbrew Batch Installation

This skill provides comprehensive automation for provisioning Lume macOS testing harness VMs, managing dual-endpoint host mutex locks, and executing multi-worker monitored `allbrew` app installation batches across candidate URLs.

---

## Architecture & Isolation Model

### 1. VM & Endpoint Layout
- **Remote Endpoint (`homeserver`)**: Remote Lume VM (`vm-homeserver-macos-testing`) accessed via `app-user@homeserver.local` (`LUME_REMOTE_ENABLED=true`).
- **Local Endpoint (`local`)**: Twin VM (`vm-local-macos-testing`) on local host (`LUME_REMOTE_ENABLED=false`).
- **Guest Workspace & User**: Dedicated non-root account `th-allbrew` with an exclusive mounted sparsebundle prefix at `/opt/homebrew`. (Note: JS helper `lib/batch-helpers.mjs` falls back to `["th-allbrew-w1", "th-allbrew-w2"]` if `TH_BATCH_WORKERS` is not set).

### 2. Lock & Concurrency Control
- **Host Endpoint Mutex**: Directory locks in `tests/monitored-install-batch/logs/vm-mutex-<id>.lockdir` serialize host access per VM endpoint (`acquireEndpointMutex`).
- **Guest Prefix Lock Recovery**: Force-detaches `/opt/homebrew` and clears `/var/run/lume-homebrew.lock` to prevent `env_fail` cascades on process crashes.
- **Worker Scaling (1 → 4 → 8)**: Dispatches workers across independent endpoints (`homeserver` + `local`) to enable parallel execution without prefix contention.

---

## 5-Phase Monitored Installation Skill Loop

For every URL in `tests/monitored-install-batch/urls-shuffled.json`:

1. **Phase 0.5: Heuristic Judgment**
   - Analyzes formula/cask docs and URL shape without full LLM overhead.
   - Writes initial judgment to `agent-judgment.json`.

2. **Phase 1: allbrew Capture & Install**
   - Spawns non-interactive install inside VM as `th-allbrew`:
     ```bash path=null start=null
     ALLBREW_NONINTERACTIVE=1 allbrew "<URL>" --name "<slug>" --verbose [--tap <path>]
     ```

3. **Phase 2 & 3: Strict Verification**
   - Verifies package list (`brew list <slug>` / `brew list --cask <slug>`).
   - Validates `manifest.json`.
   - Confirms CLI execution (`--version`, `--help`) or GUI `.app` bundle existence.
   - Audits background services (`brew services` / LaunchAgents).

4. **Phase 4: Option-A Fix Capture (on Failure)**
   - Reproduces locally in a temporary tap if `TH_BATCH_LOCAL_REPRO=1`.
   - Writes generated formula (`formula.rb`), patch diffs, and validation status to `fix-package/` without committing to remote branches.

5. **Phase 5: Hygiene & Record Finalization**
   - Uninstalls package (`allbrew uninstall --force <slug>`).
   - Finalizes canonical run record under `tests/monitored-install-runs/<timestamp>__<slug>/`.
   - Updates `index.jsonl`, `fix-index.jsonl`, and `progress.json`.

---

## Automation Script Reference (`automate-vm-batch.sh`)

The shell automation helper is located at `tests/monitored-install-batch/automate-vm-batch.sh`. Single-installation executions can also be driven via `vm-install-one.mjs` using `--url <url> --name <slug> [--endpoint homeserver|local] [--log <path>]`.

### Key CLI Flags
- `-c, --concurrency <N>`: Worker concurrency target (default: `8`).
- `-w, --workers <list>`: Comma-separated guest VM users (default: `th-allbrew`).
- `-f, --fix-mode <mode>`: Option-A fix capture mode (`docs` or `off`).
- `-t, --timeout <ms>`: Per-install timeout in milliseconds (default: `720000`).
- `-p, --provision`: Run VM setup (`npm run vm:setup`) prior to batch.
- `-r, --reset-locks`: Purge host mutex lockdirs and guest lock files.
- `-m, --monitor`: Follow `progress.json` in real time.
- `-d, --dry-run`: Validate environment configuration and execution plan without running.
- `--local-only`: Restrict execution to local twin VM (`LUME_REMOTE_ENABLED=false`).

---

## Quick Start & Verification

### 1. Run Automation Dry-Run
```bash path=null start=null
tests/monitored-install-batch/automate-vm-batch.sh --dry-run --concurrency 8 --reset-locks
```

### 2. Execute Production Batch with Monitoring
```bash path=null start=null
tests/monitored-install-batch/automate-vm-batch.sh --provision --reset-locks --concurrency 8 --monitor
```

### 3. Run Test Suite for Script Logic
```bash path=null start=null
bun test tests/unit/automate-vm-batch.test.ts
```

---

## Artifact & Log Locations

- **Batch Index**: `tests/monitored-install-batch/index.jsonl`
- **Fix Index**: `tests/monitored-install-batch/fix-index.jsonl`
- **Real-Time Progress**: `tests/monitored-install-batch/progress.json`
- **Canonical Run Records**: `tests/monitored-install-runs/<timestamp>__<slug>/`
- **Host Lock Directories**: `tests/monitored-install-batch/logs/vm-mutex-*.lockdir`
