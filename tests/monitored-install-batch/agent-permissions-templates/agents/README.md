# Custom agent capability templates — warp-equivalent

Each file defines a **custom agent** (subagent/custom mode) whose **capabilities/permissions** mirror `warp-agent-permissions.template.toml` — allow `bun`/`node`/`python3`/`git`/`lume`/`ssh`/`brew` (VM-only via `vm-install-one.mjs`) + read-only tools; deny `rm`/`curl`/`wget`/`scp`/`rsync`/shells/`sudo` (deny wins).

| File | Client | Global path | Project path | How capabilities are declared |
|---|---|---|---|---|
| `claude-agent.template.md` | Claude Code | `~/.claude/agents/*.md` | `.claude/agents/*.md` | Markdown frontmatter `name`, `description`, `model`, `tools`, `permissionMode`; tools list maps to `permissions.allow` in `settings.json` |
| `codex-agent.template.toml` | Codex | `~/.codex/agents/*.toml` | `.codex/agents/*.toml` or `agents/*.toml` | TOML `[agent] name/description/model/instructions` + `[agent.permissions] allowed/denied_commands` + `[agent.sandbox]` + `[agent.approval]` |
| `opencode-agent.template.md` | Opencode | `~/.config/opencode/agents/*.md` | `.opencode/agents/*.md` | Markdown frontmatter `tools.*`, `permissions.bash.allow/deny`, `skills` array (skill grants), `mode`, `temperature` |
| `cursor-agent.template.json` | Cursor | `~/.cursor/agents/*.json` | `.cursor/agents/*.json` | JSON `permissions.allow/deny`, `tools`, `instructions` |
| `cline-agent.template.json` | Cline | — (global not used) | `.clinerules` + `.vscode/settings.json` custom modes | JSON `groups`, `tools`, `permissions.allow/deny` (Cline custom mode / Kilo-compatible) |
| `kilo-agent.template.md` | Kilo | `~/.config/kilo/agents/*.md` | `.kilo/agents/*.md` | Markdown frontmatter `permissions.allow/deny` (glob), `tools`, `model` |
| `gemini-agent.template.json` | Gemini CLI | `~/.gemini/agents/*.json` | `.gemini/agents/*.json` | JSON `permissions.allow/deny`, `tools`, `sandbox`, `approvalMode` |
| `goose-agent.template.yaml` | Goose | `~/.config/goose/agents/*.yaml` | `.goose/agents/*.yaml` | YAML `permissions.allow/deny`, `tools`, `extensions` |

**Global vs project**: global agents available in every project; project agents committed and shared. Both respect parent `settings.json` denylist — agent frontmatter can only **narrow** (deny more), never widen beyond global `deny`.

Copy to your client's agents directory and adjust `model` as needed.
