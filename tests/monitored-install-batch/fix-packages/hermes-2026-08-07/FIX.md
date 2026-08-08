# FIX: hermes (https://formulae.brew.sh/cask/hermes)

## Case
**Case C** — formulae.brew.sh **cask** page for token `hermes`.

## Reality check (Phase 0.5)
- `https://formulae.brew.sh/api/cask/hermes.json` → **HTTP 404**.
- `homebrew-cask` raw `Casks/h/hermes.rb` → **404** (cask removed).
- Historical cask (Wayback 2021): Pandora client **Hermes** (`hermesapp.org`, HermesApp/Hermes ~1.3.1 ZIP).
- Live nearby token **`hermes-desktop`** is a **different** app (Nous Research Hermes Agent Desktop) — do **not** silent-substitute.
- **service:** false (GUI cask).

## Failures observed
### Local main (temp tap)
- Classifies correctly as `homebrew-cask`.
- `generateHomebrewCask` throws bare `HTTP 404 for …/cask/hermes.json`.
- No cask written. Install success impossible for this catalog URL.

### Product gap
- Opaque 404 (same UX class as removed formula `nix`).
- Stale catalog `in_homebrew` for removed cask.

## Fixes (batch mode — fix-package only, not released)
1. `fetchHomebrewCaskApi` — clear 404 explaining homebrew/cask-only mirror + removed/renamed out of scope.
2. Unit tests: classify `cask/hermes`; generate rejects missing `hermes`.

## Validation
- Local generate: classify homebrew-cask + generate_fail 404.
- VM `vm-install-one`: expected generate_fail (no cask in API).

## Residual risk
- Catalog stale; cannot succeed until homebrew/cask re-adds `hermes` or catalog points at a living upstream URL.
- Do not package dead HermesApp releases as permanent Case C success without user intent.
