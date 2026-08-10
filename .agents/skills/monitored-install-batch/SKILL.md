---
name: monitored-install-batch
description: >
  Orchestrate the allbrew monitored-install URL queue with a parent/orchestrator
  agent and parallel child agents. Use whenever the user says "proceed", "continue
  the batch", "monitored-install-batch", "agent queue", "spin up child agents for
  installs", "nudge stalled install agents", "exhaust agent-queue.json", "run the
  install marathon", "mark-done / mark-launched", "print-wave / export wave", or
  wants any multi-URL allbrew install batch driven by parent+child agents rather
  than the deterministic worker-loop alone. Also use when resuming mid-queue from
  tests/monitored-install-batch/state/, reconciling fix-packages after a wave, or
  recovering from blocked/stale children. Prefer this skill over ad-hoc batch
  scripting whenever orchestration, concurrency, or child-agent lifecycle is
  involved — even if the user only says "keep going" after a prior batch session.
metadata:
  version: "1.5"
---

# Monitored-install batch (orchestrator)

Parent/orchestrator playbook for exhausting `tests/monitored-install-batch/state/agent-queue.json` by running **child agents**, each handling **one** URL via `.agents/skills/monitored-install`.

Deterministic workers (`run-orchestrator.mjs` / `worker-loop.mjs`) are a separate path. This skill is the **agent-harness** path: you are the parent; children do judgment + VM install + optional Option A fixes.

This skill is **harness-agnostic**. It assumes only that the parent can (1) run local shell commands, (2) start N child agent runs with a shared base prompt + per-child prompt, (3) receive completion/blocker messages and lifecycle/status signals from those children, and (4) message a child by opaque run id. Map those capabilities onto whatever your product calls them (multi-agent launch, Task tool, subagents, etc.).

## Goals

1. Keep concurrency filled (`TH_BATCH_CONCURRENCY`, default **6** — above the 3 VM endpoints so judgment/fix work does not leave installs idle).
2. **Always VM** — never treat **host** `brew install` / host tap auto-install as success (VM only). Every install/verify is `LUME_REMOTE_ENABLED=true …/vm-install-one.mjs`.
3. **Always patch artifacts** — children never live-patch host `main`; code fixes are `fix-package/patches/*.patch` in a disposable worktree (`tests/monitored-install-batch/worktrees/`) for later parent-side integration (`batch:reconcile-fixes`). Host `main` stays clean.
4. Mark completions from child messages + RUN_DIR artifacts; refill until the queue is empty (or only intentionally deferred retries remain).
5. Nudge stalled children; stop after 3 failed nudges **or ~15 min wall clock** (see stale policy); post-process fix-packages without auto-release unless the user asks.

## Layout (source of truth)

| Path | Role |
|------|------|
| `tests/monitored-install-batch/` | Batch harness root (often gitignored) |
| `…/state/agent-queue.json` | Queue items + statuses |
| `…/state/agent-wave.json` | Last prepared wave (basePrompt + agents[]) |
| `…/state/agent-index.jsonl` | Parent marks + child appends |
| `…/state/fix-index.jsonl` | Fix reconcile events |
| `…/urls-shuffled.json` | Catalog source for `--rebuild-queue` |
| `…/run-agent-batch.mjs` | Queue CLI for the parent |
| `…/vm-install-one.mjs` | **Required** VM install helper for children |
| `…/child-agent-privileges.DRAFT.toml` | Required child privileges + sample allow/deny patterns (no named profile) |
| `…/worktrees/` | Disposable fix worktrees only |
| `tests/monitored-install-runs/<runId>/` | Per-URL skill records (canonical) |
| `.agents/skills/monitored-install-batch-child/` | **Child** skill (VM-isolated judge→try→fix→verify; patch artifacts, no host live-fix; see `.agents/skills/monitored-install/SKILL.md` for single-URL human loop) |

Work from the allbrew repo root (e.g. `~/Developer/allbrew` or the active clone). `cd` there before every batch command.

## Identifiers

