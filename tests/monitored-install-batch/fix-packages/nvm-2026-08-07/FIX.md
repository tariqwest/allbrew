# FIX: nvm (https://formulae.brew.sh/cask/nvm)

## Case
Case C variant — URL is `formulae.brew.sh/cask/nvm` but **no cask exists** (API 404).
Package lives in **homebrew/core** as formula `nvm` (Node version manager shell scripts).

## Agent judgment
- input: formulae-cask page (dead); real package = core formula
- generator after fix: **homebrew-formula** (cask→formula fallback on 404)
- service: **false** (shell-sourced version manager, not a daemon)
- prefer upstream `brew install nvm` for end users

## Failures observed
1. Classifies as `homebrew-cask` from URL path
2. `GET /api/cask/nvm.json` → HTTP 404 → generate_fail
3. (latent) bottle cellar `:${cellar}` double-colon when API already provides `:any_skip_relocation`

## Fixes (worktree validated, batch mode — not released)
1. **`generateHomebrewCask`**: on cask API 404, if formula API exists, fall back to `generateHomebrewFormula`
2. **`formatBottleCellar` / `renderBottleBlock`** in homebrew-formula (shared with pnpm fix): correct cellar symbols

## Validation
- Local worktree temp-tap generate → Formula/nvm.rb, `ruby -c` OK, cellar `:any_skip_relocation` (no `::`)
- Unit tests: bottle + classify cask URL

## Residual risk
Until release, released/VM allbrew still 404s on this URL. Catalog URL is mislabeled as cask.
