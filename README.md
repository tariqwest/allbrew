# Allbrew

Make Homebrew the source of truth for all your macOS installs — even when the app isn't on Homebrew yet. Point `allbrew` at a GitHub repo, a bash install script, a binary archive, a macOS app DMG, a Mac App Store link, or a Setapp link and it generates the right Homebrew formula or cask into your personal tap.

## What it does

- **Generates** `Formula/<name>.rb` or `Casks/<name>.rb` files for your tap from arbitrary URLs.
- **Manages** generated packages with a persisted manifest so `allbrew list` and `allbrew update-formulas` know what you own.
- **Updates** your tap by running `brew livecheck` and regenerating the Ruby files when a newer version is found.
- **Hooks** into `brew update` so your allbrew-managed formulas stay current automatically.
- **Infers** `service do` blocks when READMEs, archives, or run instructions suggest a background daemon.

## Current state

This is a **beta** (v0.0.37). Core generation works across 17 generator paths and is backed by ~1,355 unit tests, template-parity checks, integration suites (PyPI, npm, crates.io, GitHub, DMG), a synthetic E2E-tap harness, and a Lume VM E2E harness. It is ready for daily use, but a few management commands are still planned.

### What's working

| Feature | Status |
| ------- | ------ |
| URL classification and interactive/manual generation | ✅ |
| 17 generators (formulas + casks; see table below) | ✅ |
| Manifest persistence and `allbrew list` | ✅ |
| `allbrew update-formulas` with livecheck JSON | ✅ |
| `allbrew hooks install` for brew-update integration | ✅ |
| `allbrew service install` for periodic updates | ✅ |
| Unit tests (`bun run test`) — ~1,355 tests | ✅ |
| Template parity (`bun run test:templates`) | ✅ |
| Integration tests (`bun run test:int`) — PyPI, npm, crates.io, GitHub, DMG | ✅ |
| E2E tap + update cycle (`bun run test:e2e-tap`; dotnet quarantined) | ⚠️ |
| CI (type-check, unit tests, template parity) | ✅ |

### Distribution status

- **Homebrew tap** ✅ Published: `brew tap tariqwest/tap && brew trust tariqwest/tap && brew install allbrew` works.
- **npm / Bun / Deno packages** — not published yet.
- **Source install** — always available.

## Install

### Homebrew (recommended)

```bash
brew tap tariqwest/tap
brew trust tariqwest/tap
brew install allbrew
```

This downloads a release tarball from GitHub and depends on the `bun` formula. Homebrew requires you to trust third-party taps before loading their formulae.

### From source

```bash
git clone https://github.com/tariqwest/allbrew.git
cd allbrew
bun install
bun link
```

Or with Node:

```bash
git clone https://github.com/tariqwest/allbrew.git
cd allbrew
npm install
npm link            # uses the JS shim + tsx
```

Requires Bun 1.0+ and macOS. Node 18+ works via the `tsx` loader (installed as an optional dependency).

### Planned distribution

```bash
# npm (not yet available)
npm install -g allbrew

# Bun (not yet available)
bun install -g allbrew

# Deno (not yet available)
deno install -g --allow-all npm:allbrew
```

## Setup

On first run allbrew prompts for a tap repository path. Set it upfront:

```bash
allbrew config set-tap ~/homebrew-mytap
allbrew config set-token ghp_...        # optional, avoids GitHub rate limits
allbrew config show
```

Override the tap for a single run:

```bash
allbrew --tap ~/other-tap https://github.com/BurntSushi/ripgrep
```

## Quick start

```bash
# Interactive
allbrew

# Generate a formula from a GitHub repo
allbrew https://github.com/BurntSushi/ripgrep

# Generate with overrides
allbrew https://github.com/sharkdp/bat --name bat --desc "A cat clone with wings"

# Generate a background service formula
allbrew https://github.com/example/daemon \
  --service \
  --service-command "daemon --foreground"

# Generate a cask from a DMG
allbrew https://github.com/some/app/releases/download/v1.0/App-1.0.dmg

# See what allbrew is managing
allbrew list

# Update everything that has a newer version
allbrew update-formulas

# Keep taps updated through brew update
allbrew hooks install
```

## Supported URL types