- **agentName** (stable): `url-0079-fly-io-cli` — use for `--mark-launched` / `--mark-done` when the CLI matches `agentName` or `idx`.
- **launchName** (unique per wave): `u0079-fly-io-cli-20260806T161355Z` — use as the child run’s display/name key so the harness does not reject duplicate names across waves.
- **idx**: integer catalog / queue index.
- **slug**: short package name for RUN_DIR and `--name`.
- **child run id**: opaque id returned when the child starts — the only trusted handle for messaging that child.

Persist `child run id` on the queue item when possible (e.g. field `agentId`) so a later parent can nudge without hunting chat history.

## Harness adapter (map once per product)

| This skill needs | You provide |
|------------------|---------------|
| Start N children with shared + per-child prompts | Parent’s multi-agent / subagent launch API |
| Execution on the dev machine | Children share the repo filesystem; they invoke Lume themselves |
| Child shell privileges | Unattended policy covering the checklist in **Child agent privileges** below |
| Message child by id | Parent → child messaging |
| Child → parent updates | Inbox, callbacks, or status events (`started`, `blocked`, `succeeded`, `failed`, `errored`) |
| Wait without busy-loop | Block on next child event, or end turn and resume on notification |

Do not hard-code a single vendor’s tool names in child prompts unless the user asks. Tell children *what* to report (start / blocker / complete); let the harness deliver it.

## Child agent privileges (orchestrator duty)

Children **must not** sit on interactive command-approval UI. Before the first wave (and again if children block on gates), the **parent/orchestrator** must ensure the harness grants the privileges below. Do **not** reference a fixed agent-profile name from this skill — describe capabilities, then map them onto whatever the product calls profiles, policies, or allowlists.

### Required (allow without interactive approval)

- Shell on the host that holds the allbrew checkout
- `bun` / `node`: `bin/allbrew.ts`, `tests/monitored-install-batch/*`, skill scripts, `bun test` / `bun run check`
- `git` worktrees + normal status/diff/add/commit; push only to `agent/*` branches if needed
- Lume + remote VM transport: `lume`, `ssh`, `rsync`, `scp`, `LUME_*` env prefixes
- Network read for judgment: `curl` / `wget` / fetch
- `brew` as used by `vm-install-one.mjs` and temp-tap debug (not host catalog success)
- FS plumbing and writes under batch `worktrees/`, `tests/monitored-install-runs/`, temp dirs, batch `state/`

### Forbidden (never auto-approve for children)

- `sudo` / `su`
- Destructive root/home wipes (`rm -rf /`, `~`, `$HOME`)
- Disk wipe tools (`dd`, `mkfs`, `diskutil erase|partition`)
- `bun run release`
- `git push` to `main` / `origin main`, `git push --force`
- Treating **host** `brew install` of the catalog app as success

### Parent actions

1. **Attempt** to create or select a harness agent profile/policy with the privileges above (any local name is fine).
2. If the harness cannot configure that policy autonomously, **prompt the user once** with this checklist and `assets/child-agent-privileges.DRAFT.toml` (sample regexes if the host uses allow/deny lists).
3. Launch children **under that policy** so waves do not stall on click-to-approve.
4. If children still report approval blocks: nudge (Case J), then re-prompt the user to widen the policy — do not burn the queue on gated shells.

Canonical detail + optional regex samples: `assets/child-agent-privileges.DRAFT.toml` (mirrored under `tests/monitored-install-batch/` when present).

## Queue CLI (`run-agent-batch.mjs`)

```bash
bun tests/monitored-install-batch/run-agent-batch.mjs <cmd> …
```

| Command | Purpose |
|---------|---------|
| `--status` | Counts + next pending (running list if the script build supports it) |
| `--print-wave` | Build next wave → write `state/agent-wave.json`, print JSON |
| `--base-prompt` | Print shared child base prompt |
| `--mark-launched <agentName\|idx>…` | Set `running` + `launchedAt` |
| `--mark-done <agentName\|idx> <status>` | Terminal status + append `agent-index.jsonl` |
| `--rebuild-queue` | Rebuild from `urls-shuffled.json` (rare; destructive to hand-edits) |

