# FIX: localsend (https://formulae.brew.sh/cask/localsend)

## Failure class
**generator delta (warn)** on bottle **0.0.24** — install still succeeded via discovery fallback.

On allbrew **0.0.24** (VM homeserver):

1. Classifies `https://formulae.brew.sh/cask/localsend` as **`unknown`** (no `HOMEBREW_CASK_RE` in bottle).
2. Page-discover picks GitHub release DMG → **cask-dmg**.
3. Name collides with homebrew/cask → renames to **`localsend-tap`**.
4. Generates thin cask (poor desc, header_match livecheck) instead of official mirrored Ruby.
5. `brew install --cask localsend-tap` + app verify **succeed** (VERIFY_OK=true).

## Case C
Official cask already exists: `brew install --cask localsend` (token `localsend`, version 1.17.0, `LocalSend.app`). Prefer **homebrew-cask** mirror path — do not invent a `-tap` duplicate when the user pastes formulae.brew.sh.

## Root cause
`homebrew-cask` classifier + generator are on **main** (see `5e7a04e` and subsequent wiring) but **not released** as 0.0.24.

## Expected
- **agent_service_expectation:** `false` (GUI `.app` cask)
- **generator:** `homebrew-cask`
- **package/app:** `localsend` / `LocalSend.app`
- **not:** cask-dmg → `localsend-tap` duplicate

## Fix (batch mode — fix-package only, no release)
Already on workspace HEAD:

1. **`lib/classifier.ts`**: `HOMEBREW_CASK_RE` → `{ type: 'homebrew-cask', name }`
2. **`lib/generators/homebrew-cask.ts`**: fetch official cask Ruby from formulae API + raw homebrew-cask source
3. CLI / manifest / package-updater wiring

Local generate (CI=1, temp tap): Classified as homebrew-cask → `Casks/localsend.rb` matching official.

## Residual risk
Until a bottle ships the homebrew-cask path, monitored installs of formulae.brew.sh/cask/* may create `-tap` duplicates when discovery finds a DMG (lucky path) or monorepo source-build (unlucky path like devonthink).
