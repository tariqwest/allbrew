---
name: allbrew-monitored-install
description: Warp-equivalent monitored-install agent for Opencode — bun/node/git/lume/brew VM-only; denies rm/curl/sudo
mode: subagent
temperature: 0.2
tools:
  read: true
  write: true
  bash: true
  grep: true
  webfetch: true
permissions:
  bash:
    allow:
      - "bun*"
      - "node*"
      - "python3*"
      - "git*"
      - "bun tests/monitored-install-batch/*"
      - "node tests/monitored-install-batch/*"
      - "LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/*"
      - "bun run bin/allbrew.ts*"
      - "ls*"
      - "cat*"
      - "rg*"
      - "lume*"
      - "ssh*"
      - "brew*"
    deny:
      - "rm*"
      - "bash*"
      - "sh*"
      - "sudo*"
      - "curl*"
      - "wget*"
      - "scp*"
      - "rsync*"
skills:
  - allbrew-monitored-install
---

# allbrew-monitored-install (Opencode agent)

Place in `.opencode/agents/allbrew-monitored-install.md` (project) or `~/.config/opencode/agents/allbrew-monitored-install.md` (global). Opencode discovers agents via `opencode.json` `instructions` + `agents/*.md`.

Frontmatter `tools` + `permissions.bash.allow/deny` maps Warp `command_allowlist/denylist` — deny wins. `skills` array grants which skills this agent may activate (`*` for all, `!skill-name` to deny).

**Global vs project**: `~/.config/opencode/opencode.json` → `./opencode.json` → frontmatter (frontmatter wins per-agent). Run `opencode debug config` to inspect merged view.
