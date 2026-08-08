# FIX: zyp (https://getzyp.com)

## Failure class
**generate_fail / brew_fail** — page discovery chose Linux portable
`/download/Zyp-1.3.0-arm64.tar.gz` (archive/source-build formula) instead of
macOS `Zyp-1.3.0-arm64.dmg` cask. Generated cmake formula cannot build an
Electron app bundle; `brew install` fails.

## Root cause
Homepage routes macOS downloads through `/thanks.html?arch=…` (JS starts the
real `/download/Zyp-*.dmg`). Static HTML **hrefs** only expose Linux
AppImage/deb/rpm/tar.gz under `/download/`. DMG names appear as **visible text**
(`Zyp-1.3.0-arm64.dmg · 109 MB`) and in SHA tables, not as absolute `https://…dmg`
links. `extractCandidatesFromHtml` only considered href attrs + absolute bare
URLs, so no cask-dmg candidates existed. arm64 `.tar.gz` scored 100 and won.

## Independent judgment
- **generator:** `cask-app` (desktop Electron GUI → DMG → `Zyp.app`)
- **service:** `false` (cask only)
- **version:** 1.3.0 (JSON-LD + filenames)
- **artifact:** `https://getzyp.com/download/Zyp-1.3.0-arm64.dmg` (SHA-256
  `944c8af87dc2ae35fd5fab3f91a1c12f26a92d8253198b26d7644aed16a939c4`)
- Homepage also documents upstream tap: `brew install --cask khaweryounas/zyp/zyp`

## Fix (batch mode — fix-package only, no release)
`lib/page-discover.ts` `extractCandidatesFromHtml`:
1. Extract relative `/download|downloads|releases|files|dist|get/….(dmg|pkg|…)`
   paths from HTML text.
2. Extract bare `*.dmg` / `*.pkg` filenames and resolve against common prefixes
   (`/download/`, `/downloads/`, …).
3. When any `.dmg` candidate exists, penalize non-mac `.tar.gz` (linux portable).

Unit test: getzyp-style fixture prefers arm64/x64 dmg over tar.gz/AppImage.

## Validation
```bash
bun test tests/unit/page-discover.test.ts   # 17 pass
# discovery log (pre-hash download):
# Resolved … cask-dmg → https://getzyp.com/download/Zyp-1.3.0-arm64.dmg
```
Full local `allbrew` generate/hash of the ~109MB DMG is network-bound (~20KB/s
from this host). VM install may fare better.

## Residual risk
- Bare-filename prefix fan-out creates extra candidates; scoring still prefers
  `/download/` + arm64.
- Not notarized; first-launch quarantine expected.
- Competing official third-party tap cask may be preferred for users.
