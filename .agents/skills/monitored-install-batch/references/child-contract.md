# Child contract (batch-child, VM + patch artifacts)

What every batch-child agent must do for one queue URL. See `.agents/skills/monitored-install-batch-child/SKILL.md` for the full VM-isolated judge→try→fix→verify loop — this file is the concise parent-side view of the same contract.

## Isolation (host-clean, always VM)

1. **No host Homebrew success path** — do not use host `brew install`, host tap auto-install, or host `brew services` as the green path. Host `brew` is only for Lume/`vm-install-one.mjs` plumbing and temp-tap debug.
2. **VM helper required** — the **only** `VERIFY_OK` signal is from:

```bash
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install.log"
```

3. **Local generate/debug only** with a temp tap (no VM verdict):

```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts "<url>" --name "<slug>" \
  --tap "$(mktemp -d)" --verbose
```

4. **Code fixes only in a disposable git worktree** under `tests/monitored-install-batch/worktrees/<slug>-<ts>/`; export **patch artifacts** `fix-package/patches/*.patch` + `FIX.md` (Option A) under `$RUN_DIR/fix-package/` (mirrored to `fix-packages/<slug>/`). **Never** `git add/commit/push` to host `main`, **never** `bun run release` — parent reconciles via `batch:reconcile-fixes` inside `worktrees/` only.
5. **No `--service` / `--no-service`** — auto-detect only; mismatches are product bugs (`service_mismatch` → Phase 3).
6. **Assignment integrity** — only the canonical url/slug from the parent prompt. No URL substitution.

## Skill

Read and follow:

- `.agents/skills/monitored-install-batch-child/SKILL.md` (**batch-child**, VM-isolated, patch artifacts — this is the child skill)
- `.agents/skills/monitored-install/SKILL.md` (single-URL human loop — only for Phase shape / service expectation reference)
- `references/run-records.md`
- `references/failure-playbook.md`
- `references/release-and-retry.md` (**local validation only** in batch mode — no `release`)

## Reporting to parent

Report (via whatever messaging the harness provides):

| When | Include |
|------|---------|
| Start | launchName, agentName, url, slug |
| Blocker | blocked_action, phase, chosen bypass |
| Complete | status, failureClass, RUN_DIR, deltas, fix-package path or null, residual risk, **vmHelperUsed** |

### Completion shape (recommended)

```text
COMPLETION launchName=… agentName=… idx=…
URL: …
STATUS: success|failed|…
failureClass: …|null
RUN_DIR: tests/monitored-install-runs/…
vmHelperUsed: true|false
fixPackage: path|null
residualRisk: …
```

## fix-package (Option A)

On failure, prefer:

```text
$RUN_DIR/fix-package/
  FIX.md
  manifest.json          # if using reconcile CLI
  patches/*.patch
  validation.json
```

Mode `docs` = diagnosis only; `patch` = machine-applyable. Parent reconcile applies patches only inside batch `worktrees/`.

## Privileges (parent configures; child assumes)

Children assume the harness already grants unattended rights for the batch checklist in `assets/child-agent-privileges.DRAFT.toml` (bun/allbrew, git worktrees, Lume/ssh/rsync, fetch, brew-via-VM-helper). If a command is gated, do not wait on the user: take an alternate path, finalize partial, and report `blocked_action` so the parent can widen the policy.

## Out of scope for children

- Other queue URLs
- Host brew pollution
- Auto-release / push main
- Waiting on interactive user approval
- Creating/naming a specific harness agent profile (parent/user duty)
