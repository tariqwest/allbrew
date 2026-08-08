# FIX: devonthink (https://formulae.brew.sh/cask/devonthink)

## Failure class
**generate_fail** (wrong generator) → **brew_fail**

On allbrew **0.0.24** (released bottle used in VM):

1. Classifies `https://formulae.brew.sh/cask/devonthink` as **`unknown`** (no `HOMEBREW_CASK_RE`).
2. Page-discover scores the GitHub blob link to `Homebrew/homebrew-cask` monorepo highest.
3. Treats monorepo as **source-build**, generates formula from tag `v0.60.1` (homebrew-cask release), not DEVONthink.app.
4. `brew install` fails / installs the wrong thing.

## Case C
Official cask already exists: `brew install --cask devonthink` (token `devonthink`, version 4.3.2, `DEVONthink.app`, auto_updates). Prefer **homebrew-cask** mirror path — never monorepo source-build.

## Root cause
`feat(generator): add homebrew-formula and homebrew-cask generators` (`5e7a04e`) is on **main** but **not released**. Bottle 0.0.24 predates that commit.

Distinct from homepage assignment (`https://devontechnologies.com`) which needs product-page hop + Case C name prefer; this URL is already a formulae.brew.sh cask page and only needs the homebrew-cask classifier + generator.

## Expected
- **agent_service_expectation:** `false` (GUI `.app` cask)
- **generator:** `homebrew-cask`
- **package/app:** `devonthink` / `DEVONthink.app`
- **not:** source-build of `Homebrew/homebrew-cask`

## Fix (batch mode — fix-package only, no release)
Already on HEAD as `5e7a04e`:

1. **`lib/classifier.ts`**: `HOMEBREW_CASK_RE` → `{ type: 'homebrew-cask', name }`
2. **`lib/generators/homebrew-cask.ts`**: fetch official cask Ruby from homebrew/cask API + raw source
3. Wire through CLI, manifest, package-updater

Patch: `patches/0001-homebrew-cask-formula-generators.patch`

## Validation
```bash
# HEAD local (no host brew install as success)
bun -e 'import { classify } from "./lib/classifier.ts"; console.log(classify("https://formulae.brew.sh/cask/devonthink"))'
# → { type: "homebrew-cask", name: "devonthink", ... }

CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://formulae.brew.sh/cask/devonthink" --name devonthink --tap "$(mktemp -d)" --verbose
# Classified as: homebrew-cask
# Generated: .../Casks/devonthink.rb
```

## VM (allbrew 0.0.24 bottle)
Fails as above until release/upgrade past `5e7a04e`. Host brew install intentionally not used as success path.

## Related
Earlier fix-package `devonthink-2026-08-07/` targets vendor homepage; keep both.
