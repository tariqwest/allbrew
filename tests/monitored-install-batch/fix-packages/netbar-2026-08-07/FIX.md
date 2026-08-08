# FIX: netbar (https://github.com/mh-sudo/NetBar)

## Failure class
**generate_fail** / wrong generator — release zip `NetBar-1.2.1.zip` not recognized as
macOS app asset → fell through to `source-build` formula (`make install` on GitHub
tarball). Host `brew install` failed (expected isolation path uses VM).

## Root cause
1. `lib/utils.ts` `isAppAsset()` required a mac/macos/osx/darwin token or `.app` in the
   filename. Single-platform macOS menu bar apps often ship `Name-{semver}.zip` with no
   platform tag.
2. `lib/generators/cask-app-release.ts` URL templating used `.replace(version, …)` once,
   so `…/v1.2.1/NetBar-1.2.1.zip` became `…/v#{version}/NetBar-1.2.1.zip` (basename still
   hard-coded — breaks livecheck upgrades).
3. `templateReleaseUrl` used if/else so after tag rewrite remaining bare version in the
   asset basename was not templated (hardened here for shared use).

## Independent judgment
- **generator:** `cask-app-release`
- **app:** `NetBar.app` (menu bar GUI)
- **service:** `false` (cask; no brew services)
- **upstream:** also documents `brew tap mh-sudo/netbar && brew install --cask netbar`
  (ad-hoc signed; may need `xattr -cr` on first launch)

## Fix (batch mode — fix-package only, no release)
1. `isAppAsset` — accept versioned product zips without platform/arch (`NetBar-1.2.1.zip`);
   still reject linux/windows and source-named zips; keep short `mac`+arch as desktop apps.
2. `templateReleaseUrl` — after tag rewrite, replace remaining bare version substrings.
3. `cask-app-release` — use `templateReleaseUrl` instead of single `.replace`.

## Validation
```bash
bun test tests/unit/utils.test.ts --test-name-pattern "isAppAsset"
bun test tests/unit/generators/binary-release.test.ts --test-name-pattern "templateReleaseUrl"
CI=1 ALLBREW_NONINTERACTIVE=1 PATH="/tmp/fakebrew:$PATH" \
  bun run bin/allbrew.ts "https://github.com/mh-sudo/NetBar" --name netbar \
  --tap "$(mktemp -d)" --verbose
# → Casks/netbar.rb app "NetBar.app", url …/v#{version}/NetBar-#{version}.zip
# sha256 8e15790adc8ac0a486facff205eeea636c2291d1f9af593d991410973caf2063
```

## Residual risk
- Versioned product zip heuristic could false-positive rare CLI-only `tool-1.0.0.zip`
  without arch tags; cask generator still requires a real `.app` inside the archive.
- Ad-hoc signed app — Gatekeeper may block until `xattr -cr`.
- VM bottle still fails until parent merges/releases fix; official tap `mh-sudo/netbar` is
  the upstream-supported install path.
