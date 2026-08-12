---
name: batch-ops
description: Search, manage, and batch-operate over current and archived monitored-install-batch items and their records/outputs. Use when the user asks to "find archived patch", "list batch items", "batch query", "restore archived run", "reconcile archived fix", "requeue batch item", "batch ops", "where is my fix-package", or wants to operate over the 200+ archived patches/runs without polluting `main`.
metadata:
  version: "1.0"
---

# Batch ops — current + archived batch search & management

Helper for the ~1K-item queue and its **archived** artifacts (`fix-packages/` 13M + `runs/` 94M → `~/.cache/allbrew/batch-artifacts/<date>/batch-<date>.tar.zst` 9.2M, manifest). `main` stays lean; this skill finds, restores, reconciles, and batch-operates over both live and archived records.

## Tool

`tests/monitored-install-batch/batch-ops.mjs` (Bun, no deps). Also exposed as `bun run batch:ops` (see `package.json`).

```bash
bun tests/monitored-install-batch/batch-ops.mjs --help
bun run batch:ops -- --list --status failed --search warp
```

## Quick start

```bash
# Search current queue (7 canonical statuses: pending/running/succeeded/failed/failed_system/skipped/blocked)
bun tests/monitored-install-batch/batch-ops.mjs --list --status failed --search warp
bun tests/monitored-install-batch/batch-ops.mjs --list --failure-class brew_fail --search cask
bun tests/monitored-install-batch/batch-ops.mjs --list --archived   # also shows cache tarballs + archived slugs sample

# Detail one item: queue row + runs + fix-package + vm-meta
bun tests/monitored-install-batch/batch-ops.mjs --show warp-agent-cli
bun tests/monitored-install-batch/batch-ops.mjs --show 0079

# Restore archived patch/runs back into repo (tar -xf from cache)
bun tests/monitored-install-batch/batch-ops.mjs --restore warp-agent-cli
bun tests/monitored-install-batch/batch-ops.mjs --restore warp-agent-cli --dest /tmp/restore

# Apply patch to a disposable worktree
bun tests/monitored-install-batch/batch-ops.mjs --reconcile warp-agent-cli --dry-run
bun tests/monitored-install-batch/batch-ops.mjs --reconcile warp-agent-cli   # local or cached path auto-detected

# Queue management (delegates to run-agent-batch.mjs)
bun tests/monitored-install-batch/batch-ops.mjs --requeue warp-agent-cli --to pending
bun tests/monitored-install-batch/batch-ops.mjs --mark-done warp-agent-cli failed

# Archive overview
bun tests/monitored-install-batch/batch-ops.mjs --archive-status
cat tests/monitored-install-batch/archive/manifest.json | python3 -m json.tool
```

## Sources (read-only unless you pass --restore/--reconcile/--requeue/--mark-done)

| Source | Path | What |
|--------|------|------|
| Current queue | `tests/monitored-install-batch/state/agent-queue.json` (canonical `pending/running/succeeded/failed/failed_system/skipped/blocked`, `legacyStatus` preserved) | 763 items |
| Fix index | `tests/monitored-install-batch/state/fix-index.jsonl` | Reconcile-ready |
| Archived blobs | `~/.cache/allbrew/batch-artifacts/<date>/batch-<date>.tar.zst` (e.g. 2026-08-10 → 9.2M, 23k entries, sha256, gitSha) | 213 fix-packages + 1501 runs + 1516 logs |
| Manifest (tracked) | `tests/monitored-install-batch/archive/manifest.json` | `tarball`, `sha256`, `size`, `counts`, `gitSha` |
| Run records | `tests/monitored-install-runs/<runId>/` (current) or inside tarball | `agent-judgment.json`, `outcome.json`, `vm-install.log`, `vm-meta.json` |

## Finding archived patches

```bash
# List archived slugs
tar tf ~/.cache/allbrew/batch-artifacts/2026-08-10/batch-2026-08-10.tar.zst | grep "fix-packages/" | cut -d/ -f3 | sort -u | head
# Or via helper
bun tests/monitored-install-batch/batch-ops.mjs --list --archived | head -n 40

# Inspect before restoring
tar tf ~/.cache/allbrew/batch-artifacts/2026-08-10/batch-2026-08-10.tar.zst | grep "warp-agent-cli" | head
```

## Restoring & applying

```bash
# Restore one slug (extracts fix-package + runs for that slug)
bun tests/monitored-install-batch/batch-ops.mjs --restore <slug>
ls tests/monitored-install-batch/fix-packages/<slug>/patches/  # now local

# Or raw tar
tar -xf ~/.cache/allbrew/batch-artifacts/2026-08-10/batch-2026-08-10.tar.zst -C ~/Developer/allbrew -- "tests/monitored-install-batch/fix-packages/<slug>"

# Apply to a disposable worktree (never on main)
bun run batch:reconcile-fixes -- --dry-run --path tests/monitored-install-batch/fix-packages/<slug>
bun run batch:reconcile-fixes -- --path ~/.cache/allbrew/batch-artifacts/2026-08-10/fix-packages/<slug> --json
```

## Batch operations (examples)

```bash
# Requeue all failed_system that were warp-related
for slug in $(bun tests/monitored-install-batch/batch-ops.mjs --list --status failed_system --search warp | awk '{print $2}'); do
  bun tests/monitored-install-batch/batch-ops.mjs --requeue $slug
done

# Mark a slug blocked after rate-limit
bun tests/monitored-install-batch/batch-ops.mjs --mark-done <slug> blocked

# Archive next wave
bun scripts/archive-batch-artifacts.mjs --dry-run
bun scripts/archive-batch-artifacts.mjs --verify --prune-move
```

## Progressive disclosure

| Need | Read |
|------|------|
| Parent/child VM isolation | `.agents/skills/monitored-install-batch/SKILL.md` + `monitored-install-batch-child` |
| Queue statuses | `run-agent-batch.mjs --status` (canonical 7: pending/running/succeeded/failed/failed_system/skipped/blocked) |
| Archiving | `scripts/archive-batch-artifacts.mjs`, `tests/monitored-install-batch/archive/manifest.json` |
| VM health | `tests/monitored-install-batch/vm-guest-health.mjs`, `vm-pool.json` |

## Anti-patterns

* `git add fix-packages/` on `main` — archived, use manifest + `tar tf` instead.
* Restoring the whole tarball to `main` for one fix — use `--restore <slug>` or `tar -xf ... -- fix-packages/<slug>`.
* Reconciling on `main` — always in `tests/monitored-install-batch/worktrees/`.
