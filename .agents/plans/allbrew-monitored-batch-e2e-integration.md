# Monitored-install batch → E2E / E2E-tap integration plan

## Status

Draft assessment. No implementation yet.

## Goal

Capture the reusable patterns, tools, and helpers from `tests/monitored-install-batch/` that can streamline and enhance `tests/e2e/` and `tests/e2e-tap/`, and propose a prioritized integration sequence.

## Background

- `tests/e2e/catalog.e2e.test.ts` runs a curated catalog of real apps through `allbrew generate → brew install → verify → uninstall` inside a Lume VM.
- `tests/e2e-tap/` runs a synthetic fixture server + disposable git tap to exercise the full `generate → commit → push → brew tap → brew install → livecheck → update` cycle.
- `tests/monitored-install-batch/` is a parent/child agent marathon over hundreds of real URLs, producing per-URL run records, fix packages, and worktrees.

All three ultimately depend on the same Lume macOS VM + exclusive `/opt/homebrew` sparsebundle, but they orchestrate and record their work differently.

## 1. Comparison

### 1.1 Scope and source of truth

| Tier | Primary purpose | Source of apps | Definition of pass |
|------|-----------------|----------------|--------------------|
| E2E catalog | Regression test a curated set of real apps | `tests/e2e/catalog.json` | Generate, install, verify, and uninstall a known app cleanly |
| E2E-tap | Test the full tap/update lifecycle | `tests/e2e-tap/fixtures/apps.ts` | Generator + tap mechanics are correct for 15 fixture families |
| Monitored-install batch | Marathon arbitrary real-world URLs | `tests/monitored-install-batch/state/agent-queue.json` | Real URL either installs cleanly or produces a diagnosable fix package |

### 1.2 VM setup and isolation

| Aspect | E2E / E2E-tap | Monitored-install batch |
|--------|---------------|------------------------|
| Harness | `macos-testing-harness` via `bun run vm:test:*`; `test-suite.ts` declares `homebrewProfiles` so the harness creates one `th-allbrew` user + exclusive `/opt/homebrew` sparsebundle per profile run | Reuses the same Lume images but adds `tests/monitored-install-batch/vm-pool.json` with three endpoints (`homeserver`, `local-1`, `local-2`) and per-endpoint mutex dirs |
| Prefix hygiene | Sparsebundle acquired once for the whole profile and detached in `finally` | `acquireHomebrewPrefixDurable` force-unlocks the guest prefix before and after each URL; each `vm-install-one` call gets its own session |
| Endpoint concurrency | One test process per VM; parallel runs require separate VM clones | `lib/vm-pool.mjs` supports 3 concurrent endpoints; `acquirePoolSlot` picks the least-busy free endpoint and falls back to waiting |
| Tap model | E2E-tap: disposable git tap (`test/e2e-tap-<pid>-<seq>`); E2E catalog: temp tap in `tmpdir` or real configured tap | Uses the real configured user tap (`~/homebrew-allbrew`); child agents commit and push formulas |

### 1.3 Orchestration

| Aspect | E2E / E2E-tap | Monitored-install batch |
|--------|---------------|------------------------|
| Driver | Bun test runner (`bun test`) with `describe` / `it` / `beforeAll` / `afterAll` | Parent/child agent loop driven by `run-agent-batch.mjs --status/--print-wave/--mark-launched/--mark-done` |
| Concurrency | Serial within one process; parallel only via separate VMs | 3+ child agents per wave; `vm-install-one` serializes on the per-VM mutex |
| Progress tracking | `E2EProgress` class writes `tests/e2e-runs/e2e-results-latest.json` with per-entry phases | `agent-queue.json` status + `state/agent-index.jsonl` + `state/progress.json` |
| Queue / resume | None; tests run from scratch | Queue with `queued/running/launching/blocked/failed/success` states; resumable mid-wave |

### 1.4 Test lifecycle and artifacts

| Aspect | E2E / E2E-tap | Monitored-install batch |
|--------|---------------|------------------------|
| Pre-run state | `snapshotLocalState()` backs up `~/.config/allbrew/` and restores it in `afterAll` | No local config snapshot; runs inside the VM, so host state is protected by design |
| Cleanup / orphans | `test-cleanup-registry.ts` tracks fixture PIDs and Homebrew services across crashes | Per-`vm-install-one` always runs `uninstall` before exit; no cross-crash registry yet |
| Uninstall residuals | `assertUninstallResiduals()` checks `brew list`, binary/app path, and manifest persistence | `vm-install-one` checks `brew list`, manifest, and `command -v`/`.app`, but does not call the shared residual helper |
| Failure artifacts | Test assertion output | Per-URL run record: `outcome.json`, `agent-judgment.json`, `summary.md`, `allbrew-initial.log`, `formula.rb`, `fix-package/` |
| Fix workflow | None; test is expected to pass or is fixed separately | Option A: disposable `git worktree`, patch, `fix-package/`, later reconciled with `bun run batch:reconcile-fixes` |

## 2. Patterns worth integrating

### 2.1 Multi-endpoint VM pool for parallel E2E-tap suites

`tests/monitored-install-batch/lib/vm-pool.mjs` already knows how to acquire and release slots across three Lume endpoints. E2E-tap currently runs one suite at a time inside one VM. Partitioning the e2e-tap suites (`direct-url`, `direct-cask`, `github-source`, `registry`, `service`, etc.) across the three endpoints would reduce wall time by roughly 3×.