**Env:** `TH_BATCH_CONCURRENCY` (default **6**), `TH_BATCH_ITEM_WALL_MS` (default **900000** = 15 min per item wall clock), `TH_BATCH_URLS`, `TH_BATCH_START`, `TH_BATCH_LIMIT`, `TH_BATCH_ONLY_FAILED` (default skip prior successes), `TH_BATCH_FIX_MODE=docs`.

### Script version drift

On-disk CLI may be **minimal** (no export helper, no launchTag, `markLaunched` only matches `agentName`/`idx`). Session practice also used a richer exporter with unique `launchName`s and stale/inactive `--status`.

If export is missing:

1. `--print-wave` (or read `agent-wave.json`).
2. Rewrite each child name to a unique launchName: `u{idx padded}-{slug}-{UTC stamp}Z`.
3. Prefer the **canonical assignment** prompt in `references/orchestrator-loop.md` over thin `perUrlPrompt` builds.
4. Feed `basePrompt` + per-child prompts into your harness’s multi-child launch API.

After launch, `--mark-launched` with **agentName** (not only launchName) so the minimal CLI updates the queue.

## Status vocabulary

| Status | Meaning |
|--------|---------|
| `queued` / `retry` | Pending |
| `launching` | Wave prepared, not confirmed running |
| `running` | Child live |
| `success` / `success-not-fixed` / `fixed_success` | Good terminal |
| `failed` | Terminal fail (see RUN_DIR `failureClass`) |
| `failed-fix-applied` | Fix landed + verified |
| `failed-agent-runtime` | Parent stopped child / harness runtime death |
| `failed-timeout` | Hit wall-clock cap while **stalled** / hung |
| `skipped` | Hit wall-clock cap while **legitimately still active** (too heavy for the 15‑min budget); free the slot |
| `blocked` | Rate-limit or wait (not always terminal) |

Common **failureClass** / skip notes: `generate_fail`, `brew_fail`, `env_fail`, `prompt_hang`, `service_mismatch`, `github_rate_limit`, `too_heavy`, `wall_clock_cap`, …

Mark from child `outcome.json` when present. `failed` for generate_fail-with-fix-package is fine when that is what children report.

## Parent loop (resume anytime)

```text
1. Orient
2. Reap completions / correct stale marks
3. Nudge or stop blocked/stale runners
4. Fill free slots with a new wave
5. Wait on child messages + lifecycle/status
6. Repeat until no pending
7. Optional: reconcile fix-packages
```

