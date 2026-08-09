# allbrew batch patterns re-integration — Plan

> **Goal:** Replace allbrew's project-specific batch testing library (`tests/monitored-install-batch/lib/*.mjs`) and worker scripts with the up-leveled, generic equivalents from `macos-testing-harness`. This eliminates ~1,200 lines of duplicated code while gaining multi-slot VM pool support (3 VMs × 3 users = 9 concurrent jobs), durable Homebrew prefix lifecycle in the harness itself, and a tested batch worker protocol.
>
> **Status:** Planning. The harness modules are implemented and tested (116 tests, `make check` passing). This plan covers the allbrew-side migration.
>
> **Related plans:**
> - [`allbrew-migration.md`](../../../macos-testing-harness/.agents/plans/allbrew-migration.md) — original harness migration (VM scripts → `vm:*` scripts, completed)
> - [`uplevel-allbrew-batch-patterns.md`](../../../macos-testing-harness/.agents/plans/uplevel-allbrew-batch-patterns.md) — harness-side up-level plan (implemented)
> - [`allbrew-monitored-batch-e2e-integration.md`](./allbrew-monitored-batch-e2e-integration.md) — batch E2E integration

## Context

allbrew's batch testing system lives under `tests/monitored-install-batch/` and consists of:

1. **`lib/batch-helpers.mjs`** (384 lines) — `buildWorkerDefs`, `workerProcessEnv`, `slugify`, `writeFixPackage`, `classifyFailure`, `initRunRecordHost`, `finalizeRunRecordHost`, `appendBatchIndex`, `writeProgress`, `parseVerifyOutput`, `localReproGenerate`, `buildAgentJudgment`, `extractPackageName/Generator/ServiceDecision`, `compareService`, `buildDeltas`, `sha256Hex`, `linkBatchPointer`, `appendFixIndex`, `parseUrlShape`, `heuristicGenerator`, `extractExitCode`.

2. **`lib/vm-pool.mjs`** (262 lines) — `loadPoolConfig`, `listEnabledEndpoints`, `pickEndpoint`, `isEndpointLocked`, `acquireEndpointMutex`, `releaseEndpointMutex`, `applyEndpointEnv`, `acquirePoolSlot`. Single-slot only (one job per VM).

3. **`lib/guest-ops.mjs`** (323 lines) — `loadHarness` (dynamic import of harness internals), `forceUnlockHomebrewPrefix`, `acquireHomebrewPrefixDurable`, `releaseHomebrewPrefixDurable`, `guest`, `brewEnvPreamble`, `ensureAllbrew`, `ensureTapConfigured`, `installCmd`, `strictVerifyCmd`, `uninstallCmd`, `fetchFormulaCmd`.

4. **`lib/patch-coordinator.mjs`** — host-side fix-package patch application in disposable worktrees.

5. **`run-agent-batch.mjs`** (323 lines) — agent-driven wave dispatcher (`--print-wave`, `--mark-launched`, `--mark-done`, `--status`, `--rebuild-queue`). Duplicates `BatchQueue` logic.

6. **`worker-loop.mjs`** (462 lines) — long-lived worker that acquires Homebrew prefix once, processes JSONL from stdin, releases on exit. Duplicates `runBatchWorker` logic.

7. **`worker-run-one.mjs`** — single-URL worker (acquire/install/verify/uninstall/release per URL). Duplicates durable prefix logic.

8. **`run-orchestrator.mjs`** — deterministic multi-worker orchestrator. Spawns `worker-loop.mjs` processes with `buildWorkerDefs`/`workerProcessEnv` env.

9. **`run-batch-smoke.mjs`** / **`run-retry-rate-limit.mjs`** — older single-URL batch runners that dynamically import harness internals via `pathToFileURL`.

10. **`bootstrap-workers.mjs`** / **`bootstrap-one-worker.mjs`** — per-worker VM setup (create user, install bun, etc.).

11. **`vm-pool.json`** — 3 endpoints (homeserver + 2 local twins), all single-slot with `TH_PROJECT_USER=th-allbrew`.

12. **`reconcile-fix-packages.mjs`** — host-side fix-package post-processor.

### What the harness now provides (replacing the above)

