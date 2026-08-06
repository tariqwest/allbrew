# Monitored install batch (skill-aligned)

Runs allbrew against URLs from `urls-shuffled.json` inside the Lume e2e VM, with a loop closer to `.agents/skills/monitored-allbrew-install`.

## Agent orchestration skill

For a **parent agent** driving the queue with child agents (resume state, print-wave, mark-launched/done, nudge, finalize), use:

**[`.agents/skills/monitored-install-batch/`](../../.agents/skills/monitored-install-batch/)** (`SKILL.md` + `README.md`)

That path is harness-agnostic. This README covers the on-disk harness, deterministic workers, VM pool, and fix-package reconcile CLI.


## File Layout & State Storage

- **Durable Code & Fixtures**: `run-batch.mjs`, `run-agent-batch.mjs`, `worker-loop.mjs`, `urls-shuffled.json`, etc.
- **Run Outputs**: `runs/` (per-run directories), `logs/` (execution logs).
- **Operational State Directory (`state/`)**: Catalogs, indexes, queues, and real-time process state (`agent-queue.json`, `agent-wave.json`, `index.jsonl`, `agent-index.jsonl`, `fix-index.jsonl`, `progress.json`, `*.pid`).
- **Outcome Summaries Directory (`summary/`)**: Final captures and outcome analysis files (`summary.json`, `final-summary*.json`, `retry-rate-limit-*.json`).

## Entrypoints

| Script | Role |
|--------|------|
| `run-batch.mjs` | **Default** — skill-aligned orchestrator (`run-orchestrator.mjs`) |
| `run-orchestrator.mjs` | 2× worker pool, skill records, option-A fix packages |
| `worker-run-one.mjs` | Per-URL worker (spawned by orchestrator) |
| `bootstrap-workers.mjs` | Create worker users, prefixes, allbrew, taps |
| `run-batch-smoke.mjs` | Legacy shallow install→weak verify→uninstall runner |

## Parallelism (default 2×; fallback 1×)

Preferred multi-user layout (requires non-default Homebrew prefixes — currently limited by upstream installer):

| Worker | User | Mount | Lock |
|--------|------|-------|------|
| w1 | `th-allbrew-w1` | `/Users/th-allbrew-w1/homebrew` | `/var/run/lume-hb-w1.lock` |
| w2 | `th-allbrew-w2` | `/Users/th-allbrew-w2/homebrew` | `/var/run/lume-hb-w2.lock` |

## Per-URL loop

1. `init-run-record.mjs` → `tests/monitored-install-runs/<run-id>/`
2. Heuristic `agent-judgment.json` (URL shape; service unclear except casks)
3. Guest `allbrew <url> --name <slug> --verbose` (no `--service` flags)
4. Service compare + generator deltas
5. **Strict** verify: brew list, manifest, bin `--version`/`--help` or app, optional service stanza
6. Uninstall (batch hygiene)
7. On failure + `TH_BATCH_FIX_MODE=docs`: write `fix-package/` (FIX.md, patches/, validation.json, local repro log) — **no** git branches or main commits
8. `finalize-run-record.mjs` + batch `index.jsonl` / `fix-index.jsonl`

## Env knobs

```bash
TH_BATCH_CONCURRENCY=2
TH_BATCH_WORKERS=th-allbrew-w1,th-allbrew-w2
TH_BATCH_START=0
TH_BATCH_LIMIT=          # optional cap
TH_BATCH_FIX_MODE=docs   # or off
TH_BATCH_LOCAL_REPRO=1   # host-side bun allbrew temp-tap on failure
TH_BATCH_SKIP_BOOTSTRAP=0
TH_BATCH_INSTALL_TIMEOUT_MS=720000
TH_BATCH_FORCE_OPT_HOMEBREW=0  # 1 = force /opt/homebrew even for w1/w2 names
LUME_REMOTE_ENABLED=true
GITHUB_TOKEN=…        # optional, reduces rate limits
```

## Run

```bash
# full skill-aligned batch (2 workers)
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/run-batch.mjs

# smoke only (legacy serial th-allbrew)
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/run-batch-smoke.mjs

# bootstrap workers alone
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/bootstrap-workers.mjs
```

## Artifacts

- Canonical skill records: `tests/monitored-install-runs/`
- Batch dashboard copies/pointers: `tests/monitored-install-batch/runs/`, `logs/`, `index.jsonl`, `fix-index.jsonl`, `progress.json`
- Entire `tests/monitored-install-batch/` is gitignored (local artifacts + scripts stay on disk)

## Non-goals

- No automatic `bun run release` / push to main during batch
- No per-URL git branches (option A only)
- Fix reconciliation is a separate later pass over `fix-package/` dirs


### Fallback (works today)

Official Homebrew only installs cleanly at `/opt/homebrew`. Until multi-prefix provisioning works, run:

```bash
TH_BATCH_CONCURRENCY=1 TH_BATCH_WORKERS=th-allbrew LUME_REMOTE_ENABLED=true \
  bun tests/monitored-install-batch/run-batch.mjs
```

This uses the existing `th-allbrew` user + exclusive `/opt/homebrew` sparsebundle.

## Homebrew lock hygiene

