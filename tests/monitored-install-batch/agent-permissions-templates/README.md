# Agent permissions templates — warp-equivalent

Generated from `tests/monitored-install-batch/warp-agent-permissions.template.toml`
(allow `bun`, `node`, `python3`, `git`, `lume`/`ssh`, `brew` (VM-only), read-only tools; deny `rm`, `curl`/`wget`, `scp`/`rsync`, shells, `sudo` — denylist always wins).

Each client exposes **global** (user) and **project** (repo) layers. Templates are drop-in fragments — copy to the path shown, merge with your existing file, restart the agent.

| Client | Global file | Project file | Format | Source |
|---|---|---|---|---|
| **War**`p` | `~/.warp/settings.toml` | *(no project layer — global only; `~/.dotfiles/warp/.warp/settings.toml` often symlinked)* | TOML | `warp-agent-permissions.template.{toml,json,yaml,yml}` |
| **Claude Code** | `~/.claude/settings.json` | `.claude/settings.json` (committed) + `.claude/settings.local.json` (gitignored) | JSON | `claude.template.json` + `claude.project.template.json` |
| **Codex** | `~/.codex/config.toml` | `.codex/config.toml` (or `./codex.toml` per repo) | TOML | `codex.template.toml` |
| **Cursor** | `~/.cursor/settings.json` or `~/.config/cursor/settings.json` | `.cursor/settings.json` + `.cursor/rules/` | JSON | `cursor.template.json` |
| **Opencode** | `~/.config/opencode/opencode.json` (or `.jsonc`) | `./opencode.json` | JSONC/JSON | `opencode.template.json` |
| **Cline / Roo / Kilo** | VS Code `~/Library/Application Support/Code/User/settings.json` (`cline.*`, `roo.*`) + `~/.config/opencode` etc. | `.vscode/settings.json` (Cline auto-approve) + `.roo/config.json` / `.kilocode/config.json` | JSON | `cline-vscode.template.json`, `kilo.template.json` |
| **Gemini CLI** | `~/.gemini/settings.json` | `.gemini/settings.json` | JSON | `gemini.template.json` |
| **Goose** | `~/.config/goose/config.yaml` | `./.goose.yaml` or project `goose.yaml` | YAML | `goose.template.yaml` |

**Global vs project precedence** — later wins but `deny` always wins over `allow`:
- Claude: `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json` (project local last; all layers' `deny` honored)
- Codex: `/etc/codex/requirements.toml` → `~/.codex/config.toml` → `.codex/config.toml` → CLI flags
- Opencode: `~/.config/opencode/opencode.json` → `./opencode.json` → `OPENCODE_CONFIG` (last overrides per-key; `opencode debug config` to inspect)
- Gemini: `~/.gemini/settings.json` → `.gemini/settings.json` (nearest up-tree merges, project overrides global)
- Goose/Cline: XDG global → project file → env vars

**How to use**
```bash
# example: install Claude global template (review first)
mkdir -p ~/.claude
cp tests/monitored-install-batch/agent-permissions-templates/claude.template.json ~/.claude/settings.json

# Codex global
mkdir -p ~/.codex
cp tests/monitored-install-batch/agent-permissions-templates/codex.template.toml ~/.codex/config.toml

# Opencode project
cp tests/monitored-install-batch/agent-permissions-templates/opencode.template.json ./opencode.json
```

All templates encode the same marathon policy as the Warp original; only the shape (keys, pattern syntax) differs per CLI.
