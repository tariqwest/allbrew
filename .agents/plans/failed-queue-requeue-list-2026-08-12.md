# Failed-queue requeue list — 2026-08-12

After disposition of unfixable rows: **74 failed remain**.

## How to requeue

```bash
# After category fix lands and is released (or --allbrew-src worktree re-verify):
bun tests/monitored-install-batch/batch-ops.mjs --requeue <slug>
# Prefer agentName if duplicates:
bun tests/monitored-install-batch/run-agent-batch.mjs --mark-done <agentName> pending  # only if requeue helper insufficient
```

Note: `batch-ops --requeue` matches by slug; for duplicate slugs requeue carefully or fix by idx via queue edit.

## P0 — requeue after category fix release

| idx | agentName | slug | P0 tag | patches | fix class |
|-----|-----------|------|--------|---------|-----------|
| 13 | `url-0013-television` | television | `binary_release_bin_and_entry` | 1 | brew_fail (BIN_MISSING) — VM |
| 52 | `url-0052-toolong` | toolong | `binary_release_bin_and_entry` | 0 |  |
| 133 | `url-0133-swift-outdated` | swift-outdated | `binary_release_bin_and_entry` | 5 | generate_fail (then brew_fail risk) |
| 404 | `url-0404-go2tv` | go2tv | `binary_release_bin_and_entry` | 1 | brew_fail / wrong generator (binary-rele |
| 421 | `url-0421-swift-outdated` | swift-outdated | `binary_release_bin_and_entry` | 5 | generate_fail (then brew_fail risk) |
| 345 | `url-0345-rainfrog` | rainfrog | `cargo_lock_fallback` | 0 |  |
| 348 | `url-0348-oatmeal` | oatmeal | `cargo_lock_fallback` | 0 |  |
| 392 | `url-0392-gobang` | gobang | `cargo_lock_fallback` | 1 | brew_fail |
| 191 | `url-0191-gotify` | gotify | `core_name_collision_api` | 2 | brew_fail |
| 359 | `url-0359-nanobot` | nanobot | `core_name_collision_api` | 1 | brew_fail — |
| 40 | `url-0040-geminabox` | geminabox | `gem_native_and_library` | 3 | brew_fail (BIN_MISSING) — library gem wi |
| 282 | `url-0282-mailcatcher` | mailcatcher | `gem_native_and_library` | 1 | brew_fail (primary); service command qua |
| 347 | `url-0347-adamantite` | adamantite | `gem_native_and_library` | 0 |  |
| 512 | `url-0512-geminabox` | geminabox | `gem_native_and_library` | 3 | brew_fail (BIN_MISSING) — library gem wi |
| 126 | `url-0126-portdeck` | portdeck | `github_prerelease_latest` | 4 | generate_fail |
| 279 | `url-0279-agent-deck` | agent-deck | `install_script_noninteractive` | 1 | brew_fail — install-script hangs waiting |
| 352 | `url-0352-starship` | starship | `install_script_noninteractive` | 1 | brew_fail |
| 368 | `url-0368-verdaccio` | verdaccio | `npm_service_detection` | 1 | service_mismatch (+ brew_fail/timeout on |
| 112 | `url-0112-elia` | elia | `pip_resources_and_verify` | 3 | brew_fail |
| 350 | `url-0350-pyqt-openai` | pyqt-openai | `pip_resources_and_verify` | 1 | generate_fail → brew_fail |
| 358 | `url-0358-mlflow` | mlflow | `pip_resources_and_verify` | 3 | brew_fail |
| 359 | `url-0359-nanobot` | nanobot | `pip_resources_and_verify` | 1 | brew_fail — |
| 746 | `url-0746-chainlit` | chainlit | `pip_resources_and_verify` | 1 | brew_fail (BIN_HELP_FAIL after successfu |

### By category tag

#### `install_script_noninteractive` — install-script: pass noninteractive flags/env (FORCE, --yes, --non-interactive, BIN_DIR)

_Install-script formulas hang or fail without vendor noninteractive flags_

- **agent-deck** (`url-0279-agent-deck`) — https://raw.githubusercontent.com/asheshgoplani/agent-deck/main/install.sh
  - `lib/templates/formula/install-script.ts` ran `system "bash", cached_download.to_s` without args. The agent-deck `install.sh` supports `--non-interactive` (and 
- **starship** (`url-0352-starship`) — https://starship.rs/install.sh
  - 1. **Non-interactive install script** — `https://starship.rs/install.sh` requires `FORCE=1` / `--yes` to skip the confirm prompt (`read` from `/dev/tty` fails i

#### `github_prerelease_latest` — GitHub: fall back to latest prerelease when /releases/latest 404s

_Repos with only prereleases mis-route to wrong generators_

- **portdeck** (`url-0126-portdeck`) — https://github.com/JessePeplinski/portdeck
  - GitHub API `GET /repos/{owner}/{repo}/releases/latest` returns 404 when a repository has **only prereleases** (no stable "latest"). PortDeck ships solely as `v0

#### `core_name_collision_api` — Detect homebrew/core name collisions via API (API-only VMs)

_isHomebrewCoreFormulaName misses core formulas without Formula tree checkout_

- **nanobot** (`url-0359-nanobot`) — https://pypi.org/project/nanobot-ai/
  - 1. URL `https://pypi.org/project/nanobot-ai/` classifies as `pip-package` (correct). Generated formula uses `preserve_rpath` for native wheels with `@rpath` dyl
- **gotify** (`url-0191-gotify`) — https://github.com/gotify/cli
  - 1. **Wrong CLI bin name.** Bare release assets are named `gotify-cli-darwin-arm64` etc. `resolveBinaryReleaseBinName` stripped platform tokens to `gotify-cli` a

#### `binary_release_bin_and_entry` — binary-release: versioned entrypoint template, refuse non-exec entrypoints, CLI zip routing

_BIN_MISSING / LICENSE-as-bin / CLI macos.zip misclassified as cask_

- **television** (`url-0013-television`) — https://github.com/alexpasmantier/television
  - `lib/generators/binary-release.ts:buildBinaryReleaseInstallBody` hardcoded the archive entrypoint version into the install symlink path: `libexec/"tv-0.15.9-aar
- **go2tv** (`url-0404-go2tv`) — https://github.com/alexballas/go2tv
  - `isAppAsset` treats arch-tagged `*_macOS_arm64.zip` / `*_macOS_amd64.zip` names as CLI binary archives (same rule that correctly handles `gogs_*_darwin_amd64.zi
- **toolong** (`url-0052-toolong`) — https://pypi.org/project/toolong
- **swift-outdated** (`url-0133-swift-outdated`) — https://github.com/kiliankoe/swift-outdated
  - 1. `isAppAsset` treats `*-macos.zip` without CPU arch as a desktop app. Release also has `*-linux.zip` (CLI). Routed to cask-app-release → no .app → hard fail. 
- **swift-outdated** (`url-0421-swift-outdated`) — https://github.com/kiliankoe/swift-outdated
  - 1. `isAppAsset` treats `*-macos.zip` without CPU arch as a desktop app. Release also has `*-linux.zip` (CLI). Routed to cask-app-release → no .app → hard fail. 

#### `pip_resources_and_verify` — pip-package: wheel selection, resource deps, console_script relink, core collision

_pip install succeeds or fails with incomplete resources / verify BIN_MISSING_

- **elia** (`url-0112-elia`) — https://github.com/darrenburns/elia
  - 1. **Homebrew 6+ tap trust**: `brew install` of generated formulae refused untrusted `th-allbrew/allbrew` tap. `brewAutoInstall` lacked `HOMEBREW_NO_REQUIRE_TAP
- **chainlit** (`url-0746-chainlit`) — https://github.com/Chainlit/chainlit
  - `chainlit` depends on `literalai==0.1.201`. PyPI publishes `literalai` with `requires_dist: null` for all releases, but `setup.py` declares: - `chevron>=0.14.0`
- **mlflow** (`url-0358-mlflow`) — https://github.com/mlflow/mlflow
  - 1. **Console-script link delta empty:** Homebrew `Language::Python::Virtualenv#pip_install_and_link` only symlinks scripts that are *new* after the main-package
- **pyqt-openai** (`url-0350-pyqt-openai`) — https://pypi.org/project/pyqt-openai
  - 1. Bare product zip `VividNode.zip` + `VividNodeSetup.exe` mis-routed to `cask-app-release` (no `.app`). 2. After skip, README `pip install -r` → `build(python)
- **nanobot** (`url-0359-nanobot`) — https://pypi.org/project/nanobot-ai/
  - 1. URL `https://pypi.org/project/nanobot-ai/` classifies as `pip-package` (correct). Generated formula uses `preserve_rpath` for native wheels with `@rpath` dyl

#### `gem_native_and_library` — gem-package: native build depends_on map + empty-exec library verify mode

_gem install fails without pkgconf; pure libs fail BIN_OK verify_

- **mailcatcher** (`url-0282-mailcatcher`) — https://rubygems.org/gems/mailcatcher
  - 1. **Native gem build**: generated gem-package formula runs bare `gem install mailcatcher` without `pkgconf`. mailcatcher's transitive `sqlite3` gem builds a ve
- **geminabox** (`url-0040-geminabox`) — https://rubygems.org/gems/geminabox
  - `geminabox` gemspec has `executables: []` (Rack library + `gem inabox` plugin only). Generator assumed every gem has a bin matching gemName and emitted `shell_o
- **geminabox** (`url-0512-geminabox`) — https://github.com/geminabox/geminabox
  - `geminabox` gemspec has `executables: []` (Rack library + `gem inabox` plugin only). Generator assumed every gem has a bin matching gemName and emitted `shell_o
- **adamantite** (`url-0347-adamantite`) — https://rubygems.org/gems/adamantite

#### `cargo_lock_fallback` — cargo-package: retry without --locked when lock fails to compile

_std_cargo_args --locked breaks packages with broken Cargo.lock pins_

- **gobang** (`url-0392-gobang`) — https://github.com/TaKO8Ki/gobang
  - allbrew correctly classified gobang as cargo-package (Intel-only macOS release assets; no arm64/universal bottle → skip binary-release). Generated formula used 
- **oatmeal** (`url-0348-oatmeal`) — https://crates.io/crates/oatmeal
- **rainfrog** (`url-0345-rainfrog`) — https://github.com/achristmascarl/rainfrog

#### `npm_service_detection` — npm-package: detect service stanza from registry package README

_npm registry URLs skip README service detection (e.g. verdaccio)_

- **verdaccio** (`url-0368-verdaccio`) — https://npmjs.com/package/verdaccio
  - `lib/cli.ts:handleNpmPackage` for `https://npmjs.com/package/*` (and registry URLs) never fetches README/docs and never passes `serviceConfig` into `generateWit

## P1 — has fix-package patches (reconcile then requeue)

20 additional failed items with local `fix-packages/<slug>/patches/`.

| idx | agentName | slug | patches | fix class |
|-----|-----------|------|---------|-----------|
| 3 | `url-0003-pynastran` | pynastran | 1 | brew_fail / bin_name_mismatch (VERIFY BI |
| 66 | `url-0066-bear` | bear | 1 | brew_fail (generate succeeded, brew inst |
| 83 | `url-0083-trae-agent` | trae-agent | 2 | generate_fail |
| 93 | `url-0093-ugm` | ugm | 1 | brew_fail — go build fails on darwin due |
| 102 | `url-0102-echo` | echo | 2 | brew_fail → vendor_cdn_content_encoding  |
| 118 | `url-0118-hermes` | hermes | 2 | brew_fail (mas-itunes-search-fallback fa |
| 226 | `url-0226-emulsion` | emulsion | 1 | brew_fail (cask install fails: App sourc |
| 246 | `url-0246-nicotine-plus` | nicotine-plus | 2 | generate_fail |
| 255 | `url-0255-swiftpolyglot` | swiftpolyglot | 3 | brew_fail |
| 258 | `url-0258-pynastran` | pynastran | 1 | brew_fail / bin_name_mismatch (VERIFY BI |
| 293 | `url-0293-doedit` | doedit | 1 | verify_fail (brew install succeeded, str |
| 297 | `url-0297-mcphub` | mcphub | 1 | service_mismatch (bad service run argv — |
| 329 | `url-0329-krokiet` | krokiet | 1 | generate_fail (cask-app-release misclass |
| 331 | `url-0331-jockey` | jockey | 1 | brew_fail (VERIFY_OK=false, BIN_MISSING) |
| 377 | `url-0377-caliscope` | caliscope | 6 | brew_fail → linkage + bin verify for del |
| 403 | `url-0403-cq-editor` | cq-editor | 1 | verify_fail (BIN_HELP_FAIL / hung GUI bi |
| 506 | `url-0506-cq-editor` | cq-editor | 1 | verify_fail (BIN_HELP_FAIL / hung GUI bi |
| 537 | `url-0537-easyfind` | easyfind | 2 | brew_fail (mas-itunes-search-fallback fa |
| 729 | `url-0729-kosmik` | kosmik | 1 | brew_fail |
| 743 | `url-0743-depotdownloader` | depotdownloader | 1 | brew_fail (generate succeeded with bottl |

## Bulk requeue commands (P0 only, after fix ship)

```bash
bun tests/monitored-install-batch/batch-ops.mjs --requeue television  # idx 13 binary_release_bin_and_entry
bun tests/monitored-install-batch/batch-ops.mjs --requeue geminabox  # idx 40 gem_native_and_library
bun tests/monitored-install-batch/batch-ops.mjs --requeue toolong  # idx 52 binary_release_bin_and_entry
bun tests/monitored-install-batch/batch-ops.mjs --requeue elia  # idx 112 pip_resources_and_verify
bun tests/monitored-install-batch/batch-ops.mjs --requeue portdeck  # idx 126 github_prerelease_latest
bun tests/monitored-install-batch/batch-ops.mjs --requeue swift-outdated  # idx 133 binary_release_bin_and_entry
bun tests/monitored-install-batch/batch-ops.mjs --requeue gotify  # idx 191 core_name_collision_api
bun tests/monitored-install-batch/batch-ops.mjs --requeue agent-deck  # idx 279 install_script_noninteractive
bun tests/monitored-install-batch/batch-ops.mjs --requeue mailcatcher  # idx 282 gem_native_and_library
bun tests/monitored-install-batch/batch-ops.mjs --requeue rainfrog  # idx 345 cargo_lock_fallback
bun tests/monitored-install-batch/batch-ops.mjs --requeue adamantite  # idx 347 gem_native_and_library
bun tests/monitored-install-batch/batch-ops.mjs --requeue oatmeal  # idx 348 cargo_lock_fallback
bun tests/monitored-install-batch/batch-ops.mjs --requeue pyqt-openai  # idx 350 pip_resources_and_verify
bun tests/monitored-install-batch/batch-ops.mjs --requeue starship  # idx 352 install_script_noninteractive
bun tests/monitored-install-batch/batch-ops.mjs --requeue mlflow  # idx 358 pip_resources_and_verify
bun tests/monitored-install-batch/batch-ops.mjs --requeue nanobot  # idx 359 core_name_collision_api
bun tests/monitored-install-batch/batch-ops.mjs --requeue nanobot  # idx 359 pip_resources_and_verify
bun tests/monitored-install-batch/batch-ops.mjs --requeue verdaccio  # idx 368 npm_service_detection
bun tests/monitored-install-batch/batch-ops.mjs --requeue gobang  # idx 392 cargo_lock_fallback
bun tests/monitored-install-batch/batch-ops.mjs --requeue go2tv  # idx 404 binary_release_bin_and_entry
bun tests/monitored-install-batch/batch-ops.mjs --requeue swift-outdated  # idx 421 binary_release_bin_and_entry
bun tests/monitored-install-batch/batch-ops.mjs --requeue geminabox  # idx 512 gem_native_and_library
bun tests/monitored-install-batch/batch-ops.mjs --requeue chainlit  # idx 746 pip_resources_and_verify
```

