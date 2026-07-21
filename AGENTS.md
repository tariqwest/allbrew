# AGENTS.md

> **Deeper planning & architecture docs** live in [`.agents/plans/`](./.agents/plans/):
> - [`fable-app-review-2026-07-11.md`](./.agents/plans/fable-app-review-2026-07-11.md) — codebase-wide security, architecture, edge-case, and feature review
> - [`allbrew-test-cases.md`](./.agents/plans/allbrew-test-cases.md) — combined master table of test-case apps across all 17 generators
> - [`allbrew-test-cases-deep-research-2026-06.md`](./.agents/plans/allbrew-test-cases-deep-research-2026-06.md) — full research narrative, per-ecosystem tables, generator-coverage analysis
> - [`allbrew-scan.md`](./.agents/plans/allbrew-scan.md) — plan to adopt already-installed apps into the tap
> - [`allbrew-switch.md`](./.agents/plans/allbrew-switch.md) — plan to migrate manually installed apps to official Homebrew packages
> - [`allbrew-hooks-uninstall-detection.md`](./.agents/plans/allbrew-hooks-uninstall-detection.md) — plan to detect out-of-band uninstalls and clean up stale state
> - [`setapp-generator.md`](./.agents/plans/setapp-generator.md) — Setapp app store generator (`cask-app-setapp`)
> - [`tebako-ruby-binary-status.md`](./.agents/plans/tebako-ruby-binary-status.md) — paused Ruby binary experiment
> - [`allbrew-e2e-lume-vm.md`](./.agents/plans/allbrew-e2e-lume-vm.md) — Lume macOS VM + Cua Driver harness for E2E/real-world testing
> - [`allbrew-tap-update-e2e.md`](./.agents/plans/allbrew-tap-update-e2e.md) — E2E tap + livecheck update cycle tests with synthetic fixtures

## Project overview

**allbrew** is a Bun/TypeScript CLI that accepts an arbitrary URL (GitHub repo, bash script, app binary/archive, Mac App Store link, or Setapp app link) and generates the correct Homebrew formula or cask Ruby file, writing it into the user's configured tap at `Formula/` or `Casks/`. Generated packages persist manifests and can be regenerated headlessly via `allbrew update-formulas` after `brew livecheck` reports a newer version.

**Status:** `0.0.1` (alpha). Core generator is implemented and shipping on `main`.

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | **Bun 1.0+** (`#!/usr/bin/env bun`, TypeScript executed directly) |
| Language | **TypeScript** (`tsc --noEmit` via `bun run check`) |
| CLI | **commander** + **@inquirer/prompts** |
| GitHub | **octokit** |
| UX | **chalk**, **ora** |
| HTTP / crypto | Bun `fetch`, `node:crypto` (SHA256 streaming) |
| Output | Homebrew **Ruby** `.rb` files (generated as strings, not evaluated) |
| Config | `~/.config/allbrew/config.json` |
| Manifests | `~/.config/allbrew/packages/*.json` |
| Distribution | `brew tap tariqwest/allbrew`, `bun install -g`, or release tarball |

## Build and test commands

```bash
bun install                        # install dependencies
bun run check                      # TypeScript type-check (tsc --noEmit)
bun run test                       # unit tests (Vitest, mocked, offline)
bun run test:int                   # integration tests (live APIs: PyPI, npm, GitHub, DMG)
bun run test:e2e                   # E2E catalog tests (requires E2E=1)
bun run test:e2e-tap               # E2E tap + update cycle tests (requires E2E_TAP=1)
bun run test:all                   # all tiers
bun run test:watch                 # unit tests in watch mode
bun run test:templates             # 13 fixture payloads, byte-for-byte parity checks
bun run test:update-formulas       # update-formulas integration test
bun run bin/allbrew.ts --help      # verify CLI runs
DRY_RUN=1 bun run release patch    # preview a release without side effects
```

Always run `bun run check` and `bun run test` before committing. Integration and E2E tests hit live APIs and may be slow or flaky — run them separately when validating specific generators.

