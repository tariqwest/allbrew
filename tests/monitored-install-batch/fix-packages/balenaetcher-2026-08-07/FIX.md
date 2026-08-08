# FIX: balenaetcher (https://formulae.brew.sh/cask/balenaetcher)

## Failure class
**generate_fail** (wrong generator on bottle) / suboptimal **collision rename**

On allbrew **0.0.24** (released bottle used in VM):

1. Classifies `https://formulae.brew.sh/cask/balenaetcher` as **`unknown`** (no `HOMEBREW_CASK_RE`).
2. Page-discover picks GitHub release DMGs (`balenaEtcher-*-arm64.dmg`) over monorepo (scores 158 vs 90).
3. Resolves as **cask-dmg**, renames token to **`balenaetcher-tap`** because official `balenaetcher` collides with `homebrew/cask`.
4. May install a re-packaged cask instead of adopting the official Homebrew cask (Case C).

Contrast: on **main** (`5e7a04e`+), classifies as **`homebrew-cask`**, copies official Ruby (`balenaEtcher.app`, arch arm/intel, livecheck github_latest), keeps token `balenaetcher`.

## Case C
Official cask already exists: `brew install --cask balenaetcher` (token `balenaetcher`, version 2.1.6, `balenaEtcher.app`). Prefer **homebrew-cask** mirror path.

## Root cause
`feat(generator): add homebrew-formula and homebrew-cask generators` (`5e7a04e`) is on **main** but **not released**. Bottle 0.0.24 predates that commit.

## Expected
- **agent_service_expectation:** `false` (GUI flash tool cask)
- **generator:** `homebrew-cask`
- **package/app:** `balenaetcher` / `balenaEtcher.app`
- **not:** `balenaetcher-tap` via ad-hoc cask-dmg

## Fix (batch mode — fix-package only, no release)
Already on HEAD as `5e7a04e`:

1. **`lib/classifier.ts`**: `HOMEBREW_CASK_RE` → `{ type: 'homebrew-cask', name }`
2. **`lib/generators/homebrew-cask.ts`**: fetch official cask Ruby from homebrew/cask API + raw source
3. Wire through CLI, manifest, package-updater

Patch: `patches/0001-homebrew-cask-formula-generators.patch`

## Validation
```bash
bun -e 'import { classify } from "./lib/classifier.ts"; console.log(classify("https://formulae.brew.sh/cask/balenaetcher"))'
# → { type: "homebrew-cask", name: "balenaetcher", ... }

CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://formulae.brew.sh/cask/balenaetcher" --name balenaetcher --tap "$(mktemp -d)" --verbose
# Classified as: homebrew-cask
# Generated: .../Casks/balenaetcher.rb
```

## VM (allbrew 0.0.24 bottle)
Classified as unknown → page-discover cask-dmg → `balenaetcher-tap` until release/upgrade past `5e7a04e`. Host brew install intentionally not used as success path for the batch marathon.
