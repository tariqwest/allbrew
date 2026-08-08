# FIX: clipped-app (https://formulae.brew.sh/formula/mcclowes)

## Case
Case C / homepage-download-test-cases — catalog slug **clipped-app** with formulae.brew.sh token **mcclowes**.

## Reality check (Phase 0.5)
- `https://formulae.brew.sh/api/formula/mcclowes.json` → **HTTP 404** (not in homebrew/core).
- HTML page also 404.
- Related project `github.com/mcclowes/clipped` is a **macOS menu bar GUI** (`Clipped.app`), installed via **third-party tap** `brew install mcclowes/clipped/clipped` — not core.
- Service: **false** (GUI menu bar app / non-existent core formula).
- Do **not** monorepo-source-build homebrew-core for this URL.

## Failures observed

### A. Released allbrew 0.0.24 (VM homeserver)
- Classified as `unknown` (no homebrew-formula page route in 0.0.24).
- page-discover: fetch failed HTTP 404.
- Non-interactive: `Unable to automatically handle URL`.
- EXIT_CODE=1, VERIFY_OK=false.

### B. Current main (local temp tap)
- Classifies correctly as `homebrew-formula`.
- With `--name clipped-app`, API lookup wrongly used **clipped-app** (catalog slug) instead of URL token **mcclowes**.
- Raw `HTTP 404 for …/formula/clipped-app.json` (or mcclowes without --name).
- Bottle renderer still double-colons `:any_skip_relocation` → `::any_skip_relocation` (latent; not hit on this 404 path).

## Fixes (worktree validated, batch mode — not released)
1. **`formatBottleCellar` / `renderBottleBlock`** in `lib/generators/homebrew-formula.ts` (same as pug/dnote/bun packages).
2. **Clearer API 404** explaining core-only mirror + third-party taps.
3. **`generateWithConfirmation`**: for `homebrew-formula` / `homebrew-cask`, prefer **URL `params.name`** over catalog `--name` so core API token stays aligned.
4. Unit tests: bottle cellar + classifier token for `formula/mcclowes`.

## Validation
- Worktree unit tests: 7 pass (`homebrew-formula-bottle.test.ts`).
- Local generate: looks up **mcclowes** (not clipped-app); clear not-found error; exit 1.
- Install success for this catalog URL is **impossible** until the token exists in core or the catalog URL is corrected (e.g. GitHub `mcclowes/clipped` or third-party tap).

## Residual risk
- Catalog URL is wrong for Clipped app; recommend github/cask path separately (url-0283-clipped).
- 0.0.24 still lacks homebrew-formula page classification until release.
- Third-party taps are still out of scope for homebrew-formula generator.
