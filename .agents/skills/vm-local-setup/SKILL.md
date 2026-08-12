---
name: vm-local-setup
description: Provision local Lume VMs (vm-local-macos-testing-1/2) and run multi-worker monitored allbrew batches. Use whenever the user asks to "run a monitored batch", "provision local vm", "setup vm-local", "run allbrew batch installs across VMs", "purge vm locks", or execute end-to-end multi-worker allbrew installation testing on the local host.
---

# Automate VM Provisioning & Monitored Allbrew Batch Installation

This skill provides comprehensive automation for provisioning Lume macOS testing harness VMs, managing dual-endpoint host mutex locks, and executing multi-worker monitored `allbrew` app installation batches across candidate URLs.

---

## Architecture & Isolation Model

### 1. VM & Endpoint Layout
- **Remote Endpoint (`homeserver`)**: Remote Lume VM (`vm-homeserver-macos-testing`) accessed via `app-user@homeserver.local` (`LUME_REMOTE_ENABLED=true`). **First setup: 4 CPU / 4 GB** on `external` storage (`/Users/Shared/ExternalDrive/lume-vms`, 477Gi Avail; `home` has only 19Gi); **future runs: 2 CPU / 3.5 GB** (`3584MB`, leaves 4.5 GB host headroom on 8 GB host). See `vm-homeserver-setup` skill for SSH + `lume update --apply` + `rsync` IPSW + `kill -9` stale handling.
- **Local Endpoint (`local-1`, `local-2`)**: Twin VMs (`vm-local-macos-testing-1`, `vm-local-macos-testing-2`) on local host (`LUME_REMOTE_ENABLED=false`). **First setup: 4 CPU / 6 GB**, **future runs: 2 CPU / 4 GB** (local host has >8 GB, no external storage needed).
- **Guest Workspace & User**: Dedicated non-root account `th-allbrew` with an exclusive mounted sparsebundle prefix at `/opt/homebrew`. (Note: JS helper `lib/batch-helpers.mjs` falls back to `["th-allbrew-w1", "th-allbrew-w2"]` if `TH_BATCH_WORKERS` is not set).

### 2. Lock & Concurrency Control
- **Host Endpoint Mutex**: Directory locks in `tests/monitored-install-batch/logs/vm-mutex-<id>.lockdir` serialize host access per VM endpoint (`acquireEndpointMutex`).
- **Guest Prefix Lock Recovery**: Force-detaches `/opt/homebrew` and clears `/var/run/lume-homebrew.lock` to prevent `env_fail` cascades on process crashes.
- **Worker Scaling (1 → 4 → 8)**: Dispatches workers across independent endpoints (`homeserver` + `local`) to enable parallel execution without prefix contention.

---

## Local Twin VM Provisioning (Raw Lume) — 2026-08-11 Verified

Use this when the harness (`macos-test-harness init/setup`) is not desired and you need two independent local VMs from a local IPSW. Verified on Lume **0.5.3**, macOS **26.6 (25G72) Tahoe**, host with Apple Silicon.

### Prerequisites & Config
- **Lume CLI** `0.5.3` at `~/.local/bin/lume` (`lume --version`, `lume --help`, `lume dump-docs`).
- **IPSW** at `/Volumes/EXTBAK2/os-images/UniversalMac_26.6_25G72_Restore.ipsw` — 18G (`19772077142` bytes), `file` reports `Zip archive data`. Host mounts are `exfat` NTFS via `/Volumes/EXTBAK1` + `/Volumes/EXTBAK2` (`diskutil list` shows `disk4s1`/`disk5s1` on `FDisK_partition_scheme`). If `/Volumes/EXTBAK2` missing, re-mount the external drive — `lume create` fails fast with missing IPSW.
- **Disk space**: 50GB per VM (`allocated ~22-24GB` after install, `total 53687091200`). Check `~/.lume/<name>/disk.img` via `lume get <name> --format json` (`diskSize.total`/`allocated`, `cpuCount`, `memorySize`, `status`, `sshAvailable`, `ipAddress`).
- **No existing VMs** expected (`lume ls --format json` → `[]`, `lume images` → `Found 0 cached images`). If stale VMs exist, `lume delete <name> --force` or `lume stop`.
- **Harness context** (`test-suite.ts`): current allbrew `test-suite.ts` sets `TH_HOMEBREW_PREFIX_ENABLED=false` and `homebrewProfiles: []` — raw twin VMs bypass harness `macos-test-harness init/setup` (single shared VM + per-project user + APFS sparsebundle at `~/Library/LumeHomebrew/homebrew.sparsebundle` with VM-global lock `/var/run/lume-homebrew.lock`). For raw Lume, each VM has its own `/opt/homebrew` directly — no sparsebundle/multiplex needed, enabling true parallel `brew install`. Document which mode you used in the run record.
- **Consult before provisioning**: `lume create --help`, `lume set --help`, `lume clone --help`, `lume run --help`, `lume ssh --help`, `lume stop --help`, plus `node_modules/macos-testing-harness/README.md` and `test-suite.ts` for harness `defineTestSuite`/`homebrewProfiles`/`hooks.setupRuntime`.