## Testing instructions

- **Unit tests** (`tests/unit/`): 261 tests, fully mocked, offline-safe. Run with `bun run test`.
- **Integration tests** (`tests/integration/`): 95 tests hitting live registries (PyPI, npm, crates.io, GitHub tarballs, DMG downloads). Run with `bun run test:int`.
- **E2E tests** (`tests/e2e/`): 21 catalog-driven tests that generate formulas/casks and attempt real `brew install`. Gated behind `E2E=1` env var. Run with `bun run test:e2e`.
- **E2E tap tests** (`tests/e2e-tap/`): 39 tests that exercise the full off-machine cycle (generate → commit → push to remote tap → `brew tap`/`brew update`/`brew install <name>` → verify) plus the livecheck-driven update cycle. Uses a synthetic fixture server emulating npm/PyPI/crates.io/Go proxy/RubyGems/NuGet/GitHub APIs with fake artifacts. Gated behind `E2E_TAP=1` env var. Run with `bun run test:e2e-tap` or `scripts/test-e2e-tap.sh`.
- **Template parity tests** (`scripts/test-templates.ts`): 13 fixture payloads with byte-for-byte Ruby output comparison. Run with `bun run test:templates`.

To run a single test file:

```bash
bun run vitest run --project=unit tests/unit/classifier.test.ts
```

To run tests matching a pattern:

```bash
bun run vitest run -t "classifies GitHub"
```

## E2E VM testing

For real-world, isolated testing on a clean macOS install, use the Lume VM scripts in `scripts/e2e-vm-*.sh`. See [`.agents/plans/allbrew-e2e-lume-vm.md`](./.agents/plans/allbrew-e2e-lume-vm.md) for the full workflow.

Quick reference:

```bash
scripts/e2e-vm-setup.sh
scripts/e2e-vm-run-tests.sh --integration --e2e
scripts/e2e-vm-run-tests.sh --e2e --reset          # run tests + reset VM afterwards
scripts/e2e-vm-run-tests.sh --e2e --nuclear         # run tests + full uninstall (Homebrew/Bun/mas)
scripts/e2e-vm-readout.sh                            # capture post-test state (auto-run after tests)
scripts/e2e-vm-reset.sh                              # reset VM to virgin state
scripts/e2e-vm-reset.sh --nuclear                    # reset + uninstall Homebrew/Bun/mas CLI
scripts/e2e-vm-reset.sh --readout test-output.log    # readout then reset
scripts/e2e-vm-ssh.sh 'sw_vers && brew --version'
scripts/e2e-vm-clone.sh allbrew-e2e-clean
scripts/e2e-vm-teardown.sh --stop
```

### Remote Lume host (optional)

You can run the Lume VM on a remote Apple Silicon Mac (`homeserver.local`) while keeping the orchestration scripts and run records on your local machine. Set:

```bash
export LUME_REMOTE_HOST=app-user@homeserver.local
export LUME_REMOTE_DIR=/Users/app-user/Developer/allbrew
export LUME_REMOTE_IPSW_DIR=/Users/app-user/Downloads
```

Then use the same commands above. Before each run the harness rsyncs the local repo to `LUME_REMOTE_DIR` on the remote host, because Lume's `--shared-dir` can only mount a directory that lives on the host running the VM. The IPSW is synced once to the remote Downloads folder if it is not already there. The remote host only needs Lume installed and an active macOS user session with Virtualization Framework permissions.

### Run records

Each test run produces a timestamped record under `tests/e2e-runs/<timestamp>/`:

| File | Contents |
|------|----------|
| `readout.txt` | Full post-test state: allbrew config/manifests, Homebrew taps/formulae/casks, MAS apps, Setapp, tap repo git state, /Applications, disk usage, test results summary |
| `test-output.log` | Captured stdout/stderr from the test run |
| `metadata.json` | Machine-readable run metadata (timestamp, VM name, git SHA, branch) |
| `reset.log` | Log of the reset operation (if reset was run) |

