# Fix: Mission Control Plus (releases-only GitHub → cask)

## URL
https://github.com/ronyfadel/MissionControlPlusReleases

## Failure
`isAppAsset()` only recognized `.dmg` / macOS `.zip`. Latest release ships a single
`Mission.Control.Plus.tgz` containing `Mission Control Plus.app`. allbrew fell through
to `source-build` formula (`make install` against the GitHub source tarball) and
`brew install` failed.

## Case C note
Official Homebrew cask already exists: `brew install --cask mission-control-plus`
(same version/sha256/asset URL). Prefer that for end users. Generator still must
classify this release shape correctly for dogfood / tap generation.

## Root cause
1. `lib/utils.ts` `isAppAsset` — no `.tgz`/`.tar.gz` path for product-style names.
2. `lib/generators/cask-app-release.ts` `detectAppNameFromAsset` — only inspected DMG/ZIP
   for `.app` names; tar listings need nested `.app/` path parsing.

## Fix
1. Treat product-style dotted tar names (`Mission.Control.Plus.tgz`) as app assets when
   they lack linux/windows/cpu-arch tags; keep rejecting CLI tarballs (`foo-darwin-arm64.tgz`).
2. Export `listArchiveEntries` from `archive-inspector.ts`.
3. Extend `detectAppNameFromAsset` to list tar entries and resolve `Foo.app`.

## Validation
- Unit: `isAppAsset("Mission.Control.Plus.tgz") === true`
- Local `generateCaskAppRelease` → cask with sha256
  `b791fc0f174c1c0082176178c5a1671841fc0a3c90de9d5cb9d13ed9c21cc765` matching official cask,
  `app "Mission Control Plus.app"`, version `1.24`.
- Service: false (GUI cask) — match.

## Residual risk
- Dotted product heuristic could false-positive rare multi-dot CLI tarballs without arch tags.
- Homepage from repo is GitHub; official cask uses fadel.io (cosmetic).
- Batch mode: no release; VM install still uses unfixed brew bottle until parent merges.
