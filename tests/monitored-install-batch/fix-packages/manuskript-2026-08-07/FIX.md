# FIX: manuskript (https://github.com/olivierkes/manuskript)

## Failure class
**brew_fail / generate wrong shape** — latest GitHub release has no macOS app assets; allbrew fell through to makefile → `source-build` formula with `make PREFIX=… install` (makefile has no install target).

## Product
- Desktop **PyQt5 GUI** writer tool
- macOS ships as `manuskript-*-osx.dmg` (present on 0.16.1 / 0.16.0; **missing on latest 0.17.0** which is deb/rpm/windows only)
- Official homebrew/cask `manuskript` exists (0.16.1) but is `disable!` (fails_gatekeeper) 2026-09-01
- **service: false**

## Root cause
`handleGithubRepo` only inspected **latest** release assets. When none matched `isAppAsset` / mac binaries, it continued to README/repo-file heuristics and treated `makefile` as source-build.

## Fix (batch — Option A, no release)
1. `lib/github.ts`: `listReleases`, `pickReleaseWithAppAssets` (prefer newest stable non-draft with app assets; fall back to prerelease).
2. `lib/cli.ts`: when latest has no mac app/binary path, scan recent releases and generate **`cask-app-release`** from the older tag’s DMG.
3. Unit tests: `tests/unit/github-release-pick.test.ts`.

## Validation (local, temp tap)
```text
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  https://github.com/olivierkes/manuskript --name manuskript --tap "$(mktemp -d)" --verbose
# → Found macOS app assets on older release 0.16.1: manuskript-0.16.1-osx.dmg
# → Casks/olivierkes-manuskript.rb (token collision with homebrew/cask)
# Host brew install --cask succeeded (then uninstalled for isolation)
```

## Residual
- Cask token becomes `olivierkes-manuskript` due to homebrew/cask collision (expected).
- Livecheck still `:github_latest` may not find a future osx.dmg until upstream ships one again.
- App is Intel/Rosetta + Gatekeeper caveats (same as official cask).
- **VM batch allbrew bottle lacks this patch until parent reconcile** — re-run vm-install-one after apply.