### 1. Orient

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
bun tests/monitored-install-batch/run-agent-batch.mjs --status
```

Also inspect `state/agent-queue.json`, `state/agent-wave.json`, recent `tests/monitored-install-runs/*/`, and any pending child messages/events.

Do **not** `--rebuild-queue` unless the user asks or the file is corrupt.

### 2. Reap completions

Triggers: structured child completion message; lifecycle/status `succeeded`/`failed`/`errored`; new `outcome.json` even if the message is late.

1. Read RUN_DIR `outcome.json`, `summary.md`, optional `fix-package/`.
2. `bun … --mark-done <agentName|idx> <status>`.
3. Duplicate `agent-index.jsonl` lines are OK if the child already appended; **queue** correctness matters most.
4. Late true success after a premature `failed` mark: **re-mark** to the real terminal status.

### 3. Stale / blocked / wall-clock policy

| Signal | Action |
|--------|--------|
| No RUN_DIR FS progress **~3 min** | Nudge #1–3 with playbook letter (A–K) |
| Child status `blocked` | Nudge: report blocked action, bypass interactive approval gates, finalize partial if stuck >60s |
| Runtime error / dead child | Mark `failed-agent-runtime` (or `failed`); do not infinite-relaunch the same launchName |
| **3 nudges**, no completion | `--mark-done … failed` (or `failed-agent-runtime`); free the slot |
| Wall-clock **~15 min** since launch, **legitimately still active** (log/process progress, heavy install mid-flight) | Stop child; `--mark-done … skipped` (`skipReason: too_heavy` / `wall_clock_cap`); free the slot — do **not** burn more concurrency on multi-hour installs |
| Wall-clock **~15 min**, **stalled / hung** (no progress) | Stop child; `--mark-done … failed` or `failed-timeout`; free the slot |

Default wall budget: **15 minutes** (`TH_BATCH_ITEM_WALL_MS=900000` if set in policy/env). Full decision table: `references/nudge-and-blocked.md`.

Message the child via its **run id**. Include launchName, slug, and the escape hatch (e.g. Case C formulae.brew.sh short-circuit, Case J approval bypass).

Children must not wait on interactive command-approval UI. Ensure the child privilege policy from **Child agent privileges** is in force; use `assets/child-agent-privileges.DRAFT.toml` when configuring or prompting the user.

### 4. Launch a wave

Preconditions: `running + launching < concurrency`, pending exists.

**Pre-filter (do not launch):** URLs matching `https://formulae.brew.sh/formula/*` (Homebrew core formula pages). Bulk-mark them `skipped` with `skipReason: formulae_brew_sh_formula` and free the slot — prefer upstream GitHub/registry URLs or core `brew install` outside this marathon. Cask pages (`/cask/`) are **not** covered by this rule unless the user extends it.

```bash
bun tests/monitored-install-batch/run-agent-batch.mjs --print-wave
```

Then start children with:

- Shared **base** prompt (isolation + Cases A–K when available)
- Per-child **canonical assignment** prompt
- **Unique** launch names
- Working directory = repo root (absolute path in the prompt)

After the harness returns run ids:

1. Record `launchName → child run id`.
2. `--mark-launched <agentName…>`.
3. Optionally write run ids onto queue items if the CLI does not.

Do not oversubscribe free agent slots (cap = `TH_BATCH_CONCURRENCY`, default 6). Exclusive Homebrew allows at most one `vm-install-one` per endpoint (3 pool VMs); extra children judge/generate/fix so free VMs are claimed quickly.

### 5. Wait / monitor

Prefer event-driven resume (messages + lifecycle) over tight polling. Between events: `--status`, RUN_DIR mtimes, `vm-install.log` tails.

### 6. Child contract

Each child follows **`.agents/skills/monitored-install-batch-child`** (VM-isolated, patch-artifact) — not the host single-URL `monitored-install`. Same judge→try→fix→verify loop, but with batch guardrails (VM-only success, disposable worktree patches, no host live-fix):

1. Follows **monitored-install-batch-child** (local validation only; no `bun run release`).
2. Uses **only** its canonical url/slug.
3. Runs full install/verify/uninstall **only** via isolated VM:

   ```bash
   LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
     --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install.log"
   ```

   Host `brew install` is never the success path (`vmHelperUsed` must be true).
4. Local generate only for fast debug: temp tap + `CI=1 ALLBREW_NONINTERACTIVE=1`.
5. Fixes **only** in disposable worktree → `fix-package/patches/*.patch` artifacts + `FIX.md` (Option A). Never live-patch host `main`.
6. Reports start, blockers, completion (launchName, agentName, RUN_DIR, status, fix-package patch artifact, vmHelperUsed, hostClean).

### 7. Post-process

```bash
bun run batch:reconcile-fixes -- --dry-run
bun run batch:reconcile-fixes -- --path tests/monitored-install-runs/<id> --json
```

Apply only under `tests/monitored-install-batch/worktrees/`. Never promote to `main` without an explicit user request.

## Failure classes parents see often

| Class | Parent stance |
|-------|----------------|
| `generate_fail` + fix-package | Mark `failed`; leave for reconcile |
| `brew_fail` upstream/platform | Mark `failed`; no endless retry |
| `env_fail` (VM lock/attach) | Mark `failed` or requeue **once** if hygiene is clear |
| `prompt_hang` | Mark `failed`; expect noninteractive fix-package |
| formulae.brew.sh core/cask (Case C) | Short-circuit / fail-closed — not monorepo source-build |
| Wall clock, still active (heavy) | Mark **`skipped`** (`too_heavy` / `wall_clock_cap`); free slot |
| Wall clock, stalled | Mark **`failed-timeout`** or `failed` |

## Anti-patterns

- Host `brew install` as the green path
- Reusing the same child run name across waves
- Marking done with launchName only when the CLI only matches agentName/idx
- Launching a full new wave while older children still `running` (oversubscribe)
- Infinite VM retries on env_fail
- Auto-release from children
- Silent URL substitution
- Ignoring late completions after a premature failed mark
- Encoding a single vendor’s tool names as the only way to orchestrate

## Progressive disclosure

| Need | Read |
|------|------|
| Wave JSON, launch math, message templates | `references/orchestrator-loop.md` |
| State schemas, status enums, index rows | `references/state-and-queue.md` |
| Nudge text, 3-strike stop, 15-min wall, `skipped` vs fail | `references/nudge-and-blocked.md` |
| Child isolation + completion schema (batch-child, VM + patches) | `references/child-contract.md` + `.agents/skills/monitored-install-batch-child/SKILL.md` |
| Child privileges + sample allow/deny patterns | `assets/child-agent-privileges.DRAFT.toml` |
| Single-URL phases | `.agents/skills/monitored-install/SKILL.md` |

## Handoff / takeover — unwinding in-flight and leftover state (including crash / messy shutdown)

When a **new parent/orchestrator** starts — new harness session, repo reopen, `agent-queue.json` left mid-flight, **or a prior harness died mid-batch** (process kill, `Ctrl-C` during `run_agents`, host reboot, VM SSH drop, token expiry, OOM) — run this unwind **before** the normal loop. It is **filesystem-first and idempotent**: it recovers from what is on disk (`state/agent-queue.json`, `RUN_DIR`s, host mutex dirs, VM guest locks) without trusting any in-memory state from the dead harness. Re-running it after a clean shutdown is a no-op. Keep it read-mostly until every `running`/`launching` row is classified — do not bulk-reset the queue.

> **Mental model:** the previous harness may have left *any* combination of: queue rows stuck `running` with no `agentId`, `RUN_DIR`s with no `outcome.json`, host `logs/vm-mutex-*.lockdir` held by a now-dead pid, guest `/var/run/lume-homebrew.lock` inside a VM still held, local twins `stopped` while `homeserver` is busy, `agent-wave.json` pointing at a half-launched wave, half-written `fix-package/` trees, temp taps in `/var/folders/*/T/tmp.*` that already host-installed a cask, or a `brew install --cask` mid-copy into `/Applications`. All of those are normal after a crash — this section makes the takeover elegant.

### 0. Snapshot before mutating (filesystem ground truth)

You have **no reliable memory** of the dead harness’s opaque child run ids. Treat the filesystem as the source of truth.

```bash
cp tests/monitored-install-batch/state/agent-queue.json \
   tests/monitored-install-batch/state/agent-queue.json.bak-$(date -u +%Y%m%dT%H%M%SZ)