| Harness module | Replaces in allbrew | Key difference |
|----------------|---------------------|----------------|
| `macos-testing-harness/vm-pool` | `lib/vm-pool.mjs` | Multi-slot support (N users per VM); `applyEndpointEnv` accepts `EndpointLease`; `acquirePoolSlot` picks any free (endpoint, user) pair |
| `macos-testing-harness/batch-record` | `initRunRecordHost`, `finalizeRunRecordHost`, `appendBatchIndex`, `writeProgress` in `lib/batch-helpers.mjs` | Harness version is generic (project-supplied failure classifier); allbrew's version shells out to skill scripts via `spawnSync` |
| `macos-testing-harness/fix-package` | `writeFixPackage` in `lib/batch-helpers.mjs` | Identical API; harness version is the canonical implementation |
| `macos-testing-harness/batch-queue` | `run-agent-batch.mjs` queue logic | `BatchQueue` class with `saveQueue`, `loadQueue`, `printWave`, `markLaunched`, `markDone`, `status`, `buildQueue` |
| `macos-testing-harness/batch-worker` | `worker-loop.mjs` protocol | `runBatchWorker` with injectable acquire/release/process; session health detection |
| `macos-testing-harness/homebrew-prefix` (durable) | `lib/guest-ops.mjs` durable wrappers | `forceUnlockHomebrewPrefix`, `acquireHomebrewPrefixDurable`, `releaseHomebrewPrefixDurable` now in the harness itself |

### What stays in allbrew (project-specific, not up-leveled)

These functions are inherently project-specific and remain in allbrew:

- **`buildAgentJudgment`**, `parseUrlShape`, `heuristicGenerator` — allbrew URL classification heuristics
- **`classifyFailure`** — allbrew-specific log regex patterns (`env_fail`, `github_rate_limit`, `prompt_hang`, etc.)
- **`extractPackageName`**, `extractGenerator`, `extractServiceDecision`, `compareService`, `buildDeltas` — allbrew log parsing
- **`parseVerifyOutput`** — allbrew verify command output parsing
- **`localReproGenerate`** — runs `bin/allbrew.ts` locally
- **`installCmd`**, `strictVerifyCmd`, `uninstallCmd`, `fetchFormulaCmd` — allbrew-specific shell command builders
- **`ensureAllbrew`**, `ensureTapConfigured` — allbrew-specific VM setup
- **`brewEnvPreamble`** — allbrew-specific env preamble
- **`buildWorkerDefs`**, `workerProcessEnv` — allbrew-specific worker definitions (but can be replaced by vm-pool slots)
- **`patch-coordinator.mjs`** — host-side fix-package patch application
- **`reconcile-fix-packages.mjs`** — fix-package post-processing
- **`bootstrap-workers.mjs`** / **`bootstrap-one-worker.mjs`** — per-worker VM setup
- **The monitored-install and monitored-install-batch skills** — agent judgment/fix loop playbooks

## Implementation Steps

### Phase 1: Pin the harness at the new commit

1. Update `package.json` devDependency:
   ```json
   "macos-testing-harness": "git+https://github.com/tariqwest/macos-testing-harness.git#<new-commit-sha>"
   ```

2. Run `bun install` to update `bun.lock`.

3. Verify `bun run check` still passes (the new harness exports are additive, no breaking changes).

### Phase 2: Migrate `lib/vm-pool.mjs` → harness `vm-pool`

**Current state:** `lib/vm-pool.mjs` is a 262-line copy of the harness's old single-slot vm-pool. It uses `BATCH_DIR`-relative paths and has no multi-slot support.

**Target state:** Delete `lib/vm-pool.mjs`. Import from the harness instead.

**Steps:**

1. In files that import `lib/vm-pool.mjs`, replace:
   ```js
   import { acquirePoolSlot, releaseEndpointMutex, applyEndpointEnv, ... } from "./lib/vm-pool.mjs";
   ```
   with:
   ```ts
   import { acquirePoolSlot, releaseEndpointMutex, applyEndpointEnv, ... } from "macos-testing-harness";
   ```

2. Update `vm-pool.json` to use `TH_VM_POOL_DIR` env var pointing to `tests/monitored-install-batch/` (or set `TH_VM_POOL_CONFIG` to the absolute path). The harness's `poolDir()` defaults to `process.cwd() + "/.vm-pool"`, so either:
   - Set `TH_VM_POOL_DIR=tests/monitored-install-batch` in batch scripts, OR
   - Move `vm-pool.json` to `.vm-pool/vm-pool.json` in the repo root, OR
   - Set `TH_VM_POOL_CONFIG` to the absolute path in each batch script.

