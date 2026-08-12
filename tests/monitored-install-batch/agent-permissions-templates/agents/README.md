# Custom agent capability templates — warp-equivalent (autonomous marathon)

Each file defines a **custom agent** whose **capabilities/permissions** mirror `warp-agent-permissions.template.toml` + `child-agent-privileges.DRAFT.toml` — **allow without approval** the full marathon set below; **deny** only destructive/priv-esc (deny wins).

**Allow (canonical — `child-agent-privileges.DRAFT.toml:allowlist`):**
- `LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs --url <url> ...` (VM-only, only success path), `bun tests/monitored-install-batch/*`, `bun .agents/skills/monitored-install/*`, `bun run bin/allbrew.ts` (with `CI=1 ALLBREW_NONINTERACTIVE=1`), `bun run check` / `bun test` / `bun run batch:reconcile-fixes`, `node`/`python3`
- `git worktree add/list/remove/prune`, `git -C ...`, `git status/diff/log/show/branch/checkout/switch/add/commit/fetch/pull/push` (only `agent/*` branches) + `rev-parse/ls-files/apply/remote/config/clone/reset/stash/restore`
- `brew info/list/update/outdated/search/leaves/deps/uses/cat/formula/cask/doctor/config/env --prefix` + `brew install/uninstall/reinstall/upgrade/tap/untap/services/cleanup/autoremove/trust` (HOMEBREW_ env allowed; guest-only install)
- `curl`/`wget` + `ssh`/`rsync`/`scp`/`lume` + `LUME_*` env (remote VM, docs judgment Phase 0.5)
- FS plumbing into `worktrees/`, `tests/monitored-install-runs/`, `state/`, `fix-packages/`, temp dirs: `mktemp/mkdir/ls/find/rg/grep/cat/head/tail/tee/cp/mv/chmod/touch/dirname/basename/pwd/which/env/printenv/date/stat/wc/sort/uniq/xargs/sed/awk/echo/printf/true/test`, `cd`

**Deny (canonical — `denylist`):** `sudo`/`su`, `rm -rf /` / `rm -rf ~` / `rm -rf $HOME`, `dd`/`mkfs`/`diskutil erase/partition`, `launchctl bootout system/`, `killall -9`, `bun run release`, `git push main` / `origin main` / `--force` — host `brew install` as success is policy-forbidden (prompt, not regex).

| File | Client | Global path | Project path | How capabilities declared |
|---|---|---|---|---|
| `claude-agent.template.md` | Claude Code | `~/.claude/agents/*.md` | `.claude/agents/*.md` | MD frontmatter `name`, `description`, `model`, `tools`, `permissionMode` |
| `codex-agent.template.toml` | Codex | `~/.codex/agents/*.toml` | `.codex/agents/*.toml` | TOML `[agent] name/model/instructions` + `[agent.permissions] allowed/denied_commands` + `[agent.sandbox]` + `[agent.approval]` |
| `opencode-agent.template.md` | Opencode | `~/.config/opencode/agents/*.md` | `.opencode/agents/*.md` | MD frontmatter `tools.*`, `permissions.bash.allow/deny` (glob), `skills` |
| `cursor-agent.template.json` | Cursor | `~/.cursor/agents/*.json` | `.cursor/agents/*.json` | JSON `permissions.allow/deny`, `tools`, `instructions` |
| `cline-agent.template.json` | Cline | — | `.clinerules` + `.vscode/settings.json` custom modes | JSON `groups`, `tools`, `permissions.allow/deny` |
| `kilo-agent.template.md` | Kilo | `~/.config/kilo/agents/*.md` | `.kilo/agents/*.md` | MD frontmatter `permissions.allow/deny` (glob), `tools`, `model` |
| `gemini-agent.template.json` | Gemini CLI | `~/.gemini/agents/*.json` | `.gemini/agents/*.json` | JSON `permissions.allow/deny`, `tools`, `sandbox` |
| `goose-agent.template.yaml` | Goose | `~/.config/goose/agents/*.yaml` | `.goose/agents/*.yaml` | YAML `permissions.allow/deny`, `tools`, `extensions` |

**Global vs project:** global agents available everywhere; project agents committed & shared. Both inherit parent `settings.json` `deny` — frontmatter can only **narrow** (deny more), never widen beyond global `deny`. For recurring non-permission blockers (VM infra, disk, lock contention) see `../BLOCKERS.md`.
