# FIX: nix (https://formulae.brew.sh/formula/nix)

## Case
Case C — catalog `in_homebrew` for formulae.brew.sh token **nix**.

## Reality check (Phase 0.5)
- `brew info nix` → **no available formula** (suggests ni/nim/nyx/…).
- `https://formulae.brew.sh/api/formula/nix.json` → **HTTP 404**.
- `homebrew-core` raw `Formula/n/nix.rb` → **404** (formula not present / removed).
- Official install is **not** Homebrew: https://nixos.org/download/ multi-user installer (`sh <(curl -L https://nixos.org/nix/install)`), which sets up **nix-daemon**.
- Service (if a core formula existed): **true**, command roughly `nix-daemon` (multi-user daemon). With missing core formula, generation must fail — do **not** invent monorepo source-build from NixOS/nix HEAD.

## Failures observed
### Local main (temp tap)
- Classifies correctly as `homebrew-formula`.
- `generateHomebrewFormula` throws bare `HTTP 404 for …/formula/nix.json`.
- EXIT=1; no formula written. Install success impossible for this catalog URL.

### Product gap
- Error is opaque; users/agents may try wrong generators.
- Latent bottle double-colon on main (`:${cellar}` when API cellar already has `:`).

## Fixes (worktree validated, batch mode — not released)
1. `fetchHomebrewFormulaApi` — clear 404 explaining core-only mirror + removed/third-party out of scope.
2. `formatBottleCellar` / `renderBottleBlock` — no `::any_skip_relocation` (same as pug/kubetui packages).
3. Unit tests: classify `formula/nix`, cellar format, generate rejects missing `nix`.

## Validation
- Worktree: 3 unit tests pass.
- Local generate after fix: clear not-found error; exit 1.
- VM install: expected generate_fail (no core formula).

## Residual risk
- Catalog `in_homebrew` is **stale**; URL cannot succeed until core re-adds `nix` or catalog points at upstream (nixos.org / NixOS/nix) with a different strategy.
- Shipping a full Nix installer via allbrew is out of scope for homebrew-formula generator.
- Theoretical service expectation (`nix-daemon`) never exercised because generate never reaches template.
