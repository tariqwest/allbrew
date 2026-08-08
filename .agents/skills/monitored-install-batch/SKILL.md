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
  version: "1.3"
---

# Monitored-install batch (orchestrator)

Parent/orchestrator playbook for exhausting `tests/monitored-install-batch/state/agent-queue.json` by running **child agents**, each handling **one** URL via `.agents/skills/monitored-allbrew-install`.

Deterministic workers (`run-orchestrator.mjs` / `worker-loop.mjs`) are a separate path. This skill is the **agent-harness** path: you are the parent; children do judgment + VM install + optional Option A fixes.

This skill is **harness-agnostic**. It assumes only that the parent can (1) run local shell commands, (2) start N child agent runs with a shared base prompt + per-child prompt, (3) receive completion/blocker messages and lifecycle/status signals from those children, and (4) message a child by opaque run id. Map those capabilities onto whatever your product calls them (multi-agent launch, Task tool, subagents, etc.).

## Goals

1. Keep concurrency filled (`TH_BATCH_CONCURRENCY`, default **6** — above the 3 VM endpoints so judgment/fix work does not leave installs idle).
2. Never treat **host** `brew install` / host tap auto-install as success (VM only).
3. Mark completions from child messages + RUN_DIR artifacts; refill until the queue is empty (or only intentionally deferred retries remain).
4. Nudge stalled children; stop after 3 failed nudges **or ~15 min wall clock** (see stale policy); post-process fix-packages without auto-release unless the user asks.

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
| `.agents/skills/monitored-allbrew-install/` | **Child** skill |

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

Each child:

1. Follows **monitored-allbrew-install** (local validation only for release docs).
2. Uses **only** its canonical url/slug.
3. Runs full install/verify/uninstall via:

   ```bash
   LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
     --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install.log"
   ```

4. Local generate: temp tap + `CI=1 ALLBREW_NONINTERACTIVE=1`.
5. Fixes in disposable worktree → `fix-package/` (Option A). No release/push main unless parent orders it.
6. Reports start, blockers, completion (launchName, agentName, RUN_DIR, status, fix-package, vmHelperUsed).

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
| Child isolation + completion schema | `references/child-contract.md` |
| Child privileges + sample allow/deny patterns | `assets/child-agent-privileges.DRAFT.toml` |
| Single-URL phases | `.agents/skills/monitored-allbrew-install/SKILL.md` |

## Done criteria

- No `queued`/`retry` left (or only deferred retries; `skipped` heavy items stay terminal unless the user requeues)
- No `running`/`launching` without a live child id or a terminal mark
- No `running` item past the **15 min** wall without a parent decision (`skipped` vs fail)
- Queue + index reflect recent completions
- Optional dry-run reconcile for outstanding fix-packages
- Brief user report: counts, notable fixes, residual risks, skipped-as-too-heavy list