| URL / source | Generated file | Notes |
| ------------ | -------------- | ----- |
| GitHub repo with binary releases | Formula | `on_macos`/`on_linux` + `on_arm`/`on_intel` blocks |
| GitHub repo with `.app` releases | Cask | `livecheck`, `app`, `zap` stanzas |
| GitHub repo (npm / pnpm / yarn / Bun) | Formula | `depends_on "node"` + npm registry `livecheck` |
| GitHub repo (pip / uv / pipx) | Formula | `Language::Python::Virtualenv` + PyPI `livecheck` |
| GitHub repo (Cargo / Rust) | Formula | `depends_on "rust"` + crates.io `livecheck` |
| GitHub repo (Go module) | Formula | `depends_on "go"` + Go module proxy `livecheck` |
| GitHub repo (Swift Package Manager / mint) | Formula | Swift / mint based source build |
| GitHub repo (build from source) | Formula | cmake / autotools / make / meson install block |
| Bash install script | Formula | Runs script with `PREFIX` set to the Cellar |
| Source archive (tar/zip) | Formula | Detects build system from archive contents |
| Pre-built binary archive | Formula | Extracts and `bin.install` |
| DMG / ZIP with `.app` | Cask | `app` stanza |
| Mac App Store URL | Cask | `mas` install; requires full App Store URL |
| Setapp app link | Cask | `setapp-cli` install |
| Ruby gem | Formula | `gem install` based formula |
| .NET NuGet tool | Formula | **Experimental** — end-to-end suite quarantined |

## Representative scenarios

### 1. Adopt a popular CLI that's missing from Homebrew

```bash
allbrew https://github.com/jesseduffield/lazygit
```

allbrew inspects the GitHub releases, picks the macOS tarball, computes SHA256, and writes `Formula/lazygit.rb` into your tap.

### 2. Install a Node-based tool from its repo

```bash
allbrew https://github.com/sindresorhus/email-regex-safe
```

allbrew detects the npm package, writes a formula using `std_npm_args`, and adds an npm-registry `livecheck` block.

### 3. Turn a bash installer into a formula

```bash
allbrew https://fly.io/install.sh --name flyctl
```

allbrew wraps the script so `brew install flyctl` runs it with the correct `PREFIX`.

### 4. Run a web service with `brew services`

```bash
allbrew https://github.com/maildev/maildev --service
```

If allbrew detects a daemon pattern, it prompts for the run command and writes a `service do` block. After `brew install maildev`:

```bash
brew services start maildev
```

### 5. Manage a Mac app from a DMG release

```bash
allbrew https://github.com/rxhanson/Rectangle/releases/download/v0.99/Rectangle0.99.dmg
```

Generates `Casks/rectangle.rb` with `livecheck` so `allbrew update-formulas` can bump it later.

### 6. Auto-update your tap on `brew update`

```bash
allbrew hooks install
```

Then add this to your shell profile (the hook prints the exact line):

```bash
alias brew=allbrew_brew
```

Now `brew update` runs `allbrew update-formulas` afterwards.

## Management commands

| Command | Status | Description |
| ------- | ------ | ----------- |
| `allbrew list` | ✅ | Show tracked packages |
| `allbrew list --json` | ✅ | Machine-readable output |
| `allbrew update-formulas` | ✅ | Regenerate outdated packages |
| `allbrew hooks install/uninstall` | ✅ | Brew-update integration |
| `allbrew service install/uninstall` | ✅ | Periodic LaunchAgent |
| `allbrew config ...` | ✅ | Configuration management |
| `allbrew info <name>` | 🛠️ planned | Show manifest + generated Ruby |
| `allbrew remove <name>` | 🛠️ planned | Remove a tracked package |
| `allbrew doctor` | 🛠️ planned | Detect stale/out-of-sync state |
| `allbrew scan` | 🛠️ planned | Adopt already-installed apps |
| `allbrew switch` | 🛠️ planned | Move a manual install to official Homebrew |

## Current gaps & known issues

- **dotnet/NuGet generator is experimental.** Its E2E-tap suite is quarantined behind `E2E_TAP_QUARANTINE=1` pending a fixture-server timeout fix.
- **MAS requires the full App Store URL.** App name/id lookup is planned.
- **Uninstall / zap behavior** is not verified across every generator path.
- **DMG-only desktop apps** (Electron / Avalonia) still need generator improvements.
- **README examples** are not yet validated for every generator path.
- **TypeScript strict mode** is off and there are still `any` types to remove. See `.agents/plans/fable-app-review-2026-07-11.md`.

## Next todos (rough priority)

1. **Type safety & manifest typing:** replace `Record<string, unknown>` manifest sources with per-generator discriminated unions, then migrate toward `strict: true` incrementally.
2. **`allbrew info` / `allbrew remove` / `allbrew doctor`:** small management commands that reuse existing manifest infrastructure.
3. **Fix the dotnet harness:** raise the fixture-server idle timeout or pre-build the fake nupkg, then un-quarantine the suite.
4. **Uninstall residual verification:** run the residual helper across every generator path.
5. **MAS URL lookup:** accept app names/IDs in addition to full Store URLs.
6. **`allbrew scan` / `allbrew switch` / uninstall detection:** adopt already-installed apps into the tap and detect out-of-band uninstalls.

## Batch artifacts (archived, repo stays lean)

Batch fixes are **not** kept on `main` — they are archived:

