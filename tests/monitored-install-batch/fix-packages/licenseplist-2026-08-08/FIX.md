# Fix package: licenseplist

## URL
https://github.com/mono0926/LicensePlist

## Failure class
`generate_fail`

## Mode
code (patch)

## Summary
Swift CLI (`license-plist`) for iOS Settings.bundle license plists. Service: **false** (one-shot CLI). Already in **homebrew/core** as `licenseplist`.

## Root cause
1. Release ships `LicensePlistBinary-macos.artifactbundle.zip` (SwiftPM binary target) and `license-plist.zip` / `portable_licenseplist.zip` (portable CLI).
2. `isAppAsset()` treated `*macos*.artifactbundle.zip` as a desktop app zip → routed to `cask-app-release`.
3. Cask generator failed: `No .app bundle found inside release asset …artifactbundle.zip`.
4. Untagged `license-plist.zip` was not routed as a binary asset (no arch token in name).

## Fix
1. **`lib/utils.ts`**: reject `artifactbundle` in `isAppAsset` / `isArchiveBinaryAsset`; add `isUntaggedMacBinaryAsset`.
2. **`lib/cli.ts`**: include untagged mac binary assets in release binary routing; non-interactive skip upstream brew offer → continue custom formula.
3. **`lib/generators/binary-release.ts`**: if no arch-tagged assets, use shortest untagged mac binary zip as macos arm+intel URLs.
4. **Unit tests** for artifactbundle rejection and untagged zip as binary.

## Local validation (worktree)
- Generator: **binary-release**
- Formula: **licenseplist-tap** (core name collision)
- Version: **3.28.0**, asset `license-plist.zip`
- Symlinks: `license-plist` + `licenseplist`
- Service: none
- Local temp-tap generate + host `brew install` succeeded (uninstalled after). VM success still requires guest allbrew with this patch (reconcile/release).

## No release (child policy)
Option A only — fix-package exported for parent reconcile.
