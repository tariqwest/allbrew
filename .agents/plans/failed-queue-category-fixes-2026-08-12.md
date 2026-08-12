# Failed-queue category fixes — 2026-08-12

Plan for product fixes that unlock many of the remaining **failed** monitored-install-batch items (after unfixable rows were marked `blocked`/`skipped`).

Companion docs:
- Requeue list: [`failed-queue-requeue-list-2026-08-12.md`](./failed-queue-requeue-list-2026-08-12.md)
- Assessment (session): failed classification under `tests/monitored-install-batch/state/failed-classification-2026-08-12.json` if present

## Status after disposition

| Status | Count (approx) |
|--------|----------------|
| failed remaining | ~74 |
| blocked (auth/env) | 6 |
| skipped (unfixable/catalog) | +12 this wave |

## GitHub issues

| # | Issue |
|---|--------|
| [#1](https://github.com/tariqwest/allbrew/issues/1) | install-script noninteractive flags and BIN_DIR |
| [#2](https://github.com/tariqwest/allbrew/issues/2) | GitHub releases/latest 404 → latest prerelease |
| [#3](https://github.com/tariqwest/allbrew/issues/3) | homebrew/core name collision via API |
| [#4](https://github.com/tariqwest/allbrew/issues/4) | binary-release entrypoint, bin naming, CLI zip routing |
| [#5](https://github.com/tariqwest/allbrew/issues/5) | pip-package resources, wheel selection, verify policy |
| [#6](https://github.com/tariqwest/allbrew/issues/6) | gem-package native depends_on + library mode |
| [#7](https://github.com/tariqwest/allbrew/issues/7) | cargo-package retry without --locked |
| [#8](https://github.com/tariqwest/allbrew/issues/8) | npm registry service detection from README |

## P0 tickets (category fixes)

### 1. install-script noninteractive matrix — [#1](https://github.com/tariqwest/allbrew/issues/1)
- **Files:** `lib/templates/formula/install-script.ts`, install-script generator, analyzer README flag detection
- **Behavior:** Detect `--non-interactive` / `--yes` / `FORCE=1` / pre-create `BIN_DIR` from script help/README; pass args + env into formula `system` invocation
- **Unlocks:** agent-deck, starship, similar curl|sh installers
- **Tests:** unit template parity + one install-script fixture with FORCE

### 2. GitHub prerelease when latest 404 — [#2](https://github.com/tariqwest/allbrew/issues/2)
- **Files:** `lib/github.ts` (or release resolution), binary-release / cask-app-release paths
- **Behavior:** If `/releases/latest` 404 and prereleases exist, use newest prerelease (opt-in or automatic with log)
- **Unlocks:** portdeck (and other prerelease-only repos)
- **Tests:** mock Octokit latest 404 + prerelease list

### 3. Core formula name collision via API — [#3](https://github.com/tariqwest/allbrew/issues/3)
- **Files:** `lib/utils.ts` / whatever implements `isHomebrewCoreFormulaName`
- **Behavior:** On API-only Homebrew (batch VMs), query `formulae.brew.sh` or `brew info --json` instead of only Formula tree on disk
- **Unlocks:** nanobot, gotify, future core collisions
- **Tests:** mock API hit when Formula path missing

### 4. binary-release bin path + entrypoint + CLI zip routing — [#4](https://github.com/tariqwest/allbrew/issues/4)
- **Files:** `lib/generators/binary-release.ts`, archive entrypoint picker, `isAppAsset` / CLI zip helpers
- **Behavior:**
  - Template version in install symlink (`#{version}` not hardcode)
  - Refuse LICENSE/README as entrypoint
  - Treat multi-platform `*-macos*.zip` / arch-tagged zips as CLI when no `.app`
- **Unlocks:** television, go2tv, toolong, swift-outdated
- **Tests:** bin-name-matrix + archive fixture

### 5. pip-package completeness + verify — [#5](https://github.com/tariqwest/allbrew/issues/5)
- **Files:** `lib/generators/pip-package.ts`, resource graph, verify path
- **Behavior:** No bad wheel fallback; transitive resources for undeclared deps; relink console_scripts; GUI packages skip `--help` hang
- **Unlocks:** elia, chainlit, mlflow, pyqt-openai (partial)
- **Tests:** pip resource unit + verify policy

### 6. gem-package native deps + library verify — [#6](https://github.com/tariqwest/allbrew/issues/6)
- **Files:** `lib/generators/gem-package.ts`
- **Behavior:** `depends_on` for known native gems (pkgconf/sqlite); empty `executables:` → library verify (`gem list` / require)
- **Unlocks:** mailcatcher, geminabox, adamantite
- **Tests:** gem metadata parse + empty exec fixture

### 7. cargo `--locked` fallback — [#7](https://github.com/tariqwest/allbrew/issues/7)
- **Files:** cargo formula template / generator
- **Behavior:** On lock compile failure, retry without `--locked` or document opt-out
- **Unlocks:** gobang, oatmeal, rainfrog (likely)
- **Tests:** formula string contains conditional or documented env

### 8. npm registry service detection — [#8](https://github.com/tariqwest/allbrew/issues/8)
- **Files:** `lib/cli.ts` handleNpmPackage
- **Behavior:** Fetch package README/description for service hints (like GitHub path)
- **Unlocks:** verdaccio
- **Tests:** npm fixture with service-like README

### 9. setapp-bootstrap install path (product, auth still external)
- **Files:** `lib/setapp-bootstrap.ts`
- **Behavior:** Install setapp-cli via tap name, not `brew install --formula /path.rb`
- **Unlocks:** Setapp *generation* path (full green still needs Setapp account)

### 10. MAS Mac ID preference
- **Files:** MAS matching / page-discover
- **Behavior:** Prefer `mt=12` / mac-software; no auto-pick on score ties across iOS/Mac
- **Unlocks:** correct Bear/Paste generation when Apple ID available; reduces wrong casks

## Implementation order

1 → 3 → 2 → 4 → 6 → 5 → 7 → 8 → 9 → 10

(install-script + core collision + prerelease unblock the most requeues with least surface area)

## Out of scope (do not fix in product)

- Setapp full install without credentials → remain **blocked**
- MAS without CI Apple ID → remain **blocked**
- Docker Desktop / Nix multi-user → remain **skipped**
- Official core cask marketing URLs that 404 → remain **skipped**

## Verification

After each P0 lands: `bun run check`, targeted unit tests, optional `vm-install-one` for one unlock slug from the requeue list, then batch requeue commands in the companion doc.
