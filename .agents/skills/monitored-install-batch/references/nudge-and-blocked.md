# Nudge and blocked handling

## When to nudge

- No meaningful RUN_DIR filesystem progress for ~**3 minutes**
- Child reports **blocked** (approval gate, hung tool, waiting on user)
- Child is thrashing the same failing VM step without a new root cause

## Nudge budget

- At most **3** nudges per launch attempt
- After 3: mark terminal (`failed` or `failed-agent-runtime`), free the slot
- Do not requeue the same launchName in a tight loop

## Nudge message template

Send to the child's **run id**:

```text
NUDGE (<n>/3) for launchName=<…> agentName=<…> slug=<…>

You appear stalled or blocked.
1. Report exact blocked_action or last command (one line).
2. Current phase (0.5 / generate / VM / fix / finalize).
3. Bypass interactive approval: use noninteractive flags, temp tap, or finalize partial.
4. If stuck >60s on a gated command: abandon it, document, continue or finalize.
5. Playbook hint: <A–K letter and one sentence>.
6. Reply with status, then proceed or complete.

Do not wait on the user.
```

## Playbook letters (parent → child hints)

| Letter | Hint |
|--------|------|
| A | Interactive allbrew UI → noninteractive defaults + fix-package; do not click through prompts |
| B | Unknown URL → generate_fail + judgment; no silent URL swap |
| C | formulae.brew.sh core/cask → short-circuit / fail-closed, not homebrew-core monorepo packaging |
| D | BIN_MISSING → fix generator bin naming; temp-tap proof |
| E | Host brew noise → never count host install as success |
| F | Wrong OS/arch assets → arch patterns or language fallback |
| G | service_mismatch → detector fix, not host brew services |
| H | Cask/version/app selection → archive-inspector / cask generator |
| I | Disk/lock/VM attach → one retry then env_fail |
| J | Command approval blocked → alternate path or finalize partial; parent should fix/widen child privilege policy (see SKILL **Child agent privileges**) |
| K | Timeout thrash → one clear root cause + fix-package |

## Blocked vs failed

- **blocked** (rate limit): may requeue later; do not burn the 3-nudge budget on pure API cooldown unless the child is idle with nothing else to do.
- **blocked** (approval / hang): nudge with Case J immediately.
- **errored** runtime: usually terminal for that launch; mark and move on.

## Parent stop criteria (per item)

Stop the item (mark done, free slot) when any hold:

1. Three nudges without completion → `--mark-done … failed` (or `failed-agent-runtime`)
2. **~15 minutes wall clock** since `launchedAt` (hard cap; see below)
3. Harness reports the child run is gone and no RUN_DIR finalize is in progress → `failed-agent-runtime` / `failed`

### Wall-clock hard cap (~15 min)

Default: **`TH_BATCH_ITEM_WALL_MS=900000`** (15 minutes) from `launchedAt` (or first mark-launched time).

At the cap the parent **must** stop the child and free the slot. Choose terminal status by activity:

| At ~15 min the job is… | Mark as | Notes |
|------------------------|---------|--------|
| **Legitimately still active** | **`skipped`** | Heavy but healthy work still progressing (e.g. large pip graph brew install mid-download, VM helper still writing logs, child still advancing phases). Free the slot so the marathon can move on. Prefer index note `skipReason: too_heavy` or `wall_clock_cap`. |
| **Stalled / hung / no progress** | **`failed`** or **`failed-timeout`** | No meaningful RUN_DIR progress, dead `vm-install-one`, thrashing the same error, approval hang after nudges, or child runtime dead. |

**Legitimately still active** (all of these support `skipped`):

- RUN_DIR mtimes or log tails advanced within the last ~2–3 minutes, **or**
- A live `vm-install-one` / guest brew process owned by this slug, **or**
- Child harness still turning tools with new RUN_DIR artifacts

**Not** “active” (do not use `skipped` — use fail):

- Idle agent with no FS progress past the 3-min nudge window
- Waiting forever on VM mutex / stopped VM with no alternate path
- Same failing command loop without a new root cause

### Parent actions at the 15-minute cap

1. Classify active vs stalled (table above).
2. Message the child once if still reachable: stop VM work, finalize partial RUN_DIR if cheap (<60s), then exit — **do not** wait for a full fix-package marathon.
3. Kill the child run if it does not exit promptly; release or clear **stale** VM mutex only when the owner PID is dead (never steal a live peer’s lock).
4. `--mark-done <agentName|idx> skipped` **or** `failed` / `failed-timeout`.
5. Append `agent-index.jsonl` with `skipReason` / `failureClass` when useful (`too_heavy`, `wall_clock_cap`, `timeout`).
6. Refill the free slot from the queue.

Do **not** requeue `skipped` automatically in the same wave. User may later promote heavy packages to a long-timeout profile or a dedicated VM night run.

`skipped` is **terminal** for this marathon pass (like success/failed): it frees concurrency and is not pending.
