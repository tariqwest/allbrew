# FIX: comictagger (https://github.com/comictagger/comictagger)

## Failure class
**brew_fail** — generated cask URL 404s:
`Download failed: .../ComicTagger-v1.5.5-osx-10.15.7-x86_64.app.zip`
Real asset is `ComicTagger-1.5.5-osx-10.15.7-x86_64.app.zip` (no `v` before the version in the basename).

## Root cause
`lib/generators/cask-app-release.ts` templated URLs with:
```ts
bestAsset.url
  .replace(version, "#{version}")           // only first occurrence
  .replace(release.tagName, "v#{version}"); // injects "v" on remaining bare version
```
When tag is bare (`1.5.5` == version) and the version appears both in the release path segment and the asset name, the first `replace` rewrites only the path segment, then the second rewrites the asset name as `ComicTagger-v#{version}-…`.

`binary-release.ts` already has correct `templateReleaseUrl()` (whole-tag first, `split/join` all occurrences, preserve real tag prefix).

## Independent judgment (Phase 0.5)
- **input:** github-repo `comictagger/comictagger`
- **agent preferred generator:** `pip-package` (`pip3 install comictagger[GUI]` on PyPI; CLI + PyQt GUI)
- **codebase generator:** `cask-app-release` (macOS `.app.zip` on latest release) — acceptable for desktop install path
- **service:** `false` (desktop GUI + one-shot CLI; no daemon)
- **upstream Homebrew:** official cask `comictagger` exists but is **deprecated** (Gatekeeper; disable 2026-09-01). Token collision renames allbrew cask to `comictagger-comictagger` when brew is real.

## Fix (batch mode — fix-package only, no release)
`lib/generators/cask-app-release.ts`:
- Import and use `templateReleaseUrl(url, version, tagName)` from `binary-release.ts`.

Unit regression:
- ComicTagger bare tag + versioned `.app.zip` → URL uses `ComicTagger-#{version}-…` never `ComicTagger-v#{version}-…`.

## Validation
```bash
bun test ./tests/unit/generators/cask-app-release.test.ts   # 87 pass incl. ComicTagger
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://github.com/comictagger/comictagger" --name comictagger \
  --tap "$(mktemp -d)" --verbose
# url ".../ComicTagger-#{version}-osx-10.15.7-x86_64.app.zip"
```

## VM (allbrew 0.0.24 bottle)
`homeserver` install still 404s on `ComicTagger-v1.5.5-…` until bottle is released/upgraded with this fix.

## Residual risk
- Intel-only 2022 macOS app zip may need Rosetta; Gatekeeper/quarantine like deprecated core cask.
- Preferring cask over pip means no `[GUI]` extras path for CLI-only users; pip path still valid product choice.
- Stale GitHub release (1.5.5) may lag PyPI alphas if they resume shipping.
- Token collision → long name `comictagger-comictagger` on real brew.
