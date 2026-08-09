# Orchestrator loop (detail)

Harness-agnostic parent algorithm. Map "start children" / "message child" / "wait for events" to your product.

## Resume checklist

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
bun tests/monitored-install-batch/run-agent-batch.mjs --status
python3 - <<'PY'
import json
from pathlib import Path
q=json.loads(Path("tests/monitored-install-batch/state/agent-queue.json").read_text())
items=q["items"] if isinstance(q,dict) else q
for st in ("running","launching","queued","retry"):
    xs=[i for i in items if i.get("status")==st]
    print(st, len(xs))
    for i in xs[:8]:
        print(" ", i.get("idx"), i.get("agentName"), i.get("launchName"), i.get("agentId"), (i.get("url") or "")[:60])
PY
```

Cross-check RUN_DIRs:

```bash
ls -1dt tests/monitored-install-runs/* 2>/dev/null | head -15
```

## Building a multi-child launch without an export helper

1. `--print-wave` or take `pending[:freeSlots]`.
2. `launchTag` = UTC compact stamp, e.g. `20260806T161355Z`.
3. Per item:

```text
launchName = f"u{idx:04d}-{slug}-{launchTag}"[:64]
stableName = agentName  # url-00NN-slug
```

4. **base_prompt**: HARD ISOLATION + Cases A–K (prefer a known-good long `agent-wave.json` `basePrompt` if the script emits a short one).
5. **per-child prompt**:

```markdown
## CANONICAL ASSIGNMENT (do not substitute)
- agentName: url-00NN-slug
- launchName: u00NN-slug-TAG
- idx: N
- name: <display name>
- slug: <slug>
- url: <url>
- source column: <source>

## Steps
1. cd <REPO_ROOT_ABSOLUTE>
2. Read monitored-install SKILL.md; Phases 0→5 for THIS url only.
3. Init run record with slug `<slug>`.
4. Independent judgment BEFORE allbrew (real docs fetch).
5. Full install/verify/uninstall MUST use:
   LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install.log"
6. Local generate/debug only with temp tap + CI=1 ALLBREW_NONINTERACTIVE=1.
7. On failure: root-cause, disposable worktree, validate, export fix-package/ (option A). Do not release.
8. Finalize run record + append agent-index.jsonl.
9. Report structured completion (include launchName + agentName).

Start now.
```

6. Start N children via the harness multi-agent API:
   - shared base prompt
   - per-child prompt + unique launchName as the child name
   - same machine / shared filesystem as the repo (children call Lume themselves)

7. On launch ack: map `launchName → child run id`; `--mark-launched` stable agentNames; store run ids on the queue when possible.

## Free slot math

```text
free = CONCURRENCY - count(status in running, launching)
waveSize = min(free, count(pending))
```

Before launch (and on resume), **auto-skip** pending items whose URL matches `https://formulae.brew.sh/formula/*`:

```text
--mark-done … skipped   # skipReason: formulae_brew_sh_formula
```

Do not spend children or VM time on core formula pages; they are already in Homebrew. Cask pages are not auto-skipped by default.

Never start `waveSize=0`. Default CONCURRENCY is **6** with **3** exclusive Homebrew VM endpoints — installs serialize on `vm-install-one` mutexes; extra children judge/generate/fix so a free VM is claimed as soon as one drops.

## Completion fields (parent parser)

Expect:

- launchName, agentName, idx, url, slug
- status / failureClass
- RUN_DIR
- vmHelperUsed
- fixPackage path or null
- residual risk (short)

## One-turn parent order

1. Drain child messages.
2. Mark clear terminals.
3. Enforce **15-min wall clock** on every `running` item (`launchedAt` → now ≥ 15m):
   - still progressing (logs/process) → stop child, `--mark-done … skipped` (`too_heavy` / `wall_clock_cap`)
   - stalled → stop child, `--mark-done … failed` or `failed-timeout`
4. Nudge blocked/stale (cap 3) for items still under the wall budget.
5. If free slots: prepare wave → start children → mark-launched.
6. Short user status (counts + who is running).
7. Wait for the next child event (or end turn).

## Reconcile

```bash
bun run batch:reconcile-fixes -- --dry-run
bun run batch:reconcile-fixes -- --limit 5 --baseline HEAD
```

Docs-mode skips apply; patch-mode only inside `worktrees/`.

## Related skills

- **monitored-install** — single-URL child work
- **automate-vm-batch** — VM provision / locks / deterministic multi-worker (use when cold-starting infrastructure)
