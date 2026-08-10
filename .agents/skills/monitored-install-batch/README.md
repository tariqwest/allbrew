# monitored-install-batch

Parent/orchestrator skill for exhausting the allbrew **monitored-install** URL queue with parallel **child agents**.

- **This skill** = parent: queue state, wave launch, monitor, nudge, mark-done, fix-package post-process  
- **[monitored-install](../monitored-install/)** = child: one URL, Phases 0→7, RUN_DIR records  

Harness-agnostic: any parent that can run shell, start N children, message them by run id, and receive completion/blocker events can follow `SKILL.md`.

## When to use

- “Continue / proceed the batch”, “exhaust `agent-queue.json`”, “spin up install children”
- Resume mid-marathon from `tests/monitored-install-batch/state/`
- Nudge stalled children or finalize completions without releasing to `main`

## Layout

```
monitored-install-batch/
  SKILL.md                 # parent playbook (start here)
  README.md                # this file
  references/
    orchestrator-loop.md   # wave math, prompts, one-turn order
    state-and-queue.md     # queue / wave / index / RUN_DIR schemas
    nudge-and-blocked.md   # 3-min / 3-nudge / 15-min wall / skipped-vs-failed
    child-contract.md      # what each child must do
  assets/
    child-agent-privileges.DRAFT.toml  # required child privileges + sample patterns
  evals/
    evals.json             # sample parent prompts for skill evals
```

Related on-disk harness (often gitignored):

```
tests/monitored-install-batch/
  state/agent-queue.json
  state/agent-wave.json
  state/agent-index.jsonl
  run-agent-batch.mjs      # --status, --print-wave, --mark-launched, --mark-done
  vm-install-one.mjs       # required VM install path for children
  README.md                # deterministic workers + VM pool + fix reconcile
```

Canonical per-URL records: `tests/monitored-install-runs/<runId>/`.

## Quick start (parent)

```bash
cd /path/to/allbrew   # repo root

bun tests/monitored-install-batch/run-agent-batch.mjs --status

# prepare next wave (writes state/agent-wave.json)
bun tests/monitored-install-batch/run-agent-batch.mjs --print-wave

# after children start (use stable agentName or idx):
bun tests/monitored-install-batch/run-agent-batch.mjs --mark-launched url-00NN-slug …

# after completion / outcome.json:
bun tests/monitored-install-batch/run-agent-batch.mjs --mark-done url-00NN-slug failed   # or success, …
```

Then start children with unique **launchName**s, shared base prompt (isolation + playbook A–K), and per-URL canonical assignment prompts — see `references/orchestrator-loop.md`.

## Contract (short)

| Rule | Detail |
|------|--------|
| Concurrency | `TH_BATCH_CONCURRENCY` (default **6**); 3 exclusive VM installs max, extra agents judge/fix in parallel |
| Installs | Only via `LUME_REMOTE_ENABLED=true …/vm-install-one.mjs` |
| Host brew | Never the success path |
| Fixes | Option A `fix-package/` in disposable worktrees; no auto-release |
| Stale | ~3 min no RUN_DIR progress → nudge (max 3) → mark failed |
| Wall clock | **~15 min** per item: if still legitimately active → `skipped` (too heavy); if stalled → `failed` / `failed-timeout` |
| Names | `agentName` for queue CLI; unique `launchName` per wave for child runs |

## Deterministic vs agent path

| Path | Entry | Use when |
|------|--------|----------|
| Deterministic workers | `run-batch.mjs` / `run-orchestrator.mjs` | Heuristic batch, no LLM children |
| Agent marathon | this skill + multi-child launch | Real judgment, fixes, human-in-the-loop parent |

Both share VM isolation and `tests/monitored-install-runs/` records. Prefer this skill whenever a **parent agent** owns the queue.

## Fix packages

Children write `$RUN_DIR/fix-package/`. Parent reconcile (host only, worktrees under batch `worktrees/`):

```bash
bun run batch:reconcile-fixes -- --dry-run
bun run batch:reconcile-fixes -- --path tests/monitored-install-runs/<id> --json
```

See harness `tests/monitored-install-batch/README.md` for manifest schema and promote policy.

## Child agent privileges

Children need unattended shell rights for bun/allbrew, git worktrees, Lume/ssh/rsync, network fetch, and brew-via-VM-helper — not a hard-coded profile name. The parent should create or select a harness policy with those privileges, or prompt the user to. Checklist + optional allow/deny regex samples: `assets/child-agent-privileges.DRAFT.toml`.

## Evals

Sample parent prompts: `evals/evals.json`.

## See also

- [SKILL.md](./SKILL.md) — full orchestrator instructions  
- [monitored-install](../monitored-install/SKILL.md) — single-URL child skill  
- [tests/monitored-install-batch/README.md](../../../tests/monitored-install-batch/README.md) — VM pool, workers, reconcile CLI  
- [AGENTS.md](../../../AGENTS.md) — project batching rule  
