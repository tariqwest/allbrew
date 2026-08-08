# FIX: popclip (https://formulae.brew.sh/cask/popclip)

## Failure class
**generate_fail** (wrong generator) → **brew_fail**

On allbrew **0.0.24** (VM bottle):

1. Classifies `https://formulae.brew.sh/cask/popclip` as **`unknown`** (no `HOMEBREW_CASK_RE`).
2. Page-discover scores the GitHub blob link to `Homebrew/homebrew-cask` monorepo highest.
3. Treats monorepo as **source-build**, generates `Formula/popclip.rb` from tag `v0.60.1` (homebrew-cask release), not PopClip.app.
4. `brew install --formula` fails / wrong artifact.

## Case C
Official cask already exists and is healthy: `brew install --cask popclip` (token `popclip`, version `2026.7.1`, `PopClip.app`, auto_updates). Prefer **homebrew-cask** adopt path — never monorepo source-build.

## Root cause
`feat(generator): add homebrew-formula and homebrew-cask generators` (`5e7a04e`) is on **main** but **not released**. Bottle 0.0.24 predates that commit.

Distinct from homepage URL `https://popclip.app` which needs page-discover + outer-app-over-Sparkle-Updater (see `popclip-2026-08-07/`). This assignment is formulae.brew.sh only.

## Expected
- **agent_service_expectation:** `false` (GUI `.app` cask)
- **generator:** `homebrew-cask`
- **package/app:** `popclip` / `PopClip.app`
- **not:** source-build of `Homebrew/homebrew-cask`

## Fix (batch mode — fix-package only, no release)
Already on HEAD as `5e7a04e`:

1. **`lib/classifier.ts`**: `HOMEBREW_CASK_RE` → `{ type: 'homebrew-cask', name }`
2. **`lib/generators/homebrew-cask.ts`**: fetch official cask Ruby from homebrew/cask API + raw source
3. Wire through CLI, manifest, package-updater

## Validation
```bash
bun -e 'import { classify } from "./lib/classifier.ts"; console.log(classify("https://formulae.brew.sh/cask/popclip"))'
# → { type: "homebrew-cask", name: "popclip", ... }

CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://formulae.brew.sh/cask/popclip" --name popclip --tap "$(mktemp -d)" --verbose
# Classified as: homebrew-cask
# Generated: .../Casks/popclip.rb with app "PopClip.app"
```

## VM (allbrew 0.0.24 bottle)
Fails as above until release/upgrade past `5e7a04e`. Host brew install intentionally not counted as success.

## Related
- `popclip-2026-08-07/` — homepage ZIP / Sparkle Updater.app selection
- `cap-so-formulae-2026-08-07/` — same Case C monorepo false-positive pattern