### 7-Step Sequence (Exact Commands Verified)

**Step 1 — Create `vm-local-macos-testing-1` (4 CPU / 6GB / 50GB / tahoe unattended)**
```bash
lume create vm-local-macos-testing-1 \
  --ipsw /Volumes/EXTBAK2/os-images/UniversalMac_26.6_25G72_Restore.ipsw \
  --unattended tahoe \
  --cpu 4 --memory 6GB --disk-size 50GB
```
- Takes ~4 min for macOS install (progress 0→100%, logs `Installing macOS progress=N%` every 1-2s), then offline unattended setup: `Starting offline unattended setup` → `Starting VM once to materialize first-boot state` (IP `192.168.64.20` via VNC `127.0.0.1:52652`) → `Stopping VM before offline patch` → `Offline macOS unattended setup completed mountPoint=/Volumes/Data` → boot again for SSH health check (`retries=60`, 5s interval, succeeds on attempt 3) → `Guest system setup finalized` → `VM stopped`. Final state `stopped`, `provisioningOperation: null`. On failure, check `~/.lume/vm-local-macos-testing-1/sessions.json` and `~/Library/Logs/lume/*.log`. The `CancellationError` on `VM.run` stop is benign.

**Step 2 — Confirm SSH (`lume/lume`)**
```bash
lume run vm-local-macos-testing-1 --display none --detach
# wait 3-5s, then:
lume ls --format json  # expect status running, sshAvailable true, ipAddress 192.168.64.20, vncUrl 127.0.0.1:5265X
lume ssh vm-local-macos-testing-1 "whoami; id; sw_vers; dscl . list /Users | head -20"
# expect: lume, uid=501, ProductVersion 26.6 BuildVersion 25G72
```
- `lume ssh` defaults to `user lume / password lume` for `--unattended` VMs (see `lume ssh --help`: `-u lume -p lume`, `--timeout 60`). `lume run --detach` returns PID and log path (`~/Library/Logs/lume/<vm>.log`). If `sshAvailable: false` or `ipAddress: null`, wait 10-30s and retry; headless `lume setup` enables `Remote Login` automatically. Troubleshoot with `lume get <name> --format json` and `lume logs`.

**Step 3 — Create user `th-allbrew / th-allbrew` (admin)**
```bash
lume ssh vm-local-macos-testing-1 "echo lume | sudo -S sysadminctl -addUser th-allbrew -fullName \"th-allbrew\" -password th-allbrew -admin"
# expect log: "No clear text password or interactive option was specified..." (warning only)
#            "Creating user record…" "Assigning UID: 502 GID: 20"
#            "### Error:-14120" is benign — user is still created.
lume ssh vm-local-macos-testing-1 "dscl . list /Users | grep -E 'lume|th-allbrew'; id th-allbrew"
lume ssh vm-local-macos-testing-1 --user th-allbrew --password th-allbrew "whoami; id; pwd"
# expect: th-allbrew, uid=502, /Users/th-allbrew, groups include admin(80), _developer(204)
```
- Background `sysadminctl` can appear hung (30s) — allow `yield_time_ms 30000+`. Verify via `id th-allbrew` even if `sysadminctl` reports `-14120` (Filevault/SecureToken error on VM — safe to ignore for admin SSH user). Mirrors `macos-testing-harness` `hooks.setupRuntime` user creation path. Ensure `th-allbrew` is `admin` so subsequent `brew`/`sudo` works without password prompts beyond `lume`.

**Step 4 — Shut down VM**
```bash
lume stop vm-local-macos-testing-1
# expect: Sent SIGINT to VM process <pid>, Process <pid> has terminated, lock cleared (forcibly clearing + backup/restore config), VM stopped
lume ls --format json  # status stopped, sshAvailable null, ipAddress null
```
- `lume stop` force-clears the config lock via `SIGINT` + backup/restore — the `Forcibly clearing locks` + `Removed original config file to clear locks` log is normal after `--detach`. Prefer `lume stop` over `lume shutdown` (which requires SSH `lume/lume` and `sudo shutdown`). Must be `stopped` before `lume set`/`lume clone`.

**Step 5 — Reconfigure to 2 CPU / 4GB**
```bash
lume set vm-local-macos-testing-1 --cpu 2 --memory 4GB
# expect: Updating VM settings cpu=2 memory=4096MB, VM settings updated successfully
lume get vm-local-macos-testing-1 --format json  # cpuCount 2, memorySize 4294967296
```
- `lume set` only works on stopped VMs. Supports `--cpu`, `--memory` (e.g. `4GB`/`4096MB`), `--disk-size` (increase only, relocates Recovery partition, may take minutes), `--display` (e.g. `1024x768`). Use `--dry-run` to preview disk resize. Lightweight — <2s.

**Step 6 — Clone as `vm-local-macos-testing-2`**
```bash
lume clone vm-local-macos-testing-1 vm-local-macos-testing-2
# expect: Cloning VM source=vm-local-macos-testing-1 destination=vm-local-macos-testing-2, VM cloned successfully
lume ls --format json  # two entries, both stopped, same cpu 2 / memory 4GB / disk 50GB, allocated ~24GB
```
- Clone inherits disk, users (`lume`, `th-allbrew`), and settings. Time <5s for 24GB allocated on APFS. Verify both `status: stopped` before parallel run. Clone preserves UID 502 for `th-allbrew` — no re-creation needed.

