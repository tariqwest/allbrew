# FIX: chronoid (https://chronoid.com)

## Case
Catalog/batch slug **chronoid**, assigned URL `https://chronoid.com`.

## Reality check (Phase 0.5)
- `https://chronoid.com` redirects to **BrandBucket** domain marketplace (`brandbucket.com/names/chronoid`), not the product.
- Real product: **Chronoid** macOS GUI time tracker at `https://www.chronoid.app/`.
- Official DMG: `https://download.chronoid.app/Chronoid-latest.dmg` (also versioned `Chronoid-#{version}.dmg`).
- Already on **homebrew/cask** as `chronoid` (1.0.95, sparkle appcast, auto_updates).
- Service: **false** (GUI `.app` / cask only — no formula `service` stanza).

## Failures observed

### A. Released allbrew 0.0.24 (VM homeserver)
- Classified `unknown`.
- page-discover follows redirect into BrandBucket HTML; webview finds no high-confidence DMG.
- Non-interactive: `Unable to automatically handle URL (non-interactive): https://chronoid.com`.
- EXIT_CODE=1, VERIFY_OK=false.

### B. Main dirty tree (homepage match already present)
- `https://www.chronoid.app` → `matchOfficialCaskByHomepage` exact domain match → official cask.
- `https://chronoid.com` still fails exact-domain check (`chronoid.com` ≠ `chronoid.app`).

## Fixes (worktree validated, batch mode — not released)
1. **Case C homepage match** (`lib/cli.ts` + `matchOfficialCaskByHomepage`): adopt official homebrew/cask when product homepage domain matches.
2. **Alternate TLD label match**: if registrable hosts differ but first label equals cask token (e.g. `chronoid.com` vs `chronoid.app`), still adopt the official cask.
3. Unit tests: `tests/unit/generators/homebrew-cask-homepage.test.ts` (exact domain, alternate TLD, negative unrelated domain).

## Validation
- Worktree unit tests: 3 pass.
- Local generate (fake brew, temp tap): `https://chronoid.com --name chronoid` → Matched official homebrew/cask chronoid → writes official cask Ruby.
- VM install with released 0.0.24 still fails until parent reconciles + releases.

## Residual risk / catalog note
- Prefer catalog URL `https://www.chronoid.app` or `https://formulae.brew.sh/cask/chronoid`.
- Alternate-TLD match is intentional for sold/legacy `.com` domains; requires hostname label == cask token (does not match preferredName alone on unrelated hosts).
- Host auto-install still runs after generate; batch success path remains VM helper only.