3. **Add multi-slot support to `vm-pool.json`** (optional but recommended for higher concurrency):
   - Convert each endpoint to multi-slot with 3 users (`th-allbrew-w1`, `th-allbrew-w2`, `th-allbrew-w3`).
   - Each slot sets `TH_PROJECT_USER`, `TH_HOMEBREW_MOUNT_POINT`, `TH_HOMEBREW_LOCK_PATH` for per-user Homebrew isolation.
   - This enables 3 VMs × 3 users = 9 concurrent jobs (up from 3).

4. Update `applyEndpointEnv` calls: the harness version now accepts `EndpointLease` (which includes slot info). Old code passed `VMEndpoint`; the harness still accepts that for backward compat, but new code should pass the lease:
   ```ts
   // Old:
   applyEndpointEnv(endpoint);
   // New:
   const lease = await acquirePoolSlot("item-slug");
   applyEndpointEnv(lease); // applies endpoint env + slot env
   ```

5. Delete `lib/vm-pool.mjs`.

**Files affected:**
- `tests/monitored-install-batch/lib/vm-pool.mjs` — **delete**
- `tests/monitored-install-batch/run-orchestrator.mjs` — update imports
- `tests/monitored-install-batch/worker-loop.mjs` — update imports (if it uses vm-pool directly)
- `tests/monitored-install-batch/vm-pool.json` — update to multi-slot (optional)
- Any other file importing `./lib/vm-pool.mjs`

### Phase 3: Migrate `lib/guest-ops.mjs` durable wrappers → harness `homebrew-prefix`

**Current state:** `lib/guest-ops.mjs` contains `forceUnlockHomebrewPrefix`, `acquireHomebrewPrefixDurable`, `releaseHomebrewPrefixDurable` that duplicate the harness's new durable wrappers. The allbrew versions take an `h` (harness) object parameter; the harness versions are self-contained.

**Target state:** Delete the durable wrappers from `guest-ops.mjs`. Import from the harness instead.

**Steps:**

1. In `guest-ops.mjs`, remove `forceUnlockHomebrewPrefix`, `acquireHomebrewPrefixDurable`, `releaseHomebrewPrefixDurable`. These are now in `macos-testing-harness/homebrew-prefix`.

2. In files that import these from `guest-ops.mjs`:
   ```js
   // Old:
   import { acquireHomebrewPrefixDurable, releaseHomebrewPrefixDurable } from "./lib/guest-ops.mjs";
   // New:
   import { acquireHomebrewPrefixDurable, releaseHomebrewPrefixDurable } from "macos-testing-harness";
   ```

