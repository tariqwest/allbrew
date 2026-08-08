# Fix: pictogram (https://pictogramapp.com)

## Failure
- VM `allbrew` 0.0.24: Classified `unknown` → webview discovery found CSS/fonts only →
  `Unable to automatically handle URL (non-interactive)`.
- Product already exists as official **homebrew/cask `pictogram`** (homepage https://pictogramapp.com/).

## Root cause
Homepage marketing pages without direct archive links in static HTML (download via
`<form action="Pictogram.zip">`) do not reclassify. Missing **Case C**: token guess
from slug/host first label (`pictogram`) → formulae.brew.sh cask API → if cask
homepage registrable domain equals page host, adopt official cask Ruby.

## Fix (Option A)
1. `matchOfficialCaskByHomepage` in `lib/generators/homebrew-cask.ts`
2. Call it from `lib/cli.ts` before page discovery when type is `unknown`
3. Unit test `tests/unit/generators/homebrew-cask-homepage.test.ts`

## Local validation
- `CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts https://pictogramapp.com --name pictogram --tap $TMP --verbose`
  → Matched official homebrew/cask pictogram; wrote cask with Sparkle livecheck 0.1,13
- Service: false (cask GUI) — matches agent expectation
- VM install with bottle 0.0.24 still fails until parent reconciles + releases

## Residual
- Secondary: page-discover should score `form[action$=.zip]` even without Case C
- Host brew may have been polluted by local temp-tap auto-install path
