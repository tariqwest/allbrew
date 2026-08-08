# FIX: proxyman (https://formulae.brew.sh/cask/proxyman)

## Case
**Case C / homepage-download-test-cases** — official Homebrew Formulae cask page for Proxyman (HTTP debugging GUI proxy).

## Phase 0.5 judgment
| Field | Value |
|-------|--------|
| inputShape | `homebrew-cask-page` (`formulae.brew.sh/cask/proxyman`) |
| expected.generator | `homebrew-cask` |
| expected.package/app | `proxyman` / `Proxyman.app` |
| service | **false** (GUI cask; proxy lives inside `.app`, not formula `service do`) |
| Case C | Prefer official `homebrew/cask` token; **do not** monorepo-source-build homebrew-cask |

API facts (2026-08-07): version `6.14.0,61400`, DMG `https://download.proxyman.com/61400/Proxyman_6.14.0.dmg`, `auto_updates`, artifacts `Proxyman.app` + `proxyman-cli`.

## Failures observed

### A. Released allbrew **0.0.24** (VM homeserver via `vm-install-one.mjs`)
1. Classified as **`unknown`** (no `HOMEBREW_CASK_RE` path in bottle).
2. page-discover found official DMG + link to `Homebrew/homebrew-cask/.../proxyman.rb`.
3. Resolved `cask-dmg` → vendor DMG.
4. Collision rename: **`proxyman` → `proxyman-tap`** ("collides with homebrew/cask").
5. Generated thin **cask-app** Ruby (no `version`, weak livecheck, no uninstall/zap).
6. `brew install --cask proxyman-tap` failed: `undefined method 'latest?' for nil` (Homebrew cask upgrade path; incomplete cask metadata).
7. `EXIT_CODE=1`, `VERIFY_OK=false`.

### B. Current **main** (local temp tap, `CI=1 ALLBREW_NONINTERACTIVE=1`)
```text
Classified as: homebrew-cask
Generated: .../Casks/proxyman.rb   # official homebrew-cask Ruby (version, sparkle, zap, …)
brew install --cask proxyman → success
```
Classifier unit tests already cover formulae.brew.sh cask pages (`formulae.brew.sh official pages > classifies cask pages as homebrew-cask`).

## Root cause
- **0.0.24 bottle** predates / does not ship the `homebrew-cask` generator + `formulae.brew.sh/cask/:token` classifier (commit `5e7a04e` on main).
- Secondary (0.0.24 only): when discovery falls through to vendor DMG, name collision renames away from the official token instead of **preferring Case C official cask** — produces a worse duplicate.

## Fix status (batch mode — no release)
**Already on main** — no additional product patches required for Proxyman Case C.

| Layer | Status |
|-------|--------|
| `lib/classifier.ts` `HOMEBREW_CASK_RE` | on main |
| `lib/generators/homebrew-cask.ts` | on main |
| unit tests for cask page classify | on main (pass) |
| Released bottle | **still 0.0.24** → VM fails until parent releases + VM upgrades |

Optional future hardening (not required for Proxyman once bottle catches main): if page-discover lands on a vendor DMG whose preferred name is `isHomebrewCaskToken`, prefer `homebrew-cask` over minting `*-tap` cask-app.

## Validation
```bash
# main source
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://formulae.brew.sh/cask/proxyman" --name proxyman --tap "$(mktemp -d)" --verbose
# → homebrew-cask, official proxyman.rb

bun test tests/unit/classifier.test.ts
# → formulae.brew.sh official pages (cask) pass

# VM bottle 0.0.24 (this run)
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url "https://formulae.brew.sh/cask/proxyman" --name proxyman
# → generate_fail/brew_fail until release
```

## Residual risk
- Batch VM remains red until allbrew **>0.0.24** is released and `ensureAllbrew` upgrades the guest.
- Host had Proxyman already under `/opt/homebrew/Caskroom` (pre-existing / local generate auto-install); not used as success criterion.
- Official cask includes privileged helper + keychain uninstall steps; zap is broad (`~/.proxyman*`).
