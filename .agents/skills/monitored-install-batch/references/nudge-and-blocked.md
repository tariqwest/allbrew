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

1. Three nudges without completion
2. ~45 minutes wall clock since launch with no terminal outcome
3. Harness reports the child run is gone and no RUN_DIR finalize is in progress
