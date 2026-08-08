# FIX: thaw-bar (https://github.com/stonerl/Thaw)

## Case
Assigned URL **stonerl/Thaw** is a stub README ("repository has moved to thaw-app/Thaw"). Product is a macOS menu bar GUI (`Thaw.app`).

## Expected
- generator: `cask-app-release`
- app: `Thaw.app`
- service: **false**

## Failure (stock / bottle)
Generates source-build HEAD `make install` formula against empty stub → brew install fails.

## Fix (Option A)
1. `detectGithubRepoRelocation` + CLI follow (max 2 hops)
2. `listReleases` + `pickReleaseWithAppAssets` when latest has no app assets (stable 1.2.0 is zip-only; prerelease has `Thaw.dmg`)

## Validation
Local worktree generate → `Casks/thaw-bar.rb` version `2.0.0-rc.2.1`.
