# FIX: kubetui (https://formulae.brew.sh/formula/kubetui)

## Case
Case C / homepage-download-test-cases — official Homebrew **formula** page for **kubetui** (homebrew/core).
Rust TUI for Kubernetes resource monitoring (`sarub0b0/kubetui`), binary `kubetui`, service: false.

## Agent judgment
- generator: **homebrew-formula** (mirror core Formula/k/kubetui.rb + bottles)
- service: **false** (interactive Kubernetes TUI; not launchd)
- do **not** monorepo-source-build homebrew-core

## Failures observed

### Local main generate (temp tap)
- Correctly classifies as `homebrew-formula` and vendors core Ruby
- `renderBottleBlock` double-colons API cellar symbols:
  - `":any_skip_relocation"` → `::any_skip_relocation` (invalid Ruby)
  - `":any"` → `::any`
- `brew install` fails at formula parse (syntax errors)

## Fixes (worktree validated, batch mode — not released)
1. **`formatBottleCellar` / `renderBottleBlock`** in `lib/generators/homebrew-formula.ts`
   - keep `:symbol` API values as-is
   - quote absolute paths
   - bare names → single leading `:`
2. Unit tests: `tests/unit/homebrew-formula-bottle.test.ts` (md-tui + kubetui cellar fixtures)

## Validation
- Unit tests in worktree: 9 pass
- Local generate (worktree generator): `sha256 cellar: :any_skip_relocation` (no `::`), `ruby -c` Syntax OK; version 1.14.0

## Residual risk
Until release: main/released allbrew still emits invalid bottle cellar DSL. Prefer `brew install kubetui` from core for end users.
