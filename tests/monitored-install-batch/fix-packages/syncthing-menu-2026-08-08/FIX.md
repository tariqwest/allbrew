# FIX: syncthing-menu (https://github.com/gtunes-dev/syncthing-menu)

## Failure class
**generate_fail** / wrong generator — release zip `SyncthingMenu-0.3.4.zip` not recognized as
macOS app asset → fell through to `source-build` formula (`make install` on GitHub tarball)
with garbage `service do run ["menu-bar", "agent", "("]` from README prose.

## Root cause
Same as **netbar** (`NetBar-1.2.1.zip`): `lib/utils.ts` `isAppAsset()` required a
mac/macos/osx/darwin token or `.app` in the filename. Single-platform macOS menu-bar
apps ship `ProductName-{semver}.zip` with no platform tag.

## Independent judgment
- **generator:** `cask-app-release`
- **app:** `Syncthing Menu.app`
- **service:** `false` (cask GUI; app manages Syncthing daemon itself)
- **version:** 0.3.4 (asset `SyncthingMenu-0.3.4.zip`, signed/notarized)

## Fix (batch mode — fix-package only, no release)
1. `isAppAsset` — accept versioned product zips without platform/arch (`SyncthingMenu-0.3.4.zip`
   / `NetBar-1.2.1.zip`); still reject linux/windows and source-named zips.
2. Shared with netbar-2026-08-07 fix-package (reconcile once for both).

## Local validation
```bash
bun -e 'import { isAppAsset } from "./lib/utils.ts"; console.log(isAppAsset("SyncthingMenu-0.3.4.zip"))'
# true
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://github.com/gtunes-dev/syncthing-menu" --name syncthing-menu \
  --tap "$(mktemp -d)" --verbose
# → Casks/syncthing-menu.rb, app "Syncthing Menu.app",
#   url …/v#{version}/SyncthingMenu-#{version}.zip
#   sha256 ff4180ab6cc029e8d47696c9c8c568e4b56e7fd1406b8281078fe136df72485e
```

## Residual risk
- VM bottle (≤0.0.24) still mis-classifies until parent merges/releases isAppAsset fix.
- Secondary: analyzer service prose matcher produced nonsense formula service from
  “menu-bar agent (LSUIElement)” — moot once cask path is chosen; still worth hardening.
