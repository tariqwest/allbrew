# FIX: bun (https://formulae.brew.sh/formula/bun)

## Case
Case C / homepage-download-test-cases — official Homebrew formula page for **bun** (already in homebrew/core).

## Failures observed

### A. Released allbrew 0.0.24 (VM homeserver)
- No `HOMEBREW_FORMULA_RE` / no `homebrew-formula` generator in bottle.
- Classified page as `unknown` → page-discover picked
  `github.com/Homebrew/homebrew-core/blob/.../Formula/b/bun.rb`
- Tree/blob classifier collapsed that to **github-repo Homebrew/homebrew-core** monorepo.
- Generated nonsense HEAD formula: `make PREFIX= install` of homebrew-core.
- `brew install --HEAD bun` exited 0 but installed **homebrew/core bun 1.3.14** bottles.
- VERIFY_OK was a **false positive** (core package, not the generated formula).

### B. Current main `homebrew-formula` path (local generate)
- Correctly classifies as `homebrew-formula` and vendors core Ruby.
- `renderBottleBlock` turns API cellar values into invalid Ruby:
  - `"/opt/homebrew/Cellar"` → `:/opt/homebrew/Cellar`
  - `":any_skip_relocation"` → `::any_skip_relocation`
- `brew install` fails at formula parse (syntax errors).

## Agent judgment
- generator: **homebrew-formula** (or short-circuit to core `brew install bun`)
- service: **false** (CLI/runtime, not launchd)
- do **not** monorepo source-build homebrew-core

## Fixes (worktree validated, not released)
1. **`formatBottleCellar` / `renderBottleBlock`** in `lib/generators/homebrew-formula.ts`
   - keep `:symbol` API values
   - quote absolute paths
   - bare names → single leading `:`
2. **`classify` tree/blob** in `lib/classifier.ts`
   - Homebrew/homebrew-core `Formula/**/*.rb` → `homebrew-formula`
   - Homebrew/homebrew-cask `Casks/**/*.rb` → `homebrew-cask`
3. **`scoreCandidateUrl`** in `lib/page-discover.ts`
   - boost homebrew-formula/cask kinds
   - −100 penalty for github-repo monorepo links to homebrew-core/cask

## Validation
- Unit tests: `tests/unit/homebrew-formula-bottle.test.ts` (bottle + classify) pass in worktree
- Local generate (worktree): bottle Syntax OK, desc/homepage from bun, not monorepo HEAD
- Batch mode: no release; VM used brew 0.0.24 (unfixed)

## Residual risk
Until release: formulae.brew.sh URLs on 0.0.24 still monorepo-discover; main unreleased bottle fix still needed for path cellars. Prefer recommending core `brew install bun` for already-core tools.
