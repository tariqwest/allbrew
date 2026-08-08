# Fix package: swift-outdated

## URL
https://github.com/kiliankoe/swift-outdated

## Failure class
`generate_fail`

## Mode
code (patch)

## Summary
Swift CLI (`swift outdated` subcommand). Service: **false** (one-shot dependency checker).
Already in **homebrew/core** (`brew install swift-outdated`). Releases ship
`swift-outdated-VERSION-macos.zip` + `…-linux.zip` (bare CLI binary, not .app).

## Root cause
1. `isAppAsset()` treats untagged `*-macos.zip` as desktop app assets.
2. Routing always chose `cask-app-release`.
3. Cask generator inspected the zip, found no `.app`, threw
   `No .app bundle found inside release asset …; not generating a cask`.
4. README path would also hit unguarded brew-offer `select` (prompt_hang risk).

## Fix
1. **`lib/utils.ts`**: `matchLoosePlatformArch`, `isReclassifiablePlatformCliZip`;
   reject `artifactbundle` in `isAppAsset`.
2. **`lib/cli.ts`**: when macos+linux platform zips exist without DMG/`.app` in the
   name, route to **binary-release** with `reclassifyPlatformZips: true`; cask path
   falls back to binary on no-.app; noninteractive brew offer → continue.
3. **`lib/generators/binary-release.ts`**: accept reclassified platform zips as
   macosUniversal / linuxIntel; template versioned entrypoint paths with `#{version}`.

## Local validation (worktree)
- Generator: **binary-release**
- Formula: **swift-outdated-tap** (core name collision)
- Version: **0.15.3**, asset `swift-outdated-#{version}-macos.zip`
- Service: none
- Host auto `brew install` of temp-tap formula succeeded (uninstalled after)

## Residual risk
- Guest brew-installed allbrew **0.0.24** without this patch still hits generate_fail
  until release/reconcile.
- Agent preferred `spm-package`; binary-release is better for prebuilt bottles.
- Prefer core `brew install swift-outdated` for end users.

## No release (child policy)
Option A only.