A `latest` symlink points to the most recent run. These records persist across resets, providing a full history of what was tested, what passed/failed, and the final system state.

## Code style

- **`tsc --noEmit` must pass with zero errors** — currently `tsconfig.json` has `strict: false`, so the project compiles under loose settings. Treat the intent as strict: prefer typed payloads over `any`, avoid unsafe casts, and do not rely on the loose compiler setting. A migration to `strict: true` (or at least `strictNullChecks`) is planned.
- **No runtime compilation** — Bun executes `.ts` files directly; do not add a build step.
- **Templates over ad-hoc strings** — All Ruby output goes through typed payload objects (`lib/template-payload.ts`) and template modules (`lib/templates/`). Never embed large Ruby strings in generators.
- **Generators collect, templates render** — Each generator's job is to gather a typed `*Payload` and delegate to `template-renderer.ts`. Generators should not produce Ruby directly.
- **Homebrew Ruby conventions** — Follow existing Homebrew formula/cask style (`std_npm_args`, `std_cargo_args`, `on_macos`/`on_arm` blocks, etc.).
- **No comments or documentation** unless explicitly requested by the user.
- **Imports at the top of the file** — never mid-file.

## Agent tool-use rules

### Editing `.agents/plans/allbrew-test-cases.md`

**Always use [`md-spreadsheet-parser`](https://github.com/fy-labs/md-spreadsheet-parser) — never raw `split('|')`.**

The master test-case table is a 24-column GFM table with cells that can contain backtick-quoted pipes (`` `cmd|flag` ``), escaped pipes, and occasional column-count irregularities. Raw string splitting silently corrupts these rows. The parser handles all GFM edge cases correctly and enforces uniform structure on round-trip.

```typescript
import { scanTablesFromFile } from 'md-spreadsheet-parser';

const [table] = scanTablesFromFile('.agents/plans/allbrew-test-cases.md');
// Read:  table.headers (string[]), table.rows (string[][])
// Edit:  table.updateCell(rowIndex, colIndex, value)
//        or mutate table.rows directly
// Write: table.toMarkdown() → regenerate the file section
```

Use `table.headers.indexOf('column_name')` to look up column positions — never hardcode numeric offsets.

Install if not present: `bun add md-spreadsheet-parser` (npm WASM package, works natively in Bun).

## Architecture

### Generation flow

1. User provides URL (CLI arg or prompt)
2. **`classifier.ts`** → strategy (github-repo, bash-script, archive, cask-dmg, mac-app-store, setapp-app)
3. **`github.ts`** / **`analyzer.ts`** / **`archive-inspector.ts`** → metadata, install method, service hints
4. **`generators/*.ts`** → collect typed **payload** + download artifacts for SHA256
5. **`template-renderer.ts`** → render Ruby from `lib/templates/formula/*` or `lib/templates/cask/*`
6. **`utils.writeFormula`** / **`writeCask`** → user's tap `Formula/` or `Casks/`
7. **`build-manifest.ts`** + **`saveManifest`** → persist re-generation inputs

```mermaid
flowchart TD
  URL[User URL] --> Classify[classifier.ts]
  Classify --> Analyze[github + analyzer + archive-inspector]
  Analyze --> Gen[generators: collect*Payload]
  Gen --> Render[template-renderer.ts]
  Render --> Write[writeFormula / writeCask → tap]
  Write --> Manifest[build-manifest + saveManifest]

  Livecheck[brew livecheck --json] --> Update[update-formulas]
  Manifest --> Update
  Update --> Updater[package-updater.ts]
  Updater --> Gen
  Update --> TapGit[tap-git commit/push]
```

### Generators (17 total)

| Generator | Output | Install / deps | Livecheck |
|-----------|--------|----------------|-----------|
| `binary-release` | Formula | GitHub release tarballs | `:github_latest` |
| `source-build` | Formula | cmake/autotools/make/meson | tag / github |
| `npm-package` | Formula | `node`, `std_npm_args` | npm registry |
| `pip-package` | Formula | `virtualenv`, transitive `resource` | PyPI |
| `cargo-package` | Formula | `rust`, `std_cargo_args` | crates.io |
| `go-package` | Formula | `go`, `std_go_args` | Go module proxy |
| `install-script` | Formula | runs `.sh` with Cellar `PREFIX` | url |
| `archive-build` | Formula | build from extracted source | url |
| `binary-direct` | Formula | `bin.install` prebuilt exe | url |
| `cask-app` | Cask | DMG/ZIP `.app` URL | url |
| `cask-app-release` | Cask | release `.dmg`/`.zip` | github |
| `cask-app-mas` | Cask | `mas` installer | MAS |
| `cask-app-setapp` | Cask | `setapp-cli` installer | Setapp page |
| `spm-package` | Formula | `swift`, `swift build` | `:github_latest` |
| `dotnet-package` | Formula | `dotnet`, `dotnet tool install` | NuGet |
| `gem-package` | Formula | `ruby`, `gem install` | rubygems.org |
| `mint-package` | Formula | `mint`, `mint install` | `:github_latest` |

### Template layer

Generators build **typed payloads** (`lib/template-payload.ts`) and delegate to template modules. `bun run test:templates` runs 13 fixture payloads with byte-for-byte parity checks.

### Managed updates

When a formula/cask is generated, allbrew saves a **PackageManifest** JSON to `~/.config/allbrew/packages/`. `allbrew update-formulas` reads `brew livecheck --installed --newer-only --json`, loads manifests for outdated names, re-runs the matching generator + template renderer, commits to the tap, and optionally pushes.

**Automation:**

- `allbrew hooks install` → shell wrapper at `$(brew --prefix)/etc/allbrew-brew-wrap` (runs `update-formulas` after `brew update`) plus macOS Folder Actions for uninstall detection (planned)
- `allbrew service install` → LaunchAgent + `scripts/update-managed.sh` on a configurable schedule

### Formula dependency injection

Every generated **formula** gets `depends_on "tariqwest/allbrew/allbrew"` so the tap stays linked to allbrew. Casks are not injected.

## Project structure

```
homebrew-allbrew/
  bin/allbrew.ts              # CLI entry point
  lib/
    cli.ts                    # Orchestration: classify, route, prompt, generate, save manifest
    setup.ts                  # First-run tap setup + GitHub remote + brew tap
    classifier.ts             # URL → strategy routing
    setapp-bootstrap.ts       # Auto-install setapp-cli + Setapp on first Setapp cask
    github.ts                 # GitHub API (releases, README, repo files via Octokit)
    analyzer.ts               # README/repo analysis: install method, service hints
    sha256.ts                 # Streaming SHA256 computation
    archive-inspector.ts      # Download, extract, sub-classify archive contents
    config.ts                 # ~/.config/allbrew/config.json
    manifest.ts               # Package manifest types + persistence
    build-manifest.ts         # Manifest construction after generation
    update-formulas.ts        # Headless re-generation from livecheck
    package-updater.ts        # Per-generator re-generation logic
    tap-git.ts                # Git commit/push to tap repo
    brew-hooks.ts             # brew update hook integration
    launchd-service.ts        # LaunchAgent for scheduled updates
    template-renderer.ts      # Dispatch payload → template module
    template-payload.ts       # Typed payload union (all generators)
    utils.ts                  # Name conversion, writeFormula/writeCask, dep injection
    generators/               # collect*Payload + thin generate* wrappers
    templates/
      formula/                # TS template modules (formula output)
      cask/                   # TS template modules (cask output)
  tests/
    unit/                     # Vitest unit tests (mocked, offline)
    integration/              # Live API tests (PyPI, npm, GitHub, DMG)
    e2e/                      # Catalog-driven brew install tests
  scripts/
    release.ts                # Version bump, tarball, GitHub release, tap formula push
    test-templates.ts         # Template parity test runner
    test-update-formulas.ts   # update-formulas integration test runner
    update-managed.sh         # Launchd scheduled update script
  .agents/plans/              # Deeper planning & research docs
```

**Note:** `Formula/` and `Casks/` live in the **user's tap checkout** (default `~/homebrew-mytapp`), not in this repo.

## CLI surface

```bash
allbrew [url]                    # generate formula/cask and auto-install
allbrew init                     # first-run setup (tap + optional GitHub remote)
allbrew config set-tap <path>
allbrew config set-token <token>
allbrew config set-remote
allbrew config set-update-auto-push <true|false>
allbrew config set-update-schedule <hours>
allbrew config show
allbrew update-formulas [--dry-run] [names...]
allbrew hooks install|uninstall
allbrew service install|uninstall
```

Key flags: `--manual`, `--name`, `--desc`, `--tap`, `--service`, `--service-command`, `--token`, `--verbose`.

## Environment variables

- `GITHUB_TOKEN` — pre-authenticate for GitHub API calls
- `ALLBREW_GITHUB_CLIENT_ID` — enable browser OAuth during `allbrew init`
- `DRY_RUN=false` — in E2E tests, use the real configured tap instead of a temp dir
- `E2E=1` — enable E2E test tier
- `E2E_TAP=1` — enable E2E tap + update cycle test tier
- `GITHUB_API_URL` — override GitHub API base URL (used by E2E tap tests to redirect to fixture server)
- `NPM_REGISTRY_URL` — override npm registry base URL (used by E2E tap tests)
- `PYPI_URL` — override PyPI base URL (used by E2E tap tests)
- `CRATES_URL` — override crates.io base URL (used by E2E tap tests)
- `GO_PROXY_URL` — override Go module proxy base URL (used by E2E tap tests)
- `RUBYGEMS_URL` — override RubyGems base URL (used by E2E tap tests)
- `NUGET_URL` / `NUGET_FLAT_URL` — override NuGet base URLs (used by E2E tap tests)

## Security considerations

- **Never commit `GITHUB_TOKEN` or PATs** to the repo. Use environment variables or `allbrew config set-token`.
- **`.env` is gitignored** — safe for local development secrets.
- **Generated Ruby is strings, not evaluated by allbrew** — allbrew produces `.rb` files as text. Homebrew evaluates them at `brew install` time, so generated strings must be treated as code-equivalent: escape all user-controlled values correctly.
- **SHA256 verification** — all downloaded artifacts are checksummed before being referenced in formulas/casks.
- **No network calls in unit tests** — unit tests are fully mocked. Integration/E2E tests make real API calls.

### Known security hardening in progress (see [`.agents/plans/fable-app-review-2026-07-11.md`](./.agents/plans/fable-app-review-2026-07-11.md))

| Area | Issue | Status |
|------|-------|--------|
| Ruby string escaping | `rubyEscape` does not escape Ruby interpolation (`#{...}`) or newlines; malicious metadata could inject Ruby into generated formulas. | Fix planned |
| Archive extraction | `unzip`/`tar` are invoked without path-traversal protection; a malicious archive could write outside the temp dir. | Hardening planned |
| README command execution | When a README advertises `brew install foo`, allbrew offers to run it; `&&`-split segments are executed without an allowlist. | Review planned |
| Config permissions | `~/.config/allbrew/config.json` (contains the GitHub token) is written with default umask. | Fix planned |
| HTTPS enforcement | HTTP URLs are fetched without warning. | Warning planned |
| URL fetch / SSRF | Arbitrary user-provided URLs are fetched, including private-range/link-local addresses. | Review planned |

## Design principles

1. **Homebrew as source of truth** — if README already says `brew install foo`, offer to run it instead of duplicating.
2. **Detect first, prompt when ambiguous** — releases vs README vs repo files; user can override with `--manual`.
3. **Package-manager formulas are first-class** — livecheck against registries, not just GitHub tags.
4. **Regenerate, don't hand-edit** — manifests enable `update-formulas` to refresh `.rb` files when upstream versions change.
5. **Templates over ad-hoc strings** — TS template modules + parity tests keep Ruby output consistent.
6. **Research-driven testing** — a catalog of ~230 real apps per UI type × ecosystem validates generator coverage (see `.agents/plans/`).

## Current status

### What works today

| Area | Status |
|------|--------|
| URL → formula/cask generation (17 generators) | done |
| Interactive + `--manual` mode | done |
| Package-manager formulas (pip, npm, cargo, go) + livecheck | done |
| Swift SPM, dotnet-tool, ruby-gem, swift-mint generators | done |
| Binary / source / script / cask / MAS / Setapp paths | done |
| `brew services` block inference + flags | done |
| TypeScript template renderer + parity suite | done |
| Manifest persistence + `allbrew update-formulas` | done |
| `allbrew hooks install` + `allbrew service install` (launchd) | done |
| Release script → GitHub release + tap formula | done |
| First-run setup (`allbrew init`) | done |
| Auto `brew update` + `brew install` after generation | done |
| Three-tier Vitest suite: unit, integration, E2E | done |

### What is not done

- README examples validated for every generator path
- MAS install by app name (URL with `/id{number}` only)
- Uninstall/zap verification across generators
- Binary/cask generator improvements for DMG-only desktop apps (Electron/Avalonia)
- `allbrew scan` — scan the user's system for already-installed non-Homebrew apps and retroactively create formulas/casks to track them (no reinstall, just adopt into the tap)
- `allbrew switch` — scan for apps installed via MAS, Setapp, or other package managers that are also available in Homebrew core/casks, and offer to switch to the Homebrew-managed version
- `allbrew hooks` uninstall detection — detect when tracked apps are removed outside of Homebrew/allbrew (manual deletion, MAS/Setapp uninstall) and clean up stale formulas/casks/manifests

## Agent contribution priorities

When picking up work, prefer this order unless the user requests otherwise:

1. **Security hardening** — these block safe use of automation (hooks/service) and should land before scan/switch/uninstall-detection:
   - Fix `rubyEscape` to handle Ruby interpolation and newlines.
   - Harden `archive-inspector.ts` extraction against path traversal.
   - Restrict `config.json` permissions and validate tap paths.
   - Add HTTPS warning/non-HTTPS handling.
2. **Type safety & manifest typing** — enables reliable `update-formulas` and all planned features that read manifests:
   - Replace `Record<string, unknown>` manifest sources with per-generator discriminated unions.
   - Type generator `repoInfo`/`options` and reduce `any` usage.
   - Migrate toward strict TypeScript incrementally.
3. **Operational robustness** — required before hooks/service can run safely alongside manual use:
   - Add a lock file for `update-formulas` concurrent runs.
   - Wrap livecheck JSON parsing and clean up temp dirs/partial downloads on failure.
   - Truncate launchd logs and embed absolute brew/allbrew paths in `update-managed.sh`.
4. **Planned features** — implement in this order because each builds on the previous:
   - `allbrew scan` + shared `lib/scan-detect.ts`
   - `allbrew hooks` uninstall detection (relies on scan's `appPath` metadata)
   - `allbrew switch` (relies on `scan-detect.ts` and Homebrew API matching)
5. **Small user-facing wins** — can be done in parallel once (1)–(3) are stable:
   - `allbrew list`, `allbrew info`, `allbrew remove`, `allbrew regenerate`, `allbrew doctor`
   - `--dry-run` generation output and `--json` result mode
   - Shell completions

Always open or update the relevant `.agents/plans/*.md` document before starting a new feature, and keep [`.agents/plans/fable-app-review-2026-07-11.md`](./.agents/plans/fable-app-review-2026-07-11.md) in mind — it contains the detailed rationale and file:line references for the hardening items above.

## Requirements

- Bun 1.0+
- macOS for cask generation, archive inspection, launchd service
- `brew`, `git` for tap workflow and livecheck updates
