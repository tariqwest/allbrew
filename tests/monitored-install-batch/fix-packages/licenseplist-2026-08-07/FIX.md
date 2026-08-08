# Fix package: licenseplist

## URL
https://github.com/mono0926/LicensePlist

## Failure class
`generate_fail`

## Mode
code (patch)

## Summary
Swift CLI (`license-plist`) for iOS Settings.bundle license plists. Catalog source `in_mint`. Service: **false** (one-shot CLI). Already in **homebrew/core** as `licenseplist`.

## Root cause
1. Release ships `LicensePlistBinary-macos.artifactbundle.zip` (SwiftPM binary target) and `license-plist.zip` (portable CLI).
2. `isAppAsset()` treated `*macos*.artifactbundle.zip` as a desktop app zip (mac token, no CPU arch) → routed to `cask-app-release`.
3. Cask generator failed: `No .app bundle found inside release asset …artifactbundle.zip`.
4. After artifactbundle exclusion, README path hit unguarded `brew install licenseplist` select (prompt_hang risk) and/or bad `install.sh` (sudo/jq) install-script formula.

## Fix
1. **`lib/utils.ts`**: `isAppAsset` and `isArchiveBinaryAsset` reject `artifactbundle`; add `isUntaggedMacBinaryAsset` for portable CLI zips without arch tags (e.g. `license-plist.zip`).
2. **`lib/cli.ts`**: include untagged mac binary assets in release binary routing; non-interactive skip upstream brew offer → continue custom formula.
3. **`lib/generators/binary-release.ts`**: if no arch-tagged assets, use untagged mac binary zip(s) as macos arm+intel URLs.
4. **Unit tests** for artifactbundle rejection and untagged zip as binary.

## Local validation (worktree)
- Generator: **binary-release**
- Formula: **licenseplist-tap** (core name collision)
- Version: **3.28.0**, asset `license-plist.zip`
- Symlinks: `license-plist` + `licenseplist`
- Service: none
- Host `brew install` of temp-tap formula succeeded (uninstalled after); **VM path still required** for skill success criteria with stock guest allbrew until reconcile/release.

## Agent deltas
| Field | Agent | Codebase (fixed) |
|-------|-------|------------------|
| generator | mint-package (catalog) | binary-release (release zip preferred) |
| service | false | false |
| binName | license-plist | license-plist |
| formulaName | licenseplist | licenseplist-tap (core collision) |

Mint remains valid alternate; binary-release is better for bottled install without mint dep.

## Residual risk
- Guest brew-installed allbrew without this patch still hits generate_fail until release/reconcile.
- Homepage from GitHub API is a SlideShare URL (upstream metadata).
- `portable_licenseplist.zip` coexists; ranking picks shorter `license-plist.zip`.
- Preferring mint over binary when catalog says `in_mint` is product polish, not a failure.

## No release (child policy)
Option A only — fix-package exported for parent reconcile.