Harness locks store a **host PID** in the guest VM. Per-URL acquire/release caused mass `env_fail` after ~100 URLs when stale locks could not be cleared (`kill -0 <hostPid>` inside the guest).

**Fix (current):**
- Long-lived `worker-loop.mjs` acquires the prefix **once** per worker
- `forceUnlockHomebrewPrefix` detaches mount + removes lock dir before acquire and after release
- Orchestrator preflight-unlocks before/after bootstrap and after workers stop
- Prefer `TH_BATCH_CONCURRENCY=1 TH_BATCH_WORKERS=th-allbrew` until multi-prefix Homebrew works

## Dual VM pool (homeserver + local)

`vm-install-one.mjs` picks an endpoint from `vm-pool.json` (least-busy free mutex):

| id | host | VM name | mutex |
|----|------|---------|-------|
| homeserver | `app-user@homeserver.local` (LUME_REMOTE) | `vm-homeserver-macos-testing` | `logs/vm-mutex-homeserver.lockdir` |
| local-1 | this Mac | `vm-local-macos-testing-1` | `logs/vm-mutex-local-1.lockdir` |
| local-2 | this Mac | `vm-local-macos-testing-2` | `logs/vm-mutex-local-2.lockdir` |

Both use 4 CPU / 4GB / 65GB, user `th-allbrew`, exclusive `/opt/homebrew` sparsebundle. Local has allbrew 0.0.22 installed.

```bash
# force an endpoint
bun tests/monitored-install-batch/vm-install-one.mjs --url URL --name slug --endpoint local
bun tests/monitored-install-batch/vm-install-one.mjs --url URL --name slug --endpoint homeserver

# auto pick (default) — up to 2 concurrent installs (one per endpoint)
bun tests/monitored-install-batch/vm-install-one.mjs --url URL --name slug
```

Local twin start (shared-dir required):
```bash
lume run --no-display vm-local-macos-testing-1 --shared-dir "$PWD"
# guest once: sudo ln -sfn "/Volumes/My Shared Files" /Volumes/Shared
# harness setup with TH_VM_WORKDIR=/Volumes/Shared/allbrew
```

## Isolation model (required)

Agent judgment may use the host checkout for reading code and disposable worktrees under `/tmp`.

**All real brew/allbrew installs MUST run in the Lume VM**, not on the host:

```bash
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install.log"
```

- Guest user: `th-allbrew`
- Exclusive Homebrew prefix + lock force-unlock hygiene
- Auto uninstall after verify

Host `brew install` / host `allbrew <url>` auto-install is **forbidden** as the success path (pollutes the workstation).

Warpify note: Warp SSH warpify (tmux) can improve interactive remote shells; Lume access here is via `lume ssh` + harness helpers. Prefer `vm-install-one.mjs` for agent install cycles.


## Fix packages (option A) & staged reconciliation

Workers write an optional **fix package** under each run directory:

```
<runDir>/fix-package/
  FIX.md              # human-readable diagnosis
  manifest.json       # machine schema (mode, patches, files, checksums)
  patches/*.patch     # optional unified diffs
  files/**            # optional full-file replacements (target in manifest)
  validation.json     # harness metadata
  tests-added.md
```

### `manifest.json` (schemaVersion 1)

- `mode`: `docs` (diagnosis only) or `patch` (machine-applyable)
- `sourceRunId`, `url`, `slug`, `failureClass`, `baselineCommit`
- `patches[]`: `{ path, sha256 }`
- `files[]`: `{ path, target, sha256 }` — `target` must be relative and under `lib/`, `bin/`, `tests/`, `scripts/`, or `.agents/`
- `validationHints`: optional host commands (advanced)

### Reconcile CLI

Host-side only. **Never** applies into the main checkout or default branch. Apply happens only inside disposable git worktrees under `worktrees/`.

```bash
# Discover pending fix-packages under runs roots
bun run batch:reconcile-fixes -- --dry-run

# Process one run or fix-package directory
bun run batch:reconcile-fixes -- --path tests/monitored-install-runs/<id> --json

# Promote path (after dry-run review): worktree apply → validate → local fix/* branch → linked retry
bun run batch:reconcile-fixes -- --limit 5 --baseline HEAD
```

Flags: `--dry-run`, `--limit N`, `--path`/`--runDir`, `--skip-validation`, `--cleanup`/`--no-cleanup`, `--baseline`, `--queue`, `--json`.

### Worktree & promote policy

1. `git worktree add` under `tests/monitored-install-batch/worktrees/<id>-<rand>`
2. Apply patches/`git apply` and copy `files[]` targets inside that worktree only
3. Optional `validateBeforePromote` (skipped for docs or with `--skip-validation`)
4. Commit on a **local** branch `fix/<slug>-<timestamp>`; do not push; do not touch `main`
5. Append events to `state/fix-index.jsonl` (`validated`, `skipped_docs`, `applied`, `promoted`, `retry_enqueued`, failures)
6. Enqueue linked retry on `agent-queue.json` for the same URL/slug with fix metadata
7. Remove worktree when `--cleanup` (default)

Docs-mode packages are recorded and skipped (`skipped_docs`) without apply/promote.
