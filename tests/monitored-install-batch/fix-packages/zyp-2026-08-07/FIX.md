# FIX: zyp (https://getzyp.com)

## Failure class
**generate_fail** — page discovery chose Linux portable
`/download/Zyp-1.3.0-arm64.tar.gz` (archive/source-build cmake formula) instead of
macOS `Zyp-1.3.0-arm64.dmg` cask.

## Root cause
Homepage routes macOS downloads through `/thanks.html?arch=…` (JS starts the
real `/download/Zyp-*.dmg`). Static HTML **hrefs** only expose Linux
AppImage/deb/rpm/tar.gz under `/download/`. DMG names appear as **visible text**
(`Zyp-1.3.0-arm64.dmg · 109 MB`) and in SHA tables, not as absolute `https://…dmg`
links. Without bare-filename extraction, arm64 `.tar.gz` scored 100 and won.

## Independent judgment
- **generator:** `cask-app` (desktop GUI → DMG → `Zyp.app`)
- **service:** `false`
- **artifact:** `https://getzyp.com/download/Zyp-1.3.0-arm64.dmg`
- Site also documents `brew install --cask khaweryounas/zyp/zyp` (third-party)

## Fix (batch mode — fix-package only, no release)
`lib/page-discover.ts` `extractCandidatesFromHtml`:
1. Extract relative `/download|…/*.(dmg|pkg|…)` paths from HTML text.
2. Extract bare `*.dmg` / `*.pkg` filenames and resolve against common prefixes.
3. When any `.dmg` candidate exists, penalize non-mac `.tar.gz` (linux portable).

Unit: 17 pass including getzyp-style fixture. Live HTML picks arm64 dmg score 155.

## Residual risk
- Bare-filename prefix fan-out creates extra candidates; scoring prefers `/download/` + arm64.
- Not notarized; first-launch quarantine expected.
- VM still runs released allbrew (0.0.24) without this fix until release.