Concrete step: extend `tests/e2e-tap/helpers/setup.ts` so that `setupTestContext` can acquire a pool slot instead of always running on the default VM.

### 2.2 Force-unlock Homebrew prefix before E2E profiles

If a previous run crashed and left `/opt/homebrew` mounted, the next profile run can fail. `acquireHomebrewPrefixDurable` in `tests/monitored-install-batch/lib/guest-ops.mjs` already detaches stale mounts and removes the guest lock. The `macos-testing-harness` setup step should call an equivalent pre-acquire force-unlock.

### 2.3 Rich per-test run records

E2E writes `e2e-results.json` (status + error) and a suite readout. Monitored-batch writes full per-URL records. E2E should adopt the same schema for each catalog entry:

- `agent-judgment.json` / `input.json`
- `outcome.json` with `failureClass`, `deltas`, `agentCodebaseAgreement`
- `fix-package/` for failures

This would make the E2E catalog itself a source of product bugs, not just pass/fail results.

### 2.4 Fix-package / worktree reconciliation

When an E2E catalog entry fails, the runner could:

1. Create a disposable worktree.
2. Run `bun run bin/allbrew.ts` with a temp tap to reproduce.
3. Export a `fix-package/` with `FIX.md`, patches, and `validation.json`.

Then `bun run batch:reconcile-fixes` can validate and promote E2E fixes too.

### 2.5 Agent-style service verification

`tests/e2e-tap/service.e2e-tap.test.ts` already performs the most thorough service check. The monitored-batch `vm-install-one` only checks whether a `service do` block exists. E2E could export the `registerService` / `unregisterService` registry pattern from `tests/helpers/test-cleanup-registry.ts` into the batch so that long-running service apps in the marathon are also `brew services start`/`stop` verified.

### 2.6 `assertUninstallResiduals` in `vm-install-one`

`vm-install-one.mjs` should call `assertUninstallResiduals` after uninstall, matching the E2E/e2e-tap Tier A residual policy. This unifies the residual definition across all test tiers.

### 2.7 Queue + wave model for the E2E catalog

The E2E catalog is currently a hardcoded `for` loop. Converting it to an `agent-queue.json`-style queue would allow:

- Running in waves of 3.
- Resuming after crashes.
- Retrying individual entries.
- Marking entries as `success-not-fixed` / `failed-fix-applied` / `blocked`.

### 2.8 Fixture-server fallback for monitored-batch

E2E-tap uses a synthetic fixture server for 15 generator families. Monitored-batch hits real URLs, which is why it needs fix packages. A hybrid "fixture queue" mode for monitored-batch would let child agents validate a fix against a synthetic URL first, then retry the real URL, reducing network flakiness and cost.

### 2.9 Shared `runCommand` / `runBrew` / `runAllbrew` wrapper

`tests/e2e-tap/helpers/run.ts` sets `HOMEBREW_DEVELOPER`, `HOMEBREW_NO_AUTO_UPDATE`, and `HOMEBREW_NO_REQUIRE_TAP_TRUST`. These are not used by `vm-install-one`, which can lead to permission/auto-update drift. Unifying on one runner (or at least the same env set) would reduce `env_fail` in the batch.

## 3. Prioritized integration sequence

| Priority | Item | Where to start |
|----------|------|----------------|
| P0 | Call `assertUninstallResiduals` from `vm-install-one.mjs` after uninstall | `tests/monitored-install-batch/vm-install-one.mjs` |
| P0 | Reconcile `brew` env vars between e2e-tap `run.ts` and batch `guest-ops.mjs` | `tests/e2e-tap/helpers/run.ts`, `tests/monitored-install-batch/lib/guest-ops.mjs` |
| P1 | Add `vm-pool` slot acquisition to `setupTestContext` so e2e-tap suites can run in parallel across `local-1`/`local-2`/`homeserver` | `tests/e2e-tap/helpers/setup.ts`, `tests/monitored-install-batch/lib/vm-pool.mjs` |
| P1 | Write per-entry E2E run records (`outcome.json`, `agent-judgment.json`) for catalog failures | `tests/e2e/catalog.e2e.test.ts` |
| P2 | Add a fixture-queue mode to monitored-batch so fixes can be validated against the e2e-tap fixture server before real re-runs | `tests/e2e-tap/fixtures/server.ts`, `tests/monitored-install-batch/worker-run-one.mjs` |
| P2 | Port `test-cleanup-registry.ts` orphan handling into the batch to protect against child-agent crashes | `tests/monitored-install-batch/lib/batch-helpers.mjs`, `tests/helpers/test-cleanup-registry.ts` |
| P3 | Convert the E2E catalog into a queue + wave runner using `run-agent-batch.mjs` semantics | `tests/e2e/catalog.e2e.test.ts` |

## 4. First concrete step

Start with the two P0 items:

1. Add `assertUninstallResiduals` to the monitored-batch uninstall path.
2. Extract a shared `brewEnv` object (`HOMEBREW_DEVELOPER`, `HOMEBREW_NO_AUTO_UPDATE`, `HOMEBREW_NO_REQUIRE_TAP_TRUST`) and apply it in both `tests/e2e-tap/helpers/run.ts` and `tests/monitored-install-batch/lib/guest-ops.mjs`.

These unify behavior and artifact quality without changing architecture.
