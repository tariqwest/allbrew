# Child contract

What every child agent must do for one queue URL.

## Isolation

1. **No host Homebrew success path** — do not use host `brew install`, host tap auto-install, or host `brew services` as the green path.
2. **VM helper required** for full install/verify/uninstall:

```bash
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install.log"
```

3. **Local generate/debug only** with a temp tap:

```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts "<url>" --name "<slug>" \
  --tap "$(mktemp -d)" --verbose
```

4. **Code fixes** only in a disposable git worktree; export `fix-package/` (Option A). No commit/push/release to main unless the parent explicitly asks.
5. **No `--service` / `--no-service`** — auto-detect only; mismatches are product bugs.
6. **Assignment integrity** — only the canonical url/slug from the parent prompt.

## Skill

Read and follow:

- `.agents/skills/monitored-allbrew-install/SKILL.md`
- `references/run-records.md`
- `references/failure-playbook.md`
- `references/release-and-retry.md` (**local validation only** in batch mode)

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
