# Allbrew (alpha)

Make Homebrew the source of truth for all your macOS installs, regardless of whether the app is available on Homebrew. Generate Homebrew formulas and casks from arbitrary URLs. Point it at a GitHub repo, a bash install script, a binary archive, a macOS app DMG, or a Mac App Store link and it produces the right `.rb` file for your tap.

## Todo

- Update usage to represent all cases, and give real and validated examples
- Verify and test instructions for all app types and install methods
- Account for formulas with background services using `brew services` formula blocks
- Allow MAS app install by name, without full URL
- Verify that uninstall works for all app types and install methods

## Install

### Homebrew

```bash
brew tap tariqwest/allbrew
brew install allbrew
```

### Bun (global)

```bash
bun install -g allbrew
```

### From source

```bash
git clone https://github.com/tariqwest/allbrew.git
cd allbrew
bun install
bun link
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

# Generate a formula that can be managed by brew services
allbrew https://github.com/example/daemon --service --service-command "daemon --foreground"

# Manual mode — choose the formula type yourself
allbrew https://github.com/some/repo --manual

# Use a GitHub token to avoid rate limits
export GITHUB_TOKEN=ghp_...
allbrew https://github.com/some/private-repo
```

## Supported URL Types

| URL Type                             | What it generates                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| **GitHub repo (existing homebrew)**  | Existing Homebrew instructions found; do not duplicate, run existing formula  |
| **GitHub repo with binary releases** | Formula using `on_macos`/`on_linux` + `on_arm`/`on_intel` blocks             |
| **GitHub repo with .app releases**   | Cask with `livecheck`, `app`, and `zap` stanzas                              |
| **GitHub repo (npm package)**        | Formula with `depends_on "node"`, `std_npm_args`, and npm registry `livecheck` |
| **GitHub repo (pip package)**        | Formula with `Language::Python::Virtualenv`, transitive `resource` blocks, and PyPI `livecheck` |
| **GitHub repo (cargo package)**      | Formula with `depends_on "rust"`, `std_cargo_args`, and crates.io `livecheck` |
| **GitHub repo (go package)**         | Formula with `depends_on "go"`, `std_go_args`, and Go module proxy `livecheck` |
| **GitHub repo (build from source)**  | Formula with cmake/autotools/make/meson install block                        |
| **Bash install script**              | Formula that runs the script with `PREFIX` set to the Cellar                 |
| **Source code archive**              | Formula that extracts and builds using detected build system                 |
| **Archive with pre-built binary**    | Formula that extracts and does `bin.install`                                 |
| **Apps/daemons with service hints**  | Formula with a `service do` block for `brew services` when selected/detected |
| **DMG or ZIP with .app**             | Cask with `app` stanza                                                       |
| **Mac App Store URL**                | Cask using `mas` to install                                                  |

### GitHub Repos — Homebrew Detection

If the repo's README already mentions `brew install`, allbrew alerts you and offers to run that command directly instead of generating a duplicate formula.

### Package Manager Updates

Package-manager formulas include Homebrew `livecheck` blocks that check the package manager's registry for the latest version:

- npm, pnpm, yarn, and Bun-detected packages check the npm registry.
- pip, pipx, and uv-detected packages check PyPI.
- Cargo packages check crates.io.
- Go packages check the Go module proxy.

### Services and LaunchAgents

For generated formulas, allbrew can add a Homebrew `service do` block so the package works with `brew services start <name>`. It looks for README and archive hints such as `brew services`, `launchctl`, `launchd`, LaunchAgent/LaunchDaemon plist files, daemon commands, and background-service wording. It can also infer services when install docs show a package-manager install, a run command, and a local web/API/dashboard endpoint like `http://localhost:3000`.

Service inference understands common install/run docs for npm, pnpm, yarn, Bun, uv, pip/pipx, Cargo, Go, Deno, and Swift Package Manager. When a hint is detected, allbrew prompts to include a service block and asks for the run command.

You can also force this non-interactively:

```bash
allbrew https://github.com/example/daemon \
  --service \
  --service-command "daemon --foreground"
```

Generated formulas include a stanza like:

```ruby
service do
  run [opt_bin/"daemon", "--foreground"]
  keep_alive true
end
```

## Options

| Flag                  | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `-n, --name <name>`   | Override the auto-detected formula/cask name                            |
| `-d, --desc <text>`   | Override the description                                                |
| `-t, --token <token>` | GitHub personal access token (also reads `GITHUB_TOKEN` env var)        |
| `-m, --manual`                  | Skip auto-detection; interactively choose URL type and install strategy          |
| `-v, --verbose`                 | Show full error stack traces                                                   |
| `--service`                    | Include a Homebrew `service do` block in generated formulas                     |
| `--no-service`                 | Do not include a Homebrew service block                                         |
| `--service-command <command>`  | Command to run from the generated service block                                 |
| `--no-service-keep-alive`      | Omit `keep_alive true` from the generated service block                         |
| `--tap <path>`                 | Override the tap repository path for this run                                   |

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

## Development

```bash
bun install
bun run check
bun run bin/allbrew.ts --help
```

## Release

`allbrew` is released by generating its Homebrew formula in a temporary checkout of the tap repository. Because Bun runs TypeScript directly, the release build step validates the TypeScript project with `tsc --noEmit`, packages the CLI with production dependencies into a release tarball, uploads that tarball to GitHub Releases, writes the formula into the temporary tap checkout, pushes it, and then cleans up the temporary files.

Preview a release without changing files, creating tags, or calling GitHub:

```bash
DRY_RUN=1 bun run release patch
```

Publish a release:

```bash
export GITHUB_TOKEN=ghp_...
bun run release patch    # or: minor, major, 1.2.3
```

The release script will:

1. Validate the Bun install and TypeScript build.
2. Build `allbrew-v<version>.tar.gz` with production dependencies and calculate its SHA256.
3. Bump `package.json` to the requested version.
4. Commit and tag `v<version>`.
5. Push the tag, create or update the GitHub release, and upload the tarball.
6. Generate `Formula/allbrew.rb` with the release asset URL and SHA inside a temporary tap checkout.
7. Commit and push the formula update to the tap, then delete the temporary checkout.

## Requirements

- Bun 1.0+
- macOS (for cask and archive inspection features)

## License

MIT