3. **API difference:** The allbrew versions take `h` (harness object with `config`, `acquireHomebrewPrefix`, `releaseHomebrewPrefix`, `lumeSshExec`, `q`). The harness versions are self-contained (they read config from the loaded `config.ts` module and use the harness's own shell helpers). This means:
   - The harness versions don't need the `h` parameter.
   - The harness versions use the harness's own `lumeSshExec` / `lumeExec` internally.
   - **The caller no longer needs to `loadHarness()` and pass `h` to the durable wrappers.**

4. Update `loadHarness()` in `guest-ops.mjs` — it can still dynamically import harness internals for `runAsProjectUser`, `lumeSshExec`, `q`, `config`, but the durable prefix functions are no longer part of the returned object.

5. **`run-batch-smoke.mjs` and `run-retry-rate-limit.mjs`** — these dynamically import `lib/homebrew-prefix.ts` via `pathToFileURL`. Update them to import from the package instead:
   ```js
   // Old:
   const { acquireHomebrewPrefix, releaseHomebrewPrefix } = await importTs("lib/homebrew-prefix.ts");
   // New:
   const { acquireHomebrewPrefix, releaseHomebrewPrefix, acquireHomebrewPrefixDurable, releaseHomebrewPrefixDurable } = await import("macos-testing-harness");
   ```

**Files affected:**
- `tests/monitored-install-batch/lib/guest-ops.mjs` — remove durable wrappers, keep project-specific functions
- `tests/monitored-install-batch/worker-loop.mjs` — update imports
- `tests/monitored-install-batch/worker-run-one.mjs` — update imports
- `tests/monitored-install-batch/run-orchestrator.mjs` — update imports
- `tests/monitored-install-batch/run-batch-smoke.mjs` — update imports
- `tests/monitored-install-batch/run-retry-rate-limit.mjs` — update imports

### Phase 4: Migrate `writeFixPackage` → harness `fix-package`

**Current state:** `writeFixPackage` in `lib/batch-helpers.mjs` (lines 242–312) is the original implementation. The harness's `src/lib/fix-package.ts` is a direct abstraction of it.

**Target state:** Delete `writeFixPackage` from `batch-helpers.mjs`. Import from the harness.

**Steps:**

1. In `batch-helpers.mjs`, remove the `writeFixPackage` function (lines 242–312) and `sha256Hex` (use the harness's internal version).

2. In files that import `writeFixPackage`:
   ```js
   // Old:
   import { writeFixPackage } from "./lib/batch-helpers.mjs";
   // New:
   import { writeFixPackage } from "macos-testing-harness";
   ```

3. **API compatibility:** The harness version accepts the same options (`slug`, `url`, `failureClass`, `logText`, `verify`, `patches`, `files`, `mode`, etc.). The allbrew version has additional fields (`localRepro`, `sourceRunId`, `baselineCommit`, `manifestExtras`, `validationHints`) — verify these are supported by the harness version or add them if needed.

   **Check:** The harness `WriteFixPackageOptions` type includes `localRepro`, `sourceRunId`, `baselineCommit`, `manifestExtras`, `validationHints` — if not, extend the harness type. (From the harness implementation, `writeFixPackage` accepts an options object; verify it passes through `manifestExtras` and writes `validationHints`.)

4. `patch-coordinator.mjs` imports `writeFixPackage` and `sha256Hex` from `batch-helpers.mjs`. Update it to import `writeFixPackage` from the harness. `sha256Hex` is trivial — keep a local copy or import from `node:crypto` directly.

**Files affected:**
- `tests/monitored-install-batch/lib/batch-helpers.mjs` — remove `writeFixPackage`, `sha256Hex`
- `tests/monitored-install-batch/lib/patch-coordinator.mjs` — update imports
- `tests/monitored-install-batch/worker-loop.mjs` — update imports
- `tests/monitored-install-batch/worker-run-one.mjs` — update imports

### Phase 5: Migrate batch record helpers → harness `batch-record`

**Current state:** `batch-helpers.mjs` has `initRunRecordHost`, `finalizeRunRecordHost`, `appendBatchIndex`, `writeProgress`. The first two shell out to skill scripts via `spawnSync`; the latter two are simple file appends.

**Target state:** Use the harness's `initBatchRunRecord`, `finalizeBatchRunRecord`, `appendBatchIndex`, `writeProgress`.

**Steps:**

1. **API difference:** allbrew's `initRunRecordHost` shells out to `.agents/skills/monitored-install/scripts/init-run-record.mjs` via `spawnSync`. The harness's `initBatchRunRecord` is a direct function that creates the run directory + `metadata.json`. The harness version accepts `{ item, runsRoot, workerId, batchMeta }` and returns `{ runDir, runId }`.

2. **Migration approach:** Replace the `spawnSync`-based `initRunRecordHost` with a direct call to the harness's `initBatchRunRecord`. The run record format should be compatible (both write `metadata.json` with item + batch metadata).

3. Similarly, replace `finalizeRunRecordHost` (shells out to `finalize-run-record.mjs`) with `finalizeBatchRunRecord`. The harness version accepts `{ runDir, status, failureClass, packageName, ... }` and writes `outcome.json` + `summary.md`.

4. `appendBatchIndex` and `writeProgress` are nearly identical — just switch to the harness versions. The path constants (`BATCH_INDEX`, `BATCH_DIR`) need to be passed as parameters since the harness versions don't hardcode allbrew paths.

5. **Keep `linkBatchPointer` in allbrew** — it creates a symlink from `BATCH_RUNS/<batchRunId>` to the run directory. This is project-specific and not in the harness.

**Files affected:**
- `tests/monitored-install-batch/lib/batch-helpers.mjs` — remove `initRunRecordHost`, `finalizeRunRecordHost`, `appendBatchIndex`, `writeProgress`
- `tests/monitored-install-batch/worker-loop.mjs` — update imports
- `tests/monitored-install-batch/worker-run-one.mjs` — update imports
- `tests/monitored-install-batch/run-orchestrator.mjs` — update imports (uses `writeProgress`)

### Phase 6: Migrate `run-agent-batch.mjs` queue logic → harness `batch-queue`

**Current state:** `run-agent-batch.mjs` (323 lines) implements queue building, wave dispatch, and status tracking with inline functions (`buildQueue`, `saveQueue`, `loadQueue`, `printWave`, `markLaunched`, `markDone`, `status`). These duplicate the harness's `BatchQueue` class.

**Target state:** Replace the inline functions with `BatchQueue` from the harness.

**Steps:**

1. Replace the inline queue functions with `BatchQueue`:
   ```ts
   import { BatchQueue, buildAgentName, slugify } from "macos-testing-harness";

   const q = new BatchQueue({
     stateDir: join(BATCH_DIR, "state"),
     repoRoot: REPO_ROOT,
     concurrency: envInt("TH_BATCH_CONCURRENCY", 6),
   });
   ```

2. Map the CLI commands:
   - `--rebuild-queue` → `q.buildQueue(items, onlyFailed)` + `q.saveQueue(items)`
   - `--print-wave` → `q.printWave(basePrompt(), perUrlPrompt)`
   - `--mark-launched` → `q.markLaunched(names)`
   - `--mark-done` → `q.markDone(name, status)`
   - `--status` → `q.status()`

3. **Keep `basePrompt()` and `perUrlPrompt()` in allbrew** — these are project-specific (reference the monitored-install skill, allbrew repo paths, allbrew-specific isolation rules).

4. **`slugify` difference:** allbrew's `slugify` truncates to 50 chars; the harness version truncates to 60. Verify this doesn't break existing queue state. If needed, the harness version can be updated to accept a max length parameter, or allbrew can keep its own `slugify` for backward compat with existing queue files.

5. **`buildAgentName` difference:** allbrew's `run-agent-batch.mjs` builds agent names as `url-${String(i).padStart(4, "0")}-${slug}`.slice(0, 48)`. The harness's `buildAgentName` does `url-${String(idx).padStart(4, "0")}-${slug}`. Verify the truncation difference (48 vs no truncation in harness) doesn't break existing state.

**Files affected:**
- `tests/monitored-install-batch/run-agent-batch.mjs` — rewrite to use `BatchQueue`

### Phase 7: Migrate `worker-loop.mjs` protocol → harness `batch-worker`

**Current state:** `worker-loop.mjs` (462 lines) implements the long-lived worker protocol: acquire prefix once, read JSONL from stdin, process each entry, release on exit. The `runOne` function is the per-entry processing logic (allbrew-specific).

**Target state:** Replace the protocol scaffolding with `runBatchWorker` from the harness. Keep `runOne` as the project-supplied `process` function.

**Steps:**

1. Rewrite `worker-loop.mjs` to use `runBatchWorker`:
   ```ts
   import { runBatchWorker } from "macos-testing-harness";
   import { acquireHomebrewPrefixDurable, releaseHomebrewPrefixDurable } from "macos-testing-harness";

   await runBatchWorker({
     acquire: () => acquireHomebrewPrefixDurable({ attempts: 5, delayMs: 2000 }),
     release: (session) => releaseHomebrewPrefixDurable(session),
     process: async (session, entry) => runOne(h, session, entry, allbrewVersion),
     isSessionUnhealthy: (msg) => /Homebrew|lock|mount|prefix/i.test(msg),
   });
   ```

2. **Challenge:** The current `worker-loop.mjs` does more than just process entries — it also:
   - Calls `ensureAllbrew` and `ensureTapConfigured` after acquiring the prefix.
   - Re-calls these after a session reacquire.
   - Passes `allbrewVersion` to `runOne`.

   The harness's `runBatchWorker` has an `acquire` function that returns a session, but doesn't have a "post-acquire setup" hook. Options:
   - **Option A:** Fold `ensureAllbrew`/`ensureTapConfigured` into the `acquire` function (return a richer session object that includes `allbrewVersion`).
   - **Option B:** Add a `postAcquire` hook to `runBatchWorker` in the harness.
   - **Recommended: Option A** — the `acquire` function can return `{ session, allbrewVersion }` as the worker session, and `process` receives this enriched session.

3. **Session reacquire:** The harness's `runBatchWorker` already handles session reacquire when `isSessionUnhealthy` returns true. The current allbrew code re-calls `ensureAllbrew`/`ensureTapConfigured` after reacquire. With Option A, the `acquire` function handles this automatically.

4. **`runOne` stays in allbrew** — it's the project-specific per-entry processing logic (install, verify, uninstall, fix package, run record).

**Files affected:**
- `tests/monitored-install-batch/worker-loop.mjs` — rewrite protocol scaffolding, keep `runOne`

### Phase 8: Migrate `run-orchestrator.mjs` to use harness vm-pool + batch-worker

**Current state:** `run-orchestrator.mjs` spawns `worker-loop.mjs` processes with `buildWorkerDefs`/`workerProcessEnv` env. It uses `lib/vm-pool.mjs` for endpoint selection.

**Target state:** Use the harness's `acquirePoolSlot` for endpoint selection and the harness's `BatchQueue` for work distribution. The orchestrator can either:
- **Keep spawning `worker-loop.mjs` processes** (but `worker-loop.mjs` now uses `runBatchWorker`), OR
- **Use `BatchQueue.printWave` to dispatch work** to child agents (the `run-agent-batch.mjs` path).

**Steps:**

1. Replace `buildWorkerDefs`/`workerProcessEnv` with vm-pool slots. The orchestrator reads `vm-pool.json` (now with multi-slot support) and spawns one `worker-loop.mjs` per slot.

2. For each slot:
   ```ts
   const lease = await acquirePoolSlot(`worker-${i}`);
   applyEndpointEnv(lease);
   const child = spawn("bun", ["tests/monitored-install-batch/worker-loop.mjs"], {
     env: process.env, // already has TH_PROJECT_USER etc. from applyEndpointEnv
     stdio: "inherit",
   });
   // When child exits, releaseEndpointMutex(lease);
   ```

3. **`buildWorkerDefs`/`workerProcessEnv` become unnecessary** if vm-pool slots carry the per-user env vars (`TH_PROJECT_USER`, `TH_HOMEBREW_MOUNT_POINT`, etc.). The slot env replaces `workerProcessEnv`.

4. **Keep `bootstrap-workers.mjs`/`bootstrap-one-worker.mjs`** — these create the macOS users in the VM. They're project-specific setup and not duplicated in the harness. However, they should be updated to read the user list from `vm-pool.json` slots instead of `buildWorkerDefs`.

**Files affected:**
- `tests/monitored-install-batch/run-orchestrator.mjs` — rewrite to use vm-pool slots
- `tests/monitored-install-batch/bootstrap-workers.mjs` — read users from vm-pool slots
- `tests/monitored-install-batch/bootstrap-one-worker.mjs` — may need updates

### Phase 9: Clean up `batch-helpers.mjs`

After Phases 3–6, `batch-helpers.mjs` should be significantly smaller. Remove the migrated functions and keep only the project-specific ones:

**Keep in allbrew:**
- `REPO_ROOT`, `BATCH_DIR`, `SKILL_SCRIPTS`, `RUNS_ROOT`, `BATCH_RUNS`, `BATCH_LOGS`, `BATCH_STATE`, `BATCH_INDEX`, `FIX_INDEX`, `WORKTREES_ROOT`, `AGENT_QUEUE_PATH` — path constants
- `DEFAULT_WORKERS` — may be unnecessary if vm-pool slots define users
- `envInt`, `envBool` — small env helpers (or import from a shared util)
- `slugify` — if the harness version's 60-char truncation is incompatible
- `ensureDirs` — creates batch directories
- `parseUrlShape`, `heuristicGenerator`, `buildAgentJudgment` — allbrew URL classification
- `extractExitCode`, `extractPackageName`, `extractGenerator`, `extractServiceDecision` — log parsing
- `classifyFailure` — allbrew failure classification (project-supplied `FailureClassifier`)
- `compareService`, `buildDeltas` — service comparison
- `linkBatchPointer` — batch run symlink
- `localReproGenerate`, `listRbFiles` — local repro
- `parseVerifyOutput` — verify output parsing
- `appendFixIndex` — fix index append (project-specific index location)

**Remove (migrated to harness):**
- `writeFixPackage` → `macos-testing-harness/fix-package`
- `sha256Hex` → use `node:crypto` directly
- `initRunRecordHost` → `macos-testing-harness/batch-record` (`initBatchRunRecord`)
- `finalizeRunRecordHost` → `macos-testing-harness/batch-record` (`finalizeBatchRunRecord`)
- `appendBatchIndex` → `macos-testing-harness/batch-record` (`appendBatchIndex`)
- `writeProgress` → `macos-testing-harness/batch-record` (`writeProgress`)
- `buildWorkerDefs` → replaced by vm-pool slots (if multi-slot adopted)
- `workerProcessEnv` → replaced by vm-pool slot env

**Files affected:**
- `tests/monitored-install-batch/lib/batch-helpers.mjs` — remove migrated functions

### Phase 10: Update `vm-pool.json` for multi-slot (optional, recommended)

Convert the current 3-endpoint single-slot config to 3-endpoint × 3-slot config for 9 concurrent jobs:

```json
{
  "strategy": "least-busy",
  "endpoints": [
    {
      "id": "homeserver",
      "enabled": true,
      "env": {
        "LUME_REMOTE_ENABLED": "true",
        "LUME_REMOTE_HOST": "app-user@homeserver.local",
        "LUME_VM_NAME": "vm-homeserver-macos-testing"
      },
      "mutexDir": "logs/vm-mutex-homeserver.lockdir",
      "slots": [
        {
          "user": "th-allbrew-w1",
          "mutexDir": "logs/vm-mutex-homeserver-w1.lockdir",
          "env": {
            "TH_PROJECT_USER": "th-allbrew-w1",
            "TH_HOMEBREW_MOUNT_POINT": "/Users/th-allbrew-w1/homebrew",
            "TH_HOMEBREW_LOCK_PATH": "/var/run/lume-hb-homeserver-w1.lock",
            "TH_HOMEBREW_SPARSEBUNDLE_DIR": "/Users/th-allbrew-w1/Library/LumeHomebrew",
            "TH_VM_WORKSPACE": "/Users/th-allbrew-w1/Developer/allbrew"
          }
        },
        {
          "user": "th-allbrew-w2",
          "mutexDir": "logs/vm-mutex-homeserver-w2.lockdir",
          "env": { ... }
        },
        {
          "user": "th-allbrew-w3",
          "mutexDir": "logs/vm-mutex-homeserver-w3.lockdir",
          "env": { ... }
        }
      ]
    },
    { "id": "local-1", "slots": [ ... ], ... },
    { "id": "local-2", "slots": [ ... ], ... }
  ]
}
```

**Homebrew prefix isolation:** Use per-user mount points (`/Users/<user>/homebrew`) for parallel Homebrew access. This matches allbrew's `buildWorkerDefs` pattern for non-default users. The `th-allbrew` user (if used as a single-worker fallback) keeps `/opt/homebrew`.

**Files affected:**
- `tests/monitored-install-batch/vm-pool.json` — convert to multi-slot

### Phase 11: Update documentation

Update the following in allbrew:

1. **`AGENTS.md`** — update the "Monitored Allbrew Install Batching Rule" section to reference the harness modules instead of the local lib files. Document the multi-slot vm-pool pattern.

2. **`.agents/skills/monitored-install-batch/SKILL.md`** — update references from `lib/vm-pool.mjs` to `macos-testing-harness/vm-pool`. Update the layout table.

3. **`.agents/skills/monitored-install/SKILL.md`** — update if it references `batch-helpers.mjs` functions that have been migrated.

4. **`tests/monitored-install-batch/README.md`** — update the architecture description.

5. **`package.json`** — update the harness pin to the new commit.

## Files to Modify

### Delete
- `tests/monitored-install-batch/lib/vm-pool.mjs` — replaced by `macos-testing-harness/vm-pool`

### Modify (remove migrated code)
- `tests/monitored-install-batch/lib/batch-helpers.mjs` — remove `writeFixPackage`, `sha256Hex`, `initRunRecordHost`, `finalizeRunRecordHost`, `appendBatchIndex`, `writeProgress`, `buildWorkerDefs`, `workerProcessEnv`
- `tests/monitored-install-batch/lib/guest-ops.mjs` — remove `forceUnlockHomebrewPrefix`, `acquireHomebrewPrefixDurable`, `releaseHomebrewPrefixDurable`

### Modify (update imports)
- `tests/monitored-install-batch/worker-loop.mjs` — use `runBatchWorker` + harness durable prefix
- `tests/monitored-install-batch/worker-run-one.mjs` — use harness durable prefix + fix-package
- `tests/monitored-install-batch/run-orchestrator.mjs` — use harness vm-pool + batch-worker
- `tests/monitored-install-batch/run-agent-batch.mjs` — use harness `BatchQueue`
- `tests/monitored-install-batch/run-batch-smoke.mjs` — use harness package imports
- `tests/monitored-install-batch/run-retry-rate-limit.mjs` — use harness package imports
- `tests/monitored-install-batch/lib/patch-coordinator.mjs` — use harness `writeFixPackage`
- `tests/monitored-install-batch/bootstrap-workers.mjs` — read users from vm-pool slots
- `tests/monitored-install-batch/vm-pool.json` — convert to multi-slot (optional)

### Modify (documentation)
- `AGENTS.md`
- `.agents/skills/monitored-install-batch/SKILL.md`
- `.agents/skills/monitored-install/SKILL.md`
- `tests/monitored-install-batch/README.md`
- `package.json` (harness pin)

## Verification

### Static verification
- [ ] `bun install` succeeds with the new harness pin
- [ ] `bun run check` passes (TypeScript)
- [ ] `bun run test` passes (unit tests)
- [ ] No imports from `./lib/vm-pool.mjs` remain
- [ ] No imports of `writeFixPackage` from `batch-helpers.mjs` remain
- [ ] No imports of durable prefix wrappers from `guest-ops.mjs` remain

### Functional verification
- [ ] `bun tests/monitored-install-batch/run-agent-batch.mjs --status` works with `BatchQueue`
- [ ] `bun tests/monitored-install-batch/run-agent-batch.mjs --print-wave` produces a valid wave
- [ ] `bun tests/monitored-install-batch/run-agent-batch.mjs --mark-launched <name>` updates queue status
- [ ] `bun tests/monitored-install-batch/run-agent-batch.mjs --mark-done <name> success` updates queue + index
- [ ] `worker-loop.mjs` acquires prefix, processes entries from stdin, releases on `__STOP__`
- [ ] `worker-loop.mjs` reacquires prefix when session is unhealthy
- [ ] Fix packages are written correctly using the harness `writeFixPackage`
- [ ] Run records are created correctly using the harness `initBatchRunRecord`/`finalizeBatchRunRecord`

### Multi-slot verification (if Phase 10 is done)
- [ ] `vm-pool.json` with 3 endpoints × 3 slots loads correctly
- [ ] `acquirePoolSlot` returns different (endpoint, user) pairs for concurrent calls
- [ ] 3 concurrent `worker-loop.mjs` processes on the same VM use different macOS users
- [ ] Per-user Homebrew prefixes work (`/Users/<user>/homebrew` mount points)
- [ ] `releaseEndpointMutex` releases the correct slot mutex

### VM acceptance (if multi-slot)
- [ ] Bootstrap creates 3 users per VM (`th-allbrew-w1`, `th-allbrew-w2`, `th-allbrew-w3`)
- [ ] Each user has its own sparsebundle + Homebrew prefix
- [ ] 9 concurrent jobs (3 VMs × 3 users) complete without lock contention
- [ ] No cross-user contamination (separate homes, configs, taps)

## Risks/Considerations

- **`slugify` truncation difference** (50 vs 60 chars) could break existing queue state files. Either keep allbrew's `slugify` or rebuild the queue after migration.

- **`buildAgentName` truncation difference** (48 chars vs no truncation) could break existing agent-index entries. Rebuild the queue after migration.

- **Run record format compatibility:** The harness's `initBatchRunRecord`/`finalizeBatchRunRecord` may write slightly different `metadata.json`/`outcome.json` schemas than allbrew's skill-script-based versions. Verify that downstream consumers (fix-package coordinator, reconcile script, readout) can handle both formats during the transition.

- **`loadHarness()` pattern:** allbrew's `guest-ops.mjs` dynamically imports harness internals via `pathToFileURL(join(harnessRoot, rel)).href`. This is fragile and should be replaced with proper package imports (`import { ... } from "macos-testing-harness"`). However, some harness internals (`runAsProjectUser`, `lumeSshExec`, `q`) are not in the public SDK surface — they may need to be added to `src/index.ts` or imported via subpath exports.

- **Multi-slot Homebrew prefix:** Per-user mount points (`/Users/<user>/homebrew`) are not the default `/opt/homebrew`. This works for allbrew's `buildWorkerDefs` pattern but may require VM setup changes (each user needs their own sparsebundle created during bootstrap).

- **Backward compat with existing batch state:** Existing `state/agent-queue.json`, `state/agent-index.jsonl`, and `state/index.jsonl` files should remain readable. The `BatchQueue` class uses the same file names and formats.

- **The agent-in-the-loop pattern stays in allbrew:** The 5-phase monitored-install loop (judgment → install → verify → fix → retry) is project-specific and lives in the skill files. The harness provides building blocks (queue, worker, fix-package, run records) but not the judgment logic.

## Changelog

| Date | Change |
|------|--------|
| 2026-08-07 | Initial plan: migrate allbrew batch testing lib to harness up-leveled modules. |
