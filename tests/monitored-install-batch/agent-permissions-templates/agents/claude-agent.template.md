---
name: allbrew-monitored-install
description: Warp-equivalent monitored-install agent for Claude Code — auto-runs bun/node/git/lume/ssh/brew (VM-only) + read-only tools; denies rm/curl/scp/shells/sudo. Use for `bun tests/monitored-install-batch/vm-install-one.mjs` cycles.
model: claude-sonnet-4-20250514
tools: Read, Glob, Grep, Bash, WebFetch, Task
permissionMode: acceptEdits
---

# allbrew-monitored-install (Claude subagent)

Custom subagent definition — place in `.claude/agents/allbrew-monitored-install.md` (project) or `~/.claude/agents/allbrew-monitored-install.md` (global, shared across projects). Discovered by `/agents` command.

This mirrors `warp-agent-permissions.template.toml` — allow `bun`/`node`/`python3`/`git`/`lume`/`ssh`/`brew` (VM-only) + read-only tools; deny `rm`/`curl`/`wget`/`scp`/`rsync`/shells/`sudo` (deny wins). Subagent inherits parent `permissions` but can narrow further via frontmatter `tools` and `permissionMode`.

## Capabilities

- **Allowed commands** (auto-approve via `permissions.allow` in `.claude/settings.json`):
  - `Bash(bun:*)`, `Bash(node:*)`, `Bash(python3:*)`, `Bash(git:*)`, `Bash(lume:*)`, `Bash(ssh:*)`, `Bash(brew:*)`, `Bash(bun tests/monitored-install-batch/*)`, `Bash(bun run bin/allbrew.ts:*)`
  - `Read`, `Glob`, `Grep`, `WebFetch`
- **Denied** (always block):
  - `Bash(rm:*)`, `Bash(sudo:*)`, `Bash(curl:*)`, `Bash(wget:*)`, `Bash(scp:*)`, `Bash(rsync:*)`, `Bash(bash)`, `Bash(sh:*)`, `Bash(zsh:*)`
- **Model**: `claude-sonnet-4-20250514` (override per task with frontmatter `model`)
- **Hooks**: optional `PreToolUse` to decompose `Bash` and check sub-commands (deny first)

## How it runs

Claude delegates to this subagent automatically when task matches `description`, or via explicit `Task` tool with `subagent_type: "allbrew-monitored-install"`. Subagent has isolated context window; main agent receives summarized result.

## Project vs global

- **Project**: `.claude/agents/*.md` committed, shared with team; permissions from `.claude/settings.json` apply
- **Global**: `~/.claude/agents/*.md` available in every project; merges with `~/.claude/settings.json`
