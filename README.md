# allbrew

Generate Homebrew formulas and casks from arbitrary URLs. Point it at a GitHub repo, a bash install script, a binary archive, a macOS app DMG, or a Mac App Store link and it produces the right `.rb` file for your tap.

## Requirements

- Node.js 18+
- macOS (for cask and archive inspection features)

## Install

```bash
git clone https://github.com/tariqwest/homebrew-allbrew.git
cd homebrew-allbrew
npm install
```

## Usage

```bash
# Interactive — prompts for a URL
node bin/allbrew.js

# Pass a URL directly
node bin/allbrew.js https://github.com/BurntSushi/ripgrep

# With options
node bin/allbrew.js https://github.com/sharkdp/bat --name bat --desc "A cat clone with wings"

# Use a GitHub token to avoid rate limits
export GITHUB_TOKEN=ghp_...
node bin/allbrew.js https://github.com/some/private-repo
```

Or link it globally:

```bash
npm link
allbrew https://github.com/BurntSushi/ripgrep
```

## Supported URL Types

| URL Type | What it generates |
|----------|-------------------|
| **GitHub repo with binary releases** | Formula using `on_macos`/`on_linux` + `on_arm`/`on_intel` blocks |
| **GitHub repo with .app releases** | Cask with `livecheck`, `app`, and `zap` stanzas |
| **GitHub repo (npm package)** | Formula with `depends_on "node"` and `std_npm_args` |
| **GitHub repo (pip package)** | Formula with `Language::Python::Virtualenv` and transitive `resource` blocks |
| **GitHub repo (cargo package)** | Formula with `depends_on "rust"` and `std_cargo_args` |
| **GitHub repo (build from source)** | Formula with cmake/autotools/make/meson install block |
| **Bash install script** | Formula that runs the script with `PREFIX` set to the Cellar |
| **Source code archive** | Formula that extracts and builds using detected build system |
| **Archive with pre-built binary** | Formula that extracts and does `bin.install` |
| **DMG or ZIP with .app** | Cask with `app` stanza |
| **Mac App Store URL** | Cask using `mas` to install |

### GitHub Repos — Homebrew Detection

If the repo's README already mentions `brew install`, allbrew alerts you and offers to run that command directly instead of generating a duplicate formula.

## Options

| Flag | Description |
|------|-------------|
| `-n, --name <name>` | Override the auto-detected formula/cask name |
| `-d, --desc <text>` | Override the description |
| `-t, --token <token>` | GitHub personal access token (also reads `GITHUB_TOKEN` env var) |
| `-v, --verbose` | Show full error stack traces |

## Output

Generated formulas are written to `Formula/` and casks to `Casks/`. To use them as a Homebrew tap:

```bash
brew tap tariqwest/allbrew
brew install <formula-name>
brew install --cask <cask-name>
```

## How It Works

1. **Classify** the URL (GitHub repo, script, archive, DMG, App Store)
2. **Analyze** the target (GitHub API for releases/README/files, HTTP HEAD for archives)
3. **Download** artifacts and compute SHA256 checksums
4. **Generate** the appropriate Ruby `.rb` formula or cask
5. **Write** it to `Formula/` or `Casks/`

## License

MIT
