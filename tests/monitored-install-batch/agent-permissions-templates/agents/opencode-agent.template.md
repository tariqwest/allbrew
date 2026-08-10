---
name: allbrew-monitored-install
description: Warp-equivalent monitored-install for Opencode — full marathon allowlist (bun/node/python3/git worktrees/lume-ssh/brew-VM + curl + FS plumbing); denies only destructive/priv-esc
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
      - "LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/*"
      - "bun tests/monitored-install-batch/*"
      - "bun .agents/skills/monitored-install/*"
      - "bun run bin/allbrew.ts*"
      - "CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts*"
      - "bun run check*"
      - "bun test*"
      - "bun run batch:reconcile-fixes*"
      - "bun*"
      - "node*"
      - "python3*"
      - "git worktree*"
      - "git -C*"
      - "git status*"
      - "git diff*"
      - "git log*"
      - "git show*"
      - "git branch*"
      - "git checkout*"
      - "git add*"
      - "git commit*"
      - "git fetch*"
      - "git pull*"
      - "git push -u origin agent/*"
      - "git rev-parse*"
      - "git apply*"
      - "brew info*"
      - "brew list*"
      - "brew install*"
      - "brew uninstall*"
      - "brew services*"
      - "brew cleanup*"
      - "curl*"
      - "wget*"
      - "ssh*"
      - "rsync*"
      - "scp*"
      - "lume*"
      - "mktemp*"
      - "mkdir*"
      - "ls*"
      - "find*"
      - "rg*"
      - "grep*"
      - "cat*"
      - "head*"
      - "tail*"
      - "tee*"
      - "cp*"
      - "mv*"
      - "chmod*"
      - "touch*"
      - "pwd*"
      - "which*"
      - "echo*"
      - "date*"
      - "stat*"
      - "wc*"
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
skills:
  - allbrew-monitored-install
---

# allbrew-monitored-install (Opencode agent)

Place in `.opencode/agents/allbrew-monitored-install.md` (project) or `~/.config/opencode/agents/allbrew-monitored-install.md` (global). Frontmatter `permissions.bash.allow/deny` maps Warp + `child-agent-privileges.DRAFT.toml` — deny wins. `skills` grants which skills this agent may activate (`*` or `!deny`). `~/.config/opencode/opencode.json` → `./opencode.json` → frontmatter (wins per-agent). `opencode debug config` to inspect.
