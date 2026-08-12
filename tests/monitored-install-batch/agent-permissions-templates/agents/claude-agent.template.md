---
name: allbrew-monitored-install
description: Warp-equivalent monitored-install agent for Claude Code — autonomous marathon: bun/node/python3/git worktrees/lume-ssh/brew-VM + read/write + network fetch; denies only destructive/privilege-escalation.
model: claude-sonnet-4-20250514
tools: Read, Glob, Grep, Bash, WebFetch, Task
permissionMode: acceptEdits
---

# allbrew-monitored-install (Claude subagent)

Place in `.claude/agents/allbrew-monitored-install.md` (project) or `~/.claude/agents/allbrew-monitored-install.md` (global). Discovered by `/agents`. Inherits parent `permissions` but can narrow via frontmatter `tools`.

This mirrors `warp-agent-permissions.template.toml` + `child-agent-privileges.DRAFT.toml` — **allow without approval** the full marathon set below; **deny** only destructive/privilege escalation (deny always wins).

## Allowed — auto-approve (map to `permissions.allow` in `settings.json`)

- **Bun / batch helpers (VM-only is success path):**
  `Bash(bun:*)`, `Bash(LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/*)`, `Bash(bun tests/monitored-install-batch/*)`, `Bash(bun .agents/skills/monitored-install/*)`, `Bash(bun run bin/allbrew.ts:*)`, `Bash(CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts:*)`, `Bash(bun run check)`, `Bash(bun test:*)`, `Bash(bun run batch:reconcile-fixes:*)`, `Bash(node:*)`, `Bash(python3:*)`
- **Git / worktrees (Option A):**
  `Bash(git worktree:*)`, `Bash(git -C:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git show:*)`, `Bash(git branch:*)`, `Bash(git checkout:*)`, `Bash(git add:*)`, `Bash(git commit:*)`, `Bash(git fetch:*)`, `Bash(git pull:*)`, `Bash(git push:*)` (only `agent/*` branches — `main`/`--force` denied below), `Bash(git apply:*)`, `Bash(git rev-parse:*)`
- **Lume + remote VM transport:**
  `Bash(lume:*)`, `Bash(ssh:*)`, `Bash(rsync:*)`, `Bash(scp:*)`
- **Network read (judgment Phase 0.5):**
  `Bash(curl:*)`, `Bash(wget:*)`, `WebFetch`
- **Brew (read + VM helper / temp-tap debug):**
  `Bash(brew info:*)`, `Bash(brew list:*)`, `Bash(brew update:*)`, `Bash(brew install:*)`, `Bash(brew uninstall:*)`, `Bash(brew services:*)`, `Bash(brew cleanup:*)` (+ `doctor/config/env` etc.)
- **FS plumbing & writes (`worktrees/`, `tests/monitored-install-runs/`, `state/`, `fix-packages/`, temp dirs):**
  `Bash(mktemp:*)`, `Bash(mkdir:*)`, `Bash(ls:*)`, `Bash(find:*)`, `Bash(rg:*)`, `Bash(grep:*)`, `Bash(cat:*)`, `Bash(head:*)`, `Bash(tail:*)`, `Bash(tee:*)`, `Bash(cp:*)`, `Bash(mv:*)`, `Bash(chmod:*)`, `Bash(touch:*)`, `Read`, `Glob`, `Grep`
- **Other:** `Bash(echo:*)`, `Bash(pwd:*)`, `Bash(which:*)`, `Bash(env:*)`, `Bash(date:*)`, `Bash(stat:*)`, `Bash(wc:*)`

## Denied — always block (even if allowed above)

- `Bash(sudo:*)`, `Bash(su:*)`, destructive `rm -rf /` / `rm -rf ~` / `rm -rf $HOME`, `Bash(dd:*)`, `Bash(mkfs:*)`, `Bash(diskutil erase:*)`, `Bash(bun run release:*)`, `Bash(git push *main)`, `Bash(git push --force:*)`, host `brew install` of catalog app as success path

## How it runs

Delegate via `/agents` or `Task` with `subagent_type: "allbrew-monitored-install"`. Subagent has isolated window; main receives summary. Global agents (`~/.claude/agents/*.md`) available everywhere; project agents (`.claude/agents/*.md`) committed & shared; both merged with `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json` (project local last, all `deny` honored, `allow` after trust dialog).

## Notes

This fixes prior stalls on `LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs`, `bun run bin/allbrew.ts`, `git worktree add`, `bun test`, `curl` for docs — all must be auto-allowed for autonomous marathon (see `child-agent-privileges.DRAFT.toml`).
