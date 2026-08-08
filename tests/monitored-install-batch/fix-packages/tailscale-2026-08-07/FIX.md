# FIX: tailscale (https://tailscale.com)

## Case
**Case C / homepage-download-test-cases** — product homepage for Tailscale mesh VPN.

## Phase 0.5 judgment
| Field | Value |
|-------|--------|
| inputShape | `product-homepage` (`tailscale.com`) |
| expected | Case C official Homebrew — formula `tailscale` and/or cask `tailscale-app` |
| service | formula: **true** (`service do; run opt_bin/"tailscaled"`); cask GUI: **false** |
| Prefer | Healthy homebrew/core + homebrew/cask; do not mint duplicate vendor pkg cask |

## Failures observed (allbrew **0.0.24** VM local-2 via `vm-install-one.mjs`)
1. Classified as **`unknown`** (marketing homepage).
2. WebView page-discover listed low-score same-site links only; **no** auto-pick of `pkgs.tailscale.com/...pkg` (flaky vs host).
3. Non-interactive: `Unable to automatically handle URL` → **generate_fail**.
4. Host local generate (main, discover on) sometimes picks official `.pkg` and hangs on inspect / may mint cask-app.

## Root cause
1. **Missing Case C fallback** when page discovery fails for a product homepage whose `--name` already exists in homebrew/core or homebrew/cask.
2. **Bottle cellar double-colon** in `homebrew-formula` generator: API returns `cellar: ":any_skip_relocation"` and code did `` `:${cellar}` `` → `::any_skip_relocation` (invalid Ruby). Same bug as bun-2026-08-06 fix package (not yet on main/bottle).

## Fix (batch mode — no release)
1. `resolveExistingHomebrewClassification(name)` in `lib/utils.ts` — core formula preferred, else cask.
2. `lib/cli.ts` — after failed page discovery on `unknown`, apply Case C reclassification.
3. `formatBottleCellar` + exported `renderBottleBlock` in `lib/generators/homebrew-formula.ts`.
4. Unit tests: `resolveExistingHomebrewClassification`, `formatBottleCellar` / `renderBottleBlock`.

## Validation
```bash
bun test tests/unit/utils.test.ts --test-name-pattern resolveExistingHomebrew
bun test tests/unit/homebrew-formula-bottle.test.ts
# worktree:
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://tailscale.com" --name tailscale --tap "$(mktemp -d)" --verbose --discover off
# → Case C formula "tailscale", valid bottle cellar symbols, service do present
```

## Residual risk
- VM bottle remains **0.0.24** until parent integrates + releases; full VM install will stay red until upgrade.
- With discover **on**, host may still select vendor `.pkg` before Case C (fallback only when discovery fails). Optional follow-up: prefer Case C when name collides even if a vendor artifact is found.
- `--name tailscale` maps to **formula** (CLI/daemon), not **cask** `tailscale-app` (GUI). Both are official; GUI users want `tailscale-app`.
- Formula service requires root on Linux; macOS brew services caveats apply. VPN/network extension not exercised in unit tests.