**Step 7 — Run both VMs, staggering startup by 60 seconds**
```bash
lume run vm-local-macos-testing-1 --display none --detach  # PID 64xxx, log ~/Library/Logs/lume/vm-local-macos-testing-1.log
sleep 5; lume ls --format json  # vm1 running 192.168.64.20 vnc 52655 sshAvailable true/false transient
# --- wait 60s ---
sleep 60
lume run vm-local-macos-testing-2 --display none --detach  # PID 64xxx, 192.168.64.21 vnc 52656
sleep 5; lume ls --format json
# both: status running, sshAvailable true, ipAddress 192.168.64.20 / .21, vncUrl distinct
# verify SSH on both users:
lume ssh vm-local-macos-testing-1 "whoami; id th-allbrew"           # lume
lume ssh vm-local-macos-testing-1 --user th-allbrew --password th-allbrew "whoami"  # th-allbrew
lume ssh vm-local-macos-testing-2 "whoami; id th-allbrew"
lume ssh vm-local-macos-testing-2 --user th-allbrew --password th-allbrew "whoami"
```
- Stagger avoids simultaneous disk I/O / VNC port contention on first boot; 60s verified to give vm1 `sshAvailable: true` before vm2 `192.168.64.21` appears. `lume run --display none --detach` is required for headless parallel runs; omit `--display none` only if VNC viewer desired (`--display native` default). `sshAvailable` may transiently be `null` then `true` within 10s — poll via `lume ls --format json | grep sshAvailable` + `lume ssh ... whoami` probe in a loop (3-6 retries, 5s sleep). Final `lume ls` text format shows `name os cpu memory disk display status network storage shared_dirs ip ssh vnc`.

### Verification Checklist
- `lume ls` shows both `running`, distinct `192.168.64.20`/`21`, `vncUrl` ports differ, `cpu 2 / 4.00G`.
- `lume ssh <vm> "whoami"` → `lume` and `lume ssh <vm> --user th-allbrew --password th-allbrew "whoami"` → `th-allbrew` on both.
- `id th-allbrew` shows `uid=502` `gid=20` `groups=...80(admin)...`.
- `sw_vers` → `ProductVersion 26.6 BuildVersion 25G72` (matches IPSW `UniversalMac_26.6_25G72_Restore.ipsw`).
- Logs clean: `~/Library/Logs/lume/vm-local-macos-testing-*.log` no `provisioningOperation` stuck.

### Common Pitfalls & Recovery
- **`/Volumes/EXTBAK2` missing** (`No such file or directory`): external drive not mounted — `ls -la /Volumes` only shows `Macintosh HD` + `Recovery`, `diskutil list` shows no `disk4s1`/`disk5s1`. Re-plug drive, check `diskutil list external` + `mount | grep EXT`, wait for `exfat` mount. Do not fallback to `--ipsw latest` without user approval (18G download).
- **`Installing macOS progress` stalls at 78-79% for ~90s**: normal (see 23:46:55→23:48:21 gap) — do not kill; total install ~4 min.
- **`sysadminctl Error:-14120` or `IOServiceMatching failed`**: benign on ARM VM without Filevault; verify with `dscl . list /Users | grep th-allbrew` + `id`.
- **Lock contention `Found process <pid> holding lock on config file`**: `lume stop` clears via SIGINT + backup/restore — wait for `VM stopped successfully`; if `lume ls` still shows `running`, `kill <pid>` then `lume stop`.
- **`VM has no IP address. Wait for it to boot completely.`** on immediate `lume ssh` after `lume run --detach`: poll 5s interval; IP appears within 10-15s, `sshAvailable: true` within 15-30s.
- **`sshAvailable: null` after clone/run**: clone inherits stopped state; ensure `lume set` done before clone, and stagger `lume run` by 60s if host CPU/memory constrained (2 VMs × 2CPU/4GB = 4CPU/8GB host load).
- **Harness confusion**: `macos-testing-harness` `run --profile user-journeys` expects `LUME_VM_NAME` + `TH_PROJECT_USER`; raw twin VMs are endpoint `local` for `automate-vm-batch.sh --local-only`. Document mode in `state/progress.json` or run record.

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
   - Updates `state/index.jsonl`, `state/fix-index.jsonl`, and `state/progress.json`.

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
- `-m, --monitor`: Follow `state/progress.json` in real time.
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

- **Batch Index**: `tests/monitored-install-batch/state/index.jsonl`
- **Fix Index**: `tests/monitored-install-batch/state/fix-index.jsonl`
- **Real-Time Progress**: `tests/monitored-install-batch/state/progress.json`
- **Canonical Run Records**: `tests/monitored-install-runs/<timestamp>__<slug>/`
- **Host Lock Directories**: `tests/monitored-install-batch/logs/vm-mutex-*.lockdir`
