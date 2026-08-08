# FIX: refine-app (https://refine.app)

## Failure class
**generate_fail** — expired brand domain `refine.app` (TLS cert `*.website.ws`, not fetchable). Product is official homebrew/cask `refine` (homepage https://refine.sh/, Refine.app grammar checker).

## Root cause
1. Stock/released allbrew classifies the URL as `unknown`; page-discover fails on TLS altname → non-interactive abort.
2. Unreleased Case C homepage matcher finds official cask `refine` via brand-TLD flex (`refine.app` label == cask homepage SLD `refine` on `refine.sh`).
3. After match, CLI kept batch `--name refine-app` via `opts.name || matched.token`, so `generateHomebrewCask` fetched `api/cask/refine-app.json` → **HTTP 404**.

## Independent judgment
- **generator:** `homebrew-cask` (adopt official token `refine`)
- **service:** `false` (GUI .app; no brew services)
- **app:** `Refine.app` version 1.34 from refine.sh

## Fix (batch mode — fix-package only, no release)
1. **`lib/generators/homebrew-cask.ts`**: `matchOfficialCaskByHomepage` — domain + brand-TLD flex (refine.app → refine on refine.sh).
2. **`lib/cli.ts`**: Case C before page-discover; **`name: matched.token`** (official token always wins over slug `--name`).
3. **tests**: `homebrew-cask-homepage.test.ts` including preferredName `refine-app`.

## Validation
```bash
bun test ./tests/unit/generators/homebrew-cask-homepage.test.ts
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://refine.app" --name refine-app --tap "$(mktemp -d)/tap" --verbose
# → Casks/refine.rb official homebrew/cask body, token refine
```

## Residual risk
- Stock brew allbrew (0.0.24) still fails until homepage-match + token-win reconciled/released into VM bottle.
- `refine.app` remains dead; matching is heuristic on brand label — unrelated `*.app` brands with same SLD as an official cask could false-positive (mitigated: token must equal page label).
- Distinct products: getrefine.app (open-source AI text) and refine.dev (React framework) are not this cask.
