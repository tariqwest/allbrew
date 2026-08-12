---
name: allbrew-monitored-install
description: Warp-equivalent monitored-install for Kilo — full marathon allowlist (bun/lume-ssh/git worktrees/brew-VM + curl + FS plumbing); denies only destructive/priv-esc
mode: agent
model: claude-sonnet-4
permissions:
  allow:
    - "LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/*"
    - "bun tests/monitored-install-batch/*"
    - "bun .agents/skills/monitored-install/*"
    - "bun run bin/allbrew.ts*"
    - "CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts*"
    - "bun run check*"
    - "bun test*"
    - "git worktree*"
    - "git -C*"
    - "git status*"
    - "git diff*"
    - "git push -u origin agent/*"
    - "brew info*"
    - "brew install*"
    - "brew services*"
    - "curl*"
    - "wget*"
    - "ssh*"
    - "rsync*"
    - "scp*"
    - "lume*"
    - "mktemp*"
    - "mkdir*"
    - "ls*"
    - "rg*"
    - "cat*"
    - "tee*"
    - "cp*"
    - "chmod*"
    - "pwd*"
    - "echo*"
  deny:
    - "sudo*"
    - "su*"
    - "rm -rf /*"
    - "rm -rf ~*"
    - "dd*"
    - "mkfs*"
    - "diskutil erase*"
    - "bun run release*"
    - "git push *main*"
    - "git push --force*"
tools:
  - read
  - write
  - bash
  - grep
  - webfetch
---

# allbrew-monitored-install (Kilo agent)

Place in `.kilo/agents/allbrew-monitored-install.md` (project) or `~/.config/kilo/agents/allbrew-monitored-install.md` (global). `kilo.jsonc` lists agent paths; `.roo/agents/` → `.kilo/agents/` migration. Permissions glob + tools both enforced (deny wins).
