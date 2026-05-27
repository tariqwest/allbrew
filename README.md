# Allbrew (alpha)

Generate Homebrew formulas and casks from arbitrary URLs. Point it at a GitHub repo, a bash install script, a binary archive, a macOS app DMG, or a Mac App Store link and it produces the right `.rb` file for your tap.

## Todo
* Update usage to represent all cases, and give real and validated examples
* Verify and test instructions for all app types and install methods
* Account for formulas with background services using 'brew services' formula blocks
* Allow MAS app install by name, without full url
* Verify that uninstall works for all app types and install methods

## Install

### Homebrew

```bash
brew tap tariqwest/allbrew
brew install allbrew
```

### From source

```bash
git clone https://github.com/tariqwest/homebrew-allbrew.git
cd homebrew-allbrew
npm install
npm link
```

## Setup

On first run, allbrew will prompt you for a tap repository path. This is where generated `Formula/` and `Casks/` files are written. You can also set it upfront:

```bash
allbrew config set-tap ~/homebrew-mytap
```

View current configuration:

```bash
allbrew config show
```

Override the tap path for a single run:

```bash
allbrew --tap ~/other-tap https://github.com/BurntSushi/ripgrep
```

## Usage

```bash
# Interactive — prompts for a URL
allbrew

# Pass a URL directly
allbrew https://github.com/BurntSushi/ripgrep

# With options
allbrew https://github.com/sharkdp/bat --name bat --desc "A cat clone with wings"

# Manual mode — choose the formula type yourself
allbrew https://github.com/some/repo --manual

# Use a GitHub token to avoid rate limits
export GITHUB_TOKEN=ghp_...
allbrew https://github.com/some/private-repo
```

## Supported URL Types


| URL Type                             | What it generates                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| **GitHub repo (existing homebrew)**  | Existing homebrew instructions found, don't duplicate, run existing formula  | 
| **GitHub repo with binary releases** | Formula using `on_macos` + `on_arm`/`on_intel` blocks                        |
| **GitHub repo with .app releases**   | Cask with `livecheck`, `app`, and `zap` stanzas                              |
| **GitHub repo (npm package)**        | Formula with `depends_on "node"` and `std_npm_args`                          |
| **GitHub repo (pip package)**        | Formula with `Language::Python::Virtualenv` and transitive `resource` blocks |
| **GitHub repo (cargo package)**      | Formula with `depends_on "rust"` and `std_cargo_args`                        |
| **GitHub repo (go package)**         | Formula with `depends_on "go"` and `std_go_args`                             |
| **GitHub repo (build from source)**  | Formula with cmake/autotools/make/meson install block                        |
| **Bash install script**              | Formula that runs the script with `PREFIX` set to the Cellar                 |
| **Source code archive**              | Formula that extracts and builds using detected build system                 |
| **Pre-built binar archivey**         | Formula that extracts and does `bin.install`                                 |
| **DMG or ZIP with .app**             | Cask with `app` stanza                                                       |
| **Mac App Store URL**                | Cask using `mas` to install                                                  |

## Options


| Flag                  | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `-n, --name <name>`   | Override the auto-detected formula/cask name                            |
| `-d, --desc <text>`   | Override the description                                                |
| `-t, --token <token>` | GitHub personal access token (also reads `GITHUB_TOKEN` env var)        |
| `-m, --manual`        | Skip auto-detection; interactively choose URL type and install strategy |
| `-v, --verbose`       | Show full error stack traces                                            |
| `--tap <path>`        | Override the tap repository path for this run                           |


## Configuration

allbrew stores its config at `~/.config/allbrew/config.json`.


| Command                         | Description                         |
| ------------------------------- | ----------------------------------- |
| `allbrew config set-tap <path>` | Set the default tap repository path |
| `allbrew config get-tap`        | Print the current tap path          |
| `allbrew config show`           | Print the full configuration        |


## How It Works

1. **Classify** the URL (GitHub repo, script, archive, DMG, App Store)
2. **Analyze** the target (GitHub API for releases/README/files, HTTP HEAD for archives)
3. **Download** artifacts and compute SHA256 checksums
4. **Generate** the appropriate Ruby `.rb` formula or cask
5. **Write** it to `Formula/` or `Casks/` inside your configured tap repository

## Requirements

- Node.js 18+
- macOS (for cask and archive inspection features)

## License

MIT
