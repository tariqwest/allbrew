# FIX: pug (https://formulae.brew.sh/formula/pug)

## Case
Case C / homepage-download-test-cases — official Homebrew **formula** page for **pug** (already in homebrew/core).
CLI TUI for terraform (`leg100/pug`), service: false.

## Agent judgment
- generator: **homebrew-formula** (mirror core Formula/p/pug.rb + bottles)
- service: **false** (interactive TUI, not launchd)
- do **not** monorepo source-build homebrew-core
- do **not** prefer page-discover → single-arch GitHub release zip over core

## Failures observed

### A. Released allbrew 0.0.24 (VM homeserver)
- Classified formulae.brew.sh page as `unknown`
- page-discover picked `pug_0.6.5_darwin_arm64.zip` → **binary-direct** formula
- `brew install` exited **138** (VERIFY_OK=false)
- Weak formula: single-arch zip URL as homepage/livecheck; not multi-bottle core mirror

### B. Current main `homebrew-formula` path (local generate)
- Correctly classifies as `homebrew-formula` and vendors core Ruby
- `renderBottleBlock` double-colons API cellar symbols:
  - `":any_skip_relocation"` → `::any_skip_relocation` (invalid Ruby)
- `brew install` fails at formula parse (syntax errors)
- After `formatBottleCellar` fix: bottles valid; local temp-tap install of pug 0.6.5 succeeded (then uninstalled)

## Fixes (worktree validated, batch mode — not released)
1. **`formatBottleCellar` / `renderBottleBlock`** in `lib/generators/homebrew-formula.ts`
   - keep `:symbol` API values as-is
   - quote absolute paths
   - bare names → single leading `:`
2. Unit tests: `tests/unit/homebrew-formula-bottle.test.ts` (also covered by bun/fly-io fix packages)

## Validation
- Unit tests in worktree: 6 pass
- Local generate (worktree): `sha256 cellar: :any_skip_relocation` (no `::`), `ruby -c` Syntax OK, brew install pug 0.6.5 ok on host temp formula path then `brew uninstall pug`
- VM 0.0.24: still fails (unfixed bottle on main not shipped; 0.0.24 lacks homebrew-formula routing for this page → binary-direct / exit 138)

## Residual risk
Until release: formulae.brew.sh on 0.0.24 still page-discovers; main unreleased bottle fix still needed for `:any_skip_relocation`. Prefer recommending core `brew install pug` for already-core tools.
