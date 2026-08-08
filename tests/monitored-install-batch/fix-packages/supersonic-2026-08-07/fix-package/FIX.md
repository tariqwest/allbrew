# supersonic — generate_fail (mac short-token app zips)

## Failure class
`generate_fail` — brew allbrew 0.0.24 routes GitHub release to `binary-release` and errors:
`No macOS binary assets found in release (Linux-only binaries cannot be installed with Homebrew on macOS)`.

## Root cause
Release assets use the Electron/Fyne naming pattern `Product-VERSION-mac-arm64.zip` / `…-mac-x64.zip` (contains `Supersonic.app`).

`isAppAsset()` on 0.0.24 / main HEAD rejects any macOS zip that also has a CPU arch token (`arm64`/`x64`), assuming CLI binaries (`gogs_*_darwin_amd64.zip`, `tool-macos-x64.zip`). That incorrectly drops all Supersonic mac app zips, leaving only Linux `.tar.xz` binary assets.

## Fix (patch mode)
1. **`archPatterns()` / `matchAssetToArch`**: recognize short platform token `mac` + arch (`mac-arm64`, `mac-x64`, `mac-universal`).
2. **`isAppAsset()`**: still reject arch-tagged `darwin`/`macos`/`osx` CLI zips, but treat short `mac` + arch `.zip` as desktop app assets; also allow product-style dotted `.tgz` app archives.
3. **Unit tests** for Supersonic asset names and dotted product tarballs.

## Expected outcome
- Generator: `cask-app-release`
- Cask: `supersonic` → `app "Supersonic.app"` from `Supersonic-#{version}-mac-arm64.zip` (arm host)
- `service`: false (GUI desktop client)

## Residual risk
- App is unnotarized; README requires `xattr -d com.apple.quarantine`.
- Upstream also publishes `brew tap supersonic-app/supersonic` — allbrew may duplicate that tap intentionally when asked to generate.
- HEAD cask URL templating still only replaces first `version` occurrence; prefer also landing `templateReleaseUrl` from WIP for livecheck-friendly URLs (optional follow-up).

## Validation (worktree)
- `bun test tests/unit/utils.test.ts --test-name-pattern isAppAsset|matchAssetToArch` → pass
- `CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts https://github.com/dweymouth/supersonic --name supersonic --tap $TMP --verbose` → cask written, prefer App Cask
- VM 0.0.24 without patch: EXIT_CODE=1 (documented in vm-install.log)
