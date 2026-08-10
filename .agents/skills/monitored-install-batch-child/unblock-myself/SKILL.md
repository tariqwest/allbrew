---
name: monitored-install-batch-child:unblock-myself
description: Self-unblock for a monitored-install batch child that detects it is blocked or stalled. Use when your own RUN_DIR shows no progress ~3min, vm-meta.json lastLogAt stalled, VM install hangs, or you hit an approval gate / infra error and need to recover without waiting for a parent nudge.
---

# Unblock myself (batch child)

You are a **batch child** running one URL via `.agents/skills/monitored-install-batch-child`. You have detected you are **blocked or stalled** (no `RUN_DIR` progress for ~3min, `vm-meta.json` `lastLogAt` >3min stale, `vm-install-one` hung on `acquiring-prefix`, `ENOSPC`, `bootsnap` permission, or hit an approval UI). Do not wait for the parent nudge — diagnose immediately and recover or finalize.

This is the **child-side** sub-skill. Parent-side recovery is `.agents/skills/monitored-install-batch/unblock-child`.

## 1. Diagnose — what blocked you?

Run these before any fix:

```bash
cat "$RUN_DIR/vm-meta.json" 2>&1 | python3 -m json.tool | tail -n 40
tail -n 80 "$RUN_DIR/vm-install.log" 2>&1 | tail -n 80
tail -n 40 "$RUN_DIR/vm-install.log.hygiene.txt" 2>&1 | tail -n 40
df -h / 2>&1 | head -n 10
git worktree list --porcelain 2>&1 | head -n 40
cat tests/monitored-install-batch/BLOCKERS.md 2>&1 | head -n 60
```

Classify using `BLOCKERS.md` (B1–B7):

| Your signal | Class | Blocker |
|---|---|---|
| `phase: acquiring-prefix`, `Could not acquire Homebrew lock`, `held by PID unknown` 8 concurrent | **Infra** | **B1** lock contention |
| `hdiutil attach did not mount`, `sparsebundle missing /Users/th-allbrew/...` | **Infra** | **B2** sparsebundle |
| `ENOSPC`, `0B vm-install.log`, `diskAvail: 117Mi` | **Infra** | **B3** disk full |
| `bootsnap permission`, `cache owned by th-allbrew` | **Infra** | **B4** bootsnap |
| `sshAvailable=false`, `vm stopped`, `End of file` on homeserver | **Infra** | **B5** endpoint down |
| `blocked` with Gumroad/store-gate, parking `302 godaddy`, `Sedo` HTML | **Vendor** | **B7** gate — correct `blocked` |
| Warp UI `Allow this command?` / `blocked_action: approval` | **Permission** | Gate — allowlist missing |

**Permission vs infra:** if Warp shows an approval prompt and `vmHelperUsed:false` + no `vm-install.log`, it is a permission gate (not B1–B7). Otherwise it is infra/vendor.

## 2. Self-help — run without asking

**If permission gate:**
1. Do **not** wait. Abandon that exact command, run the **alternate non-interactive path** or finalize partial.
2. Report `blocked_action: <one-line command that needs approval>` in your next message so the parent can widen the batch policy (`child-agent-privileges.DRAFT.toml`). Continue other phases or `finalize`.

**If B1 lock contention:**
```bash
# Backoff then retry once on a different endpoint
sleep 15
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install.log" --run-dir "$RUN_DIR" \
  --endpoint local-2  # or homeserver if local-1 was busy
```
Do not busy-loop. If second try also `acquiring-prefix` >3min, finalize as `blocked` with `fixPackage` if you have a patch, else `null`.

**If B2 sparsebundle missing / B5 endpoint stopped:**
- This is environment-wide — do **not** loop forever.
- If `local generate ok` (you already have a formula/cask in `$RUN_DIR/vm-install.log.formula.rb` or local `bun run bin/allbrew.ts --tap $(mktemp -d)` proved generation), **finalize as `blocked` env_fail** with `hostClean:true`, no patch needed — parent will requeue after `vm:setup`.
- Otherwise finalize `blocked` with diagnostics; parent will run `vm-guest-health --ensure-vms`.

**If B3 ENOSPC / B4 bootsnap:**
```bash
# hygiene is already in vm-install-one.mjs finally, but you can log host state
df -h / 2>&1 | head -n 10
brew cleanup --prune=all 2>&1 | tail -n 10  # host safe — only if host has brew
```
Finalize `blocked` `env_fail` with `diskAvail` from `vm-meta.json`; parent will run `cleanup-post-run.mjs --host-only` between waves.

**If B7 vendor gate (Gumroad, parking domain, HTML-gated DMG):**
- Do **not** try to bypass checkout. Finalize `blocked` (`generate_fail` → correct `blocked`) with `fixPackage` documenting `store gate / no direct .dmg` and `hostClean:true`. Keep `VERIFY_OK=false` — it is expected.

**If heavy build timeout (B6 pip `numpy`):**
- Export `fix-package/patches/*.patch` + `validation.json` marking `blocked_infra_slow_build`; do not spin. Parent can re-verify with `--allbrew-src "$WT"` when prefix free.

## 3. Finalize — always

Before you claim completion, run the child cleanup contract from the parent skill:

```bash
git worktree remove --force "$WT" 2>&1 || rm -rf "$WT"
git worktree prune 2>&1
brew cleanup --prune=all 2>&1 | tail -n 5  # host safe
```

Preserve `$RUN_DIR` + `fix-package/` for archiving; worktree is ephemera. Ensure `vm-meta.json` has `hygiene: CLEANUP_OK/DF_OK` and `hostClean:true`.

## 4. Report (status event)

Include in your completion / `blocked` event:

```
STATUS: blocked|failed|skipped
blockedReason: B1|B2|B3|B4|B5|B6|B7 or approval
blocked_action: <one line if approval>
RUN_DIR: ...
vmHelperUsed: true
endpointId: ...
poolWaitMs: ...
vmMeta: path
vmLog tail: last 10 lines
fixPackage: path or null
hostClean: true
```

Do not wait for a parent nudge if you have already diagnosed. If you report `blocked`, the parent will handle requeue / `vm-guest-health --clear-stale` per `.agents/skills/monitored-install-batch/unblock-child`.
