---
name: monitored-install-batch:unblock-child
description: Parent/orchestrator recovery for a blocked or stalled monitored-install batch child. Use when a child reports blocked, shows no RUN_DIR/vm-meta progress ~3min, hits VM infra (lock/sparsebundle/ENOSPC/bootsnap) or an approval gate, or wall-clock nears 15min.
---

# Unblock child (batch parent)

You are the **parent/orchestrator** for `tests/monitored-install-batch/state/agent-queue.json` running the harness path via `.agents/skills/monitored-install-batch`. One of your children (a `monitored-install-batch-child` worker for one URL) is **blocked or stalled**. Do not burn queue slots — diagnose, nudge, clear stale infra, and requeue or finalize.

This is the **parent-side** sub-skill. Child-side self-help is `.agents/skills/monitored-install-batch-child/unblock-myself`. Also see `references/nudge-and-blocked.md` (nudge budget, playbook A–K, wall-clock cap) and `tests/monitored-install-batch/BLOCKERS.md` (B1–B7 classification).

## 1. Diagnose — which blocker?

Gather without messaging the child yet:

```bash
bun tests/monitored-install-batch/run-agent-batch.mjs --status 2>&1 | head -n 40
cat tests/monitored-install-batch/state/agent-queue.json | python3 -m json.tool | grep -A3 '"agentName": "<agentName>"' | head
cat "$RUN_DIR/vm-meta.json" 2>&1 | python3 -m json.tool | tail -n 40
tail -n 80 "$RUN_DIR/vm-install.log" 2>&1 | tail -n 80
tail -n 40 "$RUN_DIR/vm-install.log.hygiene.txt" 2>&1 | tail -n 40
bun tests/monitored-install-batch/vm-guest-health.mjs --json 2>&1 | python3 -m json.tool | head -n 80
git worktree list --porcelain 2>&1 | grep -E "worktree|prunable" | head -n 40
df -h / 2>&1 | head -n 10
cat tests/monitored-install-batch/BLOCKERS.md 2>&1 | head -n 60
```

Classify per `BLOCKERS.md`:

| Signal | Blocker | Is permission? |
|---|---|---|
| `phase acquiring-prefix`, `Could not acquire Homebrew lock`, `8 concurrent brews` | **B1** lock contention | No — infra |
| `hdiutil attach did not mount`, `sparsebundle missing` | **B2** sparsebundle | No |
| `ENOSPC 117Mi`, `0B vm-install.log` | **B3** disk full | No |
| `bootsnap permission`, `cache owned by th-allbrew` | **B4** bootsnap | No |
| `sshAvailable=false`, `local-1 stopped`, `homeserver End of file` | **B5** endpoint down | No |
| `heavy numpy build`, `BIN_MISSING` on slow VM | **B6** heavy | No |
| `Gumroad PWYW`, `parking 302 godaddy`, HTML-gated DMG | **B7** vendor gate | No — correct `blocked` |
| Child reports `blocked_action: curl/bun/git worktree/brew … needs approval` + `vmHelperUsed:false` | **Permission gate** | **Yes** — allowlist missing |

If `vmHelperUsed:true` + `vm-install.log` exists (even `CLEANUP_OK` only) → **not** permission; it is B1–B7.

## 2. Nudge (Case J for permission, B1–B5 for infra)

At most **3 nudges** per `launchName`; after 3, terminal. Also enforce **~15min wall-clock cap** (`TH_BATCH_ITEM_WALL_MS=900000` from `launchedAt`) — see `references/nudge-and-blocked.md: Wall-clock hard cap`.

Send to the child's **run id** (opaque id from launch):

```text
NUDGE (<n>/3) for launchName=<…> agentName=<…> slug=<…>

You are stalled/blocked on <B1–B7 or approval blocked_action>.
1. Report blocked_action or last command (one line) and phase (0.5/generate/VM/fix/finalize).
2. For approval: abandon that exact command, use alternate non-interactive flag or finalize partial; include blocked_action so parent can widen policy.
3. For B1 lock: backoff 15s then retry once on a different endpoint (local-2 vs homeserver) — do not busy-loop.
4. For B2/B5 sparsebundle/endpoint: do not retry forever; finalize as blocked env_fail if local generate ok.
5. For B3 ENOSPC: capture df/hygiene and finalize blocked env_fail; parent will cleanup between waves.
Playbook <A–K>: J (approval) or I (disk/lock) or K (timeout thrash).
Reply with status then proceed or complete. Do not wait on user.
```

