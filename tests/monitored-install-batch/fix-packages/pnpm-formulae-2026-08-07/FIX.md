# FIX: pnpm (https://formulae.brew.sh/formula/pnpm)

## Case
Case C — official Homebrew **formula** page for **pnpm** (homebrew/core).
Fast npm-compatible package manager (`pnpm` / `pnpx`), service: false.

## Agent judgment
- generator: **homebrew-formula** (mirror core Formula/p/pnpm.rb + bottles)
- service: **false** (package-manager CLI; not launchd)
- do **not** monorepo-source-build homebrew-core

## Failures observed

### Local main generate (temp tap)
- Classifies as `homebrew-formula` and vendors core Ruby
- `renderBottleBlock` double-colons API cellar symbols:
  - `":any"` → `::any` (invalid Ruby)
  - `":any_skip_relocation"` → `::any_skip_relocation`
- `brew install` fails at formula parse (syntax errors)

## Fixes (worktree validated, batch mode — not released)
1. **`formatBottleCellar` / `renderBottleBlock`** in `lib/generators/homebrew-formula.ts`
   - keep `:symbol` API values as-is
   - quote absolute paths
   - bare names → single leading `:`
2. Unit tests: `tests/unit/homebrew-formula-bottle.test.ts` (pnpm-style `:any` fixtures)

## Validation
- Unit tests in worktree: 6 pass
- Local generate (worktree): `sha256 cellar: :any` (no `::`), `ruby -c` Syntax OK; brew install succeeded (host auto-install incidental; green path is VM)
- Prefer `brew install pnpm` from core for end users until fix is released

## Residual risk
Until release: main/released allbrew still emits invalid bottle cellar DSL. Core `pnpm` remains the correct user path.
