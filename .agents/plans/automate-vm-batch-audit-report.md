# Audit Report: `automate-vm-batch` Skill vs. Code Implementation

**Date:** 2026-08-03  
**Target Documentation:** `.agents/skills/automate-vm-batch/SKILL.md`  
**Target Codebase Files:**
1. `tests/monitored-install-batch/automate-vm-batch.sh`
2. `tests/monitored-install-batch/lib/vm-pool.mjs`
3. `tests/monitored-install-batch/lib/batch-helpers.mjs`
4. `tests/monitored-install-batch/worker-run-one.mjs`
5. `tests/monitored-install-batch/vm-install-one.mjs`

---

## Executive Summary

The `.agents/skills/automate-vm-batch/SKILL.md` documentation has been thoroughly audited against the implementation files in `tests/monitored-install-batch/`. The documentation is a **faithful and accurate reflection** of the codebase logic, VM topology, concurrency locks, install loop phases, CLI parameters, and artifact paths.

Minor implementation nuances (JS worker default array fallback and single-worker `vm-install-one.mjs` CLI usage) were identified during the audit and updated directly in `SKILL.md`.

---

## Verification Findings

### 1. VM Layout & Isolation Model
- **Dual Endpoint Setup:** Verified `homeserver` (remote VM via `LUME_REMOTE_ENABLED=true`) and `local` twin (local VM via `LUME_REMOTE_ENABLED=false`) in `lib/vm-pool.mjs` and `vm-install-one.mjs`.
- **Guest Account & Mount Point:** Dedicated account `th-allbrew` and mounted sparsebundle prefix `/opt/homebrew` match across `automate-vm-batch.sh`, `vm-install-one.mjs`, and `lib/batch-helpers.mjs`.
- **Mutex Locks:** Host directory locks in `logs/vm-mutex-<id>.lockdir` (`acquireEndpointMutex`) and guest lock recovery (`forceUnlockHomebrewPrefix`) in `lib/guest-ops.mjs` clear stale locks and detaches `/opt/homebrew` to prevent lock thrash and cascading failures.

### 2. 5-Phase Skill Loop Execution
- **Phase 0.5 (Heuristic Judgment):** `buildAgentJudgment` evaluates URL shape and docs prior to LLM calls, outputting `agent-judgment.json`.
- **Phase 1 (allbrew Capture):** Spawns `ALLBREW_NONINTERACTIVE=1 allbrew "<URL>" --name "<slug>" --verbose` via `installCmd`.
- **Phase 2 & 3 (Strict Verification):** `strictVerifyCmd` checks formula/cask listing, `manifest.json`, binary/app execution, and background service stanzas.
- **Phase 4 (Option-A Fix Capture):** On failure, reproduces locally if `TH_BATCH_LOCAL_REPRO=1` and writes `fix-package/` (`FIX.md`, `validation.json`, `tests-added.md`) and updates `fix-index.jsonl`.
- **Phase 5 (Hygiene & Finalization):** Forces package uninstallation (`uninstallCmd`), finalizes run records in `tests/monitored-install-runs/<timestamp>__<slug>/`, and updates `index.jsonl` and `progress.json`.

### 3. CLI Options (`automate-vm-batch.sh`)
Verified all CLI flags and defaults in `automate-vm-batch.sh`:
- `-c, --concurrency <N>` (default: 8)
- `-w, --workers <list>` (default: `th-allbrew`)
- `-f, --fix-mode <mode>` (default: `docs`)
- `-t, --timeout <ms>` (default: `720000`)
- `-p, --provision` (triggers `npm run vm:setup`)
- `-r, --reset-locks` (purges `logs/vm-mutex-*.lockdir`)
- `-m, --monitor` (tails `progress.json`)
- `-d, --dry-run` (previews execution plan)
- `--local-only` (sets `LUME_REMOTE_ENABLED=false`)

### 4. Unit Test Verification
Ran unit test suite:
`bun test tests/unit/automate-vm-batch.test.ts`
All 6 tests passed cleanly.