**Do not** nudge pure rate-limit `blocked` (API cooldown) unless the child is otherwise idle — let it cool.

## 3. Parent infra hygiene (between nudges / between waves)

Run **without stealing a live peer's lock** (only clear where holder PID is dead):

```bash
bun tests/monitored-install-batch/cleanup-post-run.mjs --host-only 2>&1 | tail -n 20
bun tests/monitored-install-batch/vm-guest-health.mjs --clear-stale --json 2>&1 | head -n 50
bun tests/monitored-install-batch/vm-guest-health.mjs --json 2>&1 | python3 -m json.tool | head -n 80  # confirm usable>0
git worktree list --porcelain 2>&1 | grep prunable || echo "no prunable"
df -h / 2>&1 | head -n 5
```

If `sparsebundle missing` (B2) on any endpoint, run once (not per child):

```bash
bun tests/monitored-install-batch/run-agent-batch.mjs --ensure-vms 2>&1 | tail -n 30
# or host: bun run vm:setup  (4CPU/4GB setup → 2CPU/3.5GB runtime per vm-pool.json)
sleep 15; bun tests/monitored-install-batch/vm-guest-health.mjs --json 2>&1 | head -n 40
```

If `ENOSPC` (B3), the VM helper already ran `brew cleanup --prune=all; brew autoremove; rm -rf /tmp/allbrew-*; hdiutil compact` when not mounted (`CLEANUP_OK`/`COMPACT_OK` in `vm-install.log.hygiene.txt`). On host also `brew cleanup --prune=all` + `rm -rf /tmp/allbrew-*` via `cleanup-post-run.mjs`.

## 4. Requeue vs finalize

| At ~15min or after 3 nudges | Mark as | When |
|---|---|---|
| **Legitimately still active** (RUN_DIR mtime <2–3min, live `vm-install-one` PID, child still advancing phases) | `skipped` (`skipReason: too_heavy` / `wall_clock_cap`) | Heavy but healthy — free slot, do not auto-requeue this wave |
| **Stalled / no progress** past 3-min window, approval hang after nudges, VM dead | `failed` or `failed-timeout` / `failed-agent-runtime` | No FS progress, thrashing same error |
| **Infra env_fail with local generate ok** (B2/B5, `local generate ok` in `vm-install.log`) | `blocked` (`failureClass: env_fail`, no `fix-package` needed) | Requeue after infra recovers |
| **Permission gate after 3 nudges** | `blocked` + note `blocked_action` | Widen policy via `child-agent-privileges.DRAFT.toml` allowlist, then requeue |

Commands:

```bash
bun tests/monitored-install-batch/run-agent-batch.mjs --mark-done <agentName|idx> <blocked|failed|skipped|failed-timeout>
# append agent-index.jsonl note: skipReason / failureClass / blocked_action when useful
```

Do **not** auto-requeue `skipped` in same wave. For permission gates, update the harness policy first (remove `curl/rm/ssh/bash` from `command_denylist` or copy `allowlist` from `child-agent-privileges.DRAFT.toml`), then requeue.

## 5. Prevent repeat blocks

- Keep concurrency ≤ VM endpoints (3: `homeserver` + `local-1` + `local-2`) — stagger waves so judgment/fix work overlaps installs without idle prefix.
- Ensure `warp-agent-permissions.template.toml` (or per-client templates in `templates/projects/` + `templates/agents/`) is applied with `execute_commands = always_allow` for batch policy and **without** `curl/rm/ssh/bash` on `command_denylist` — otherwise every child stalls at Phase 0.5 (see `BLOCKERS.md: How to distinguish permission vs infra`).
- Between waves, verify `git worktree list | grep prunable` empty and `vm-guest-health: usable>0` before refill.

Child self-help is `.agents/skills/monitored-install-batch-child/unblock-myself` — call it proactively when you see a child’s `vm-meta.json lastLogAt` stalled >3min.
