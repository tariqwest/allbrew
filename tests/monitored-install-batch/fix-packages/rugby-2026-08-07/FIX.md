# Fix package: rugby

## URL
https://github.com/swiftyfinch/Rugby

## Failure class
`brew_fail` (empty install-script) / generate wrong strategy

## Mode
code (patch)

## Summary
Swift CLI for CocoaPods caching. Releases ship bare arch zips (`arm64.zip`, `x86_64.zip`, `universal.zip`). Service: **false**.

## Root cause
1. `matchAssetToArch` only matched OS+arch tokens (`darwin.*arm64`). Bare `arm64.zip` / `x86_64.zip` / `universal.zip` returned null.
2. `cli.ts` filters binaries with `isBinaryAsset && matchAssetToArch` → "No recognized binary or app assets".
3. README install-script path generated a formula for `install.sh` that installs into `~/.rugby/clt`, not Cellar → `brew install` **Empty installation**.

## Fix
`lib/utils.ts` `archPatterns()`: treat bare arch filenames as macOS (`^(arm64|aarch64)`, `^(x86_64|amd64|x64)`, `^universal`) with unit tests.

## Local validation (worktree)
- Generator: **binary-release**
- Version: **2.10.3**, asset `universal.zip` for arm+intel
- Service: none
- Host path install succeeded then uninstalled; VM path still required for skill success with stock guest allbrew until reconcile/release.

## No release (child policy)
Option A only — fix-package exported for parent reconcile.
