# FIX: supersonic (https://github.com/dweymouth/supersonic)

## Failure class
**generate_fail** — release assets misclassified: mac desktop zips ignored; only Linux
binaries selected → `binary-release` threw "No macOS binary assets found in release".

## Root cause
1. `isAppAsset()` treated **any** cpu-arch-tagged mac zip as a CLI binary archive.
   Supersonic ships desktop `.app` zips named `Supersonic-{ver}-mac-arm64.zip` /
   `…-mac-x64.zip` (short platform token `mac`, not `darwin`/`macos`).
2. `matchAssetToArch()` lacked short-`mac` patterns, so those zips also failed the
   binary-release arch filter (only `linux-x64` assets matched).
3. `templateReleaseUrl()` replaced the `v{ver}` path segment but left bare `{ver}` in
   the asset basename (`Supersonic-0.22.0-mac-arm64.zip`), breaking livecheck upgrades.

## Independent judgment
- **generator:** `cask-app-release` (GitHub release → Supersonic.app zip)
- **app:** GUI desktop client for Subsonic/Jellyfin
- **service:** `false` (cask only; no brew services)
- **upstream:** also documents `brew tap supersonic-app/supersonic && brew install supersonic`
  (unsigned; needs quarantine xattr)

## Fix (batch mode — fix-package only, no release)
1. `lib/utils.ts` `isAppAsset` — keep rejecting `darwin`/`macos`/`osx`+arch CLI zips;
   accept short `mac`+arch `.zip` as desktop app assets.
2. `lib/utils.ts` `archPatterns` — add `mac-arm64` / `mac-x64` / `mac-universal` patterns.
3. `lib/generators/cask-app-release.ts` — `pickBestAppReleaseAsset()` prefers DMG then
   host-arch zip.
4. `lib/generators/binary-release.ts` `templateReleaseUrl` — after tag rewrite, still
   replace remaining bare version substrings in the URL.

Unit tests cover Supersonic asset names and URL templating.

## Validation
```bash
bun test tests/unit/utils.test.ts --test-name-pattern "short mac|isAppAsset"
bun test tests/unit/generators/binary-release.test.ts --test-name-pattern "templateReleaseUrl"
CI=1 ALLBREW_NONINTERACTIVE=1 PATH="/tmp/fakebrew-supersonic:$PATH" \
  bun run bin/allbrew.ts "https://github.com/dweymouth/supersonic" \
  --name supersonic --tap "$(mktemp -d)" --verbose
# → Casks/supersonic.rb with app "Supersonic.app", url …/Supersonic-#{version}-mac-arm64.zip
```

## Residual risk
- Single-arch URL (host arch only); Intel Macs need the x64 asset (no `on_arm`/`on_intel`
  multi-url cask yet).
- App is unsigned — users may need `xattr -r -d com.apple.quarantine`.
- VM bottle still fails until fix is released; official tap `supersonic-app/supersonic`
  remains the upstream-supported install path.