```bash
bun scripts/archive-batch-artifacts.mjs --dry-run   # preview 213 patches + 1501 runs → ~/.cache/allbrew/batch-artifacts/2026-08-10.tar.zst (9.2M)
tar tf ~/.cache/allbrew/batch-artifacts/2026-08-10/batch-2026-08-10.tar.zst | grep fix-packages | head   # find archived patch
tar -xf ~/.cache/allbrew/batch-artifacts/2026-08-10/batch-2026-08-10.tar.zst -C .   # restore
bun run batch:reconcile-fixes -- --path ~/.cache/allbrew/batch-artifacts/2026-08-10/fix-packages/<slug> --json  # apply
cat tests/monitored-install-batch/archive/manifest.json | python3 -m json.tool   # locate archive (sha256, counts, gitSha)
```

`tests/monitored-install-batch/fix-packages/` + `tests/monitored-install-runs/` + `logs/` are `.gitignore`d; only `archive/manifest.json` + `state/fix-index.jsonl` stay tracked.

## Development

```bash
bun install
bun run check              # TypeScript type-check (tsc --noEmit)
bun run test               # unit tests, mocked/offline
bun run test:templates     # byte-for-byte Ruby parity checks
bun run test:int           # integration tests against live APIs
bun run test:e2e           # E2E catalog tests (requires E2E=1)
bun run bin/allbrew.ts --help
```

Always run `bun run check` and `bun run test` before committing. Integration and E2E tests hit live registries and may be slow or flaky.

## Release

Preview a release:

```bash
DRY_RUN=1 bun run release patch
```

Publish (requires `GITHUB_TOKEN` and the Homebrew tap repo):

```bash
export GITHUB_TOKEN=ghp_...
bun run release patch
```

After the `allbrew` release completes, the script automatically rebases the `allbrew-dogfood` branch on top of the new `main` tag (dropping stale dogfood version-bump commits), bumps `package.json` to `X.Y.Z-dogfood.N`, tags it, and publishes the `allbrew-dogfood` formula to the tap. Set `ALLBREW_DOGFOOD_BRANCH` to override the branch name. See `scripts/release.ts` for the full release flow.

## Contributing

You do not need to be a developer to contribute. The most valuable contribution is your **monitored install experience**: running allbrew against a real URL, reporting what worked and what did not, and — when something breaks — sharing a patch + system info so a maintainer can fix it. See `.agents/skills/monitored-install-dogfood/SKILL.md` for the full workflow.

### Dogfood testing

`allbrew-dogfood` is a long-lived sandbox branch (and a sibling Homebrew formula) where candidate fixes are staged before being promoted to `main`. It installs the same `allbrew` command as the canonical build, but with unreleased patches applied.

Two ways to opt in:

1. **Built-in AI harness (macOS 27+)** — uses the on-device Apple Foundation Models `fm` CLI to classify the URL and drive the run, no external agent needed:
   ```bash
   brew install tariqwest/tap/allbrew-dogfood
   allbrew dogfood <app-url>            # on-device fm model
   allbrew dogfood <app-url> --backend pcc   # Private Cloud Compute (aspirational)
   ```
   This writes a run record (agent judgment, verbose log, and an `allbrew doctor` diagnostic report) and tells you where it is.

2. **Agent harness** — run the `/monitored-install-dogfood` skill in whichever agent harness and model you already use (OpenCode, Claude, etc.).

Then submit your findings for review:

- **Fork + PR** (if you have `gh`/GitHub auth): the skill forks the repo, commits the patch + run record, and opens a PR against `main` (or `allbrew-dogfood`).
- **Issue fallback** (no auth required): the skill emits a pre-filled issue — choose the "Dogfood bug report" template — with your patch, log, and diagnostic report attached.

### What to include

Every submission should carry enough context for a maintainer to reproduce and assess your fix. `allbrew doctor` captures it automatically (with tokens redacted):

```bash
allbrew doctor --report report.md   # OS/build, Homebrew version+state, allbrew version, manifests
```

A contributed patch flows through this lifecycle: **contributor's environment → `patches/dogfood/<run-id>.patch` + run record → `allbrew-dogfood` branch (via maintainer review) → `main` as a fix artifact → reconciled into executed code in `main`.**

### Lifecycle reference

| Stage | Where it lives | Who |
|-------|----------------|-----|
| Dogfood install + judgment | `allbrew dogfood <url>` run record | contributor |
| Patch artifact + run record | `patches/dogfood/*.patch`, `tests/monitored-install-runs/` | contributor (via PR/issue) |
| Applied fix | `allbrew-dogfood` branch | maintainer |
| Promoted fix | `main` (cherry-picked / PR'd) | maintainer |

## Security & trust

- allbrew **generates** Ruby formula/cask files; it does **not** evaluate them. Homebrew evaluates the generated `.rb` files during `brew install`.
- Provide URLs only from sources you trust. allbrew downloads linked artifacts and computes SHA256 checksums, but a malicious upstream could still craft descriptions, archive entries, or install scripts.
- Your GitHub token is stored in `~/.config/allbrew/config.json` (written with `0600` permissions). Do not commit this file.
- When a README advertises an existing `brew install` command, allbrew offers to run it for you; review the command before confirming.

## License

MIT
