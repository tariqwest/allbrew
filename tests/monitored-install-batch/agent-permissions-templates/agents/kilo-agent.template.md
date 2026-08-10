---
name: allbrew-monitored-install
description: Warp-equivalent monitored-install agent for Kilo — bun/node/git/lume/brew VM-only; denies rm/curl/sudo
mode: agent
model: claude-sonnet-4
permissions:
  allow:
    - "bun*"
    - "node*"
    - "python3*"
    - "git*"
    - "bun tests/monitored-install-batch/*"
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
tools:
  - read
  - write
  - bash
  - grep
  - webfetch
---

# allbrew-monitored-install (Kilo agent)

Place in `.kilo/agents/allbrew-monitored-install.md` (project) or `~/.config/kilo/agents/allbrew-monitored-install.md` (global). Kilo discovers via `kilo.jsonc` (`agents` paths) + `.kilo/agents/*.md`. Migrated from Roo `.roo/agents/` → `.kilo/agents/` (see `kilo config check`).

Frontmatter `permissions.allow/deny` (glob) maps Warp `command_allowlist/denylist` — deny wins. `tools` restricts which tool groups this agent may call.