bun tests/monitored-install-batch/run-agent-batch.mjs --status
ls -1dt tests/monitored-install-runs/* 2>/dev/null | head -20
cat tests/monitored-install-batch/state/agent-queue.json | python3 -c "
import json
q=json.load(open('tests/monitored-install-batch/state/agent-queue.json'))
for i in q['items']:
  if i['status'] in ('running','launching'):
    print(i['agentName'], i.get('launchName'), i.get('agentId'), i.get('launchedAt'), i.get('runDir'), (i.get('url') or '')[:80])
"
# Also look for orphan RUN_DIRs that have no queue row (crashed before mark-launched)
ls -1 tests/monitored-install-runs/ 2>/dev/null | wc -l
cat tests/monitored-install-batch/state/agent-wave.json 2>/dev/null | python3 -m json.tool | head -n 60
# host VM mutexes + local VM liveness (stale pids survive a crash)
bun tests/monitored-install-batch/vm-guest-health.mjs --clear-stale --json | python3 -m json.tool | head -n 120
lume ls --format json | python3 -c "import json,sys; [print(v['name'], v['status'], v.get('sshAvailable')) for v in json.load(sys.stdin)]"
# host pollution that may have landed via temp-tap before the crash
brew list --cask 2>&1 | tail -20; ls /opt/homebrew/Caskroom 2>&1 | tail -20
ps aux | grep -E "vm-install-one|allbrew.*--tap|acquireHomebrewPrefix" | grep -v grep | head -20
```

The goal is to answer for each queue row: *is this `running` row still attached to a live child (or at least recent RUN_DIR activity), and does its `RUN_DIR` already hold the terminal outcome?* Do not rely on `agentId` / `launchName` from the previous harness — minimal `run-agent-batch.mjs` builds never populated `agentId`, and the dead harness’s ids are unrecoverable.

### 1. Classify every `running` / `launching` row (filesystem-first)

For each item `i` where `status ∈ {running, launching}`:

| Signal (filesystem) | Meaning | What to do |
|--------|---------|------------|
| `runDir` exists and `outcome.json` says `success`/`failed`/`blocked`/`skipped` | Child already finished and flushed its record before the parent died; queue mark is stale. Classic crash artifact: child appended `agent-index.jsonl` + wrote `outcome.json`, parent crashed before `--mark-done`. | **Reap**: `bun … --mark-done <agentName> <outcome.status>` (see `references/state-and-queue.md`). Preserve `fix-package/` if present; the `agent-index.jsonl` duplicate is harmless. |
| `runDir` exists, no `outcome.json`, but `vm-install.log` / `summary.md` / `agent-judgment.json` mtime within last **~3 min**, or `vm-install-one.mjs` pid still alive (`ps`/mutex holder) | Still active on a VM (pool wait or long install) — the previous parent died but the child process survived as an orphan. | **Adopt, don’t duplicate**: keep `running`; *do not* launch a second child for the same `agentName`/`idx`. Optionally recover by re-attaching via harness if the pid is still alive, otherwise just monitor its `RUN_DIR` mtimes. Nudge per `references/nudge-and-blocked.md` 3-min rule if stalled. `launchedAt` wall-clock keeps running — do not reset it. |
| `runDir` exists, no `outcome.json`, and mtime is **stale (>5–8 min)** with no live pid / no VM `installCmd` streaming and mutex not held | Orphan that died with its parent (or hung on approval-gated shell after the crash). | **Stop + mark** `failed` or `failed-agent-runtime` (or `failed-timeout` if logs show a hang). Free the slot. Its `fix-package/` if any is still reconcilable — don’t delete it. |
| `runDir` missing AND `launchedAt` older than **15 min** (`TH_BATCH_ITEM_WALL_MS`) | Orphaned launch that never materialised (harness crashed between `--mark-launched` and child’s `init-run-record`). | **Stop + mark** `failed-agent-runtime` (or `failed-timeout`). Free the slot. |
| `runDir` missing but `launchedAt` younger than 15 min | Late-starting child (cold VM SSH bootstrap, `lume run --detach` still booting). The dead parent may have launched it seconds before crashing. | **Keep running**; give it until the wall-clock cap. Check next cycle — if no `runDir` appears by the cap, mark `failed-agent-runtime`. |
| `agent-wave.json` still lists `launching` items that never became `running` | Wave was half-persisted when the parent died (printed wave but crashed before `--mark-launched` for some). | Treat those `launching` rows as `queued` for refill — do **not** mark them `failed`. Next `print-wave` will re-emit them (idempotent). Only `--mark-launched` promotes to `running`. |
| Queue says `running` but **no** `RUN_DIR` on disk **and** an orphan `tests/monitored-install-runs/*__<slug>` exists with a different timestamp | Previous child wrote to a `RUN_DIR` but the queue row points at an older `runDir` (or none). Filesystem is newer than queue. | Reap from the **actual** `RUN_DIR` on disk (the one with the latest mtime / `latest` symlink target), then `--mark-done` the matching `agentName`. Queue `runDir` is just a cache — `outcome.json` on disk wins. |

Never infer “dead” from missing `agentId` alone — minimal `run-agent-batch.mjs` builds never populated `agentId`, and the previous harness’s ids are gone with it. Check harness lifecycle + `RUN_DIR` + `ps`/mutex first.

Reference table for the *why* behind re-marking and late completions: `references/orchestrator-loop.md` § Reap completions.

### 1b. Orphan RUN_DIRs with no queue row

A crash can leave `tests/monitored-install-runs/2026-08-09T13-…__<slug>/` on disk while the queue still says `queued` (parent crashed before `--mark-launched`). Those runs are still valid evidence — don’t launch a duplicate for the same `idx`/`slug` until you’ve checked `ls -1dt tests/monitored-install-runs/* | head` and confirmed the slug isn’t already in-flight on disk with recent mtime. If the orphan’s `outcome.json` is terminal, reap it into the queue (`--mark-done`) rather than re-running the URL.

### 2. Clear stale host-side VM mutexes and guest Homebrew locks

Host mutex dirs (`logs/vm-mutex-*.lockdir/owner`) and guest `/var/run/lume-homebrew.lock` inside the VMs can outlive the child that held them (e.g. `91501\tgridplayer\thomeserver` after `devdash` → `gridplayer` handoff, or a host `kill -9` while holding the mutex). They block `acquirePoolSlot()` for every endpoint and make the next `vm-install-one` look “stuck” when it is just pooled-waiting.

```bash
# Remove only dead holders (pid no longer alive) — safe, leaves live holders alone
bun tests/monitored-install-batch/vm-guest-health.mjs --clear-stale --json
# also: lib/vm-pool.mjs:isEndpointLocked() auto-clears dead pids on next acquire,
# and lib/guest-ops.mjs:forceUnlockHomebrewPrefix() clears guest locks before/after
# acquireHomebrewPrefixDurable. Both are no-ops if the holder is still alive.
```

Do not `rm -rf` a `lockdir` whose `owner` pid is still alive — that would let two children enter the same exclusive Homebrew prefix concurrently (`/opt/homebrew` corruption). If you must free a live holder, `kill` the holder pid first (the child’s `vm-install-one` wrapper) and let the next acquire clean it.

Guest-side stale locks survive a host crash even after the host mutex is cleared. The next child’s `acquireHomebrewPrefixDurable` calls `forceUnlockHomebrewPrefix("pre-acquire")` automatically; no manual SSH needed unless VM SSH itself is down.

### 3. Warm the VM pool (locals are often `stopped` after a crash/reboot)

Local twin VMs (`vm-local-macos-testing-1/2` in `vm-pool.json`) are frequently `stopped` after a host reboot, `lume` daemon restart, or a crash that left them orphaned `running` but unreachable. Starting them before the first wave restores 3-way concurrency; otherwise later children serialize on `homeserver` only.

```bash
bun tests/monitored-install-batch/run-agent-batch.mjs --ensure-vms
# idempotent: already-running is a no-op, stopped → lume run --detach
# or: bun tests/monitored-install-batch/run-agent-batch.mjs --print-wave-ensured  # ensure + print in one call
```

See `run-agent-batch.mjs:ensureLocalVms()` for the exact mapping (`LUME_VM_NAME` ↔ `lume ls --format json`). Wait ~10–30 s for `sshAvailable: true` before launching; `vm-guest-health.mjs --json` reports `healthy`/`usable` per endpoint. If locals report `ssh_unavailable` after 30 s, they still need Remote Login / project-user bootstrap — `homeserver` remains usable alone; don’t block the batch on it, but note the degraded concurrency.

### 4. Reconcile `agent-index.jsonl` vs queue

- Queue is the **source of truth** for scheduling; `agent-index.jsonl` is append-only audit — the dead parent may have appended some rows but not yet flushed `agent-queue.json` to disk.
- If a child appended a terminal row but the parent crashed before `--mark-done`, the queue still says `running` — step 1’s “outcome present → reap” fixes it. Duplicate lines are fine.
- `agent-wave.json` may be stale/partial (half a wave). Treat it as a hint, not authority — rebuild the next wave from `agent-queue.json` pending (`queued`/`retry`) filtered by `TH_BATCH_CONCURRENCY`.
- Never requeue a terminal status back to `queued` on takeover unless you are intentionally retrying (set `requeuedAt`, `requeuedFrom`, `retryReason`).
- `fix-package/` trees under `tests/monitored-install-batch/fix-packages/` survive the parent crash — they’re already on disk under the `RUN_DIR` even if the queue still says `running`. Steps 1 and 4 preserve them; reconcile later via `bun run batch:reconcile-fixes -- --dry-run`.

### 5. Host pollution check (do this before refilling)

A crash often leaves a temp-tap child mid-`brew install --cask` with no uninstall. The local `bun run bin/allbrew.ts … --tap $(mktemp -d)` leg still host-`brew install`s even when `vm-install-one` was the intended success path. A prior build hardcoded `LUME_REMOTE_ENABLED=true … --endpoint homeserver`, serializing onto one VM and letting that temp-tap leg host-install casks into `/Applications` / `/opt/homebrew/Caskroom` (observed: `/Applications/Aizen.app` + `/Applications/Nicotine+.app` / `Caskroom/aizen` + `Caskroom/nicotine-plus`).

```bash
# tailored to the last wave / stuck slugs — not a blind brew list
for slug in $(cat tests/monitored-install-batch/state/agent-queue.json | python3 -c "import json; q=json.load(open('tests/monitored-install-batch/state/agent-queue.json')); print(' '.join(i['slug'] for i in q['items'] if i['status'] in ('running','launching')))" 2>/dev/null); do
  brew list --cask 2>&1 | grep -qx "$slug" && echo "HOST CASK STILL INSTALLED: $slug"
  ls -d /opt/homebrew/Caskroom/$slug 2>&1 | head -1
  ls -d "/Applications/${slug}.app" "/Applications/${slug^}.app" 2>&1 | head -1
done
# if found: brew uninstall --cask <name> --zap  (or without --zap to keep prefs)
ls /var/folders/*/T/tmp.* 2>&1 | head -20  # orphan temp taps are harmless but noisy
```

Do not treat a temp-tap host install as “success”; only VM `VERIFY_OK=true` counts. Clean before refilling so the next wave’s `verify` phase doesn’t see a false-positive `--version` from a host-installed binary.

### 6. Resume the normal loop

After the unwind:

1. `bun tests/monitored-install-batch/run-agent-batch.mjs --status` should now show `running + launching < concurrency` and accurate `remaining`. No `running` row should remain that is both stale (old `launchedAt`) and without a recent `RUN_DIR` mtime — those are now `failed-agent-runtime` / `blocked`.
2. `running` rows that are truly still live (orphaned child still churning on a VM, `vm-install.log` tail shows recent pool-wait or download progress) keep their `launchedAt`; do not reset the wall-clock.
3. Now run the regular loop from `## Parent loop → 2. Reap / 3. Nudge / 4. Fill free slots`.

If you arrived with zero live children and all `running` rows were reaped or marked `failed-agent-runtime`, the next `print-wave` / `print-wave-ensured` will produce a full refill wave (cap `TH_BATCH_CONCURRENCY`) — this is the elegant “catch up from where we left off” handoff. If some orphans are still live, refill only `free = concurrency - liveRunning` slots (e.g. 2 live → 4 new) — never oversubscribe the 3 VM endpoints.

## Done criteria

- No `queued`/`retry` left (or only deferred retries; `skipped` heavy items stay terminal unless the user requeues)
- No `running`/`launching` without a live child id or a terminal mark
- No `running` item past the **15 min** wall without a parent decision (`skipped` vs fail)
- Queue + index reflect recent completions
- Optional dry-run reconcile for outstanding fix-packages
- Brief user report: counts, notable fixes, residual risks, skipped-as-too-heavy list
