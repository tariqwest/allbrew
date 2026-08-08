# FIX: md-tui (https://formulae.brew.sh/formula/md-tui)

## Case
Case C / homepage-download-test-cases — official Homebrew **formula** page for **md-tui** (homebrew/core).
Markdown renderer TUI in Rust (`henriklovhaug/md-tui`), binary `mdt`, service: false.

## Agent judgment
- generator: **homebrew-formula** (mirror core Formula/m/md-tui.rb + bottles)
- service: **false** (interactive terminal markdown viewer; not launchd)
- do **not** monorepo-source-build homebrew-core

## Failures observed

### A. Released allbrew 0.0.24 (VM homeserver)
- Classified formulae.brew.sh page as `unknown`
- page-discover picked `github.com/henriklovhaug/md-tui` → **binary-release** (tar.xz assets)
- Formula hardcodes `libexec/md-tui-aarch64-apple-darwin/mdt` for bin symlinks
- `VERIFY_OK=false`, `EXIT_CODE=1` (brew install failed / incomplete)

### B. Current main `homebrew-formula` path (local generate)
- Correctly classifies as `homebrew-formula` and vendors core Ruby
- `renderBottleBlock` double-colons API cellar symbols:
  - `":any_skip_relocation"` → `::any_skip_relocation` (invalid Ruby)
- `brew install` fails at formula parse (syntax errors)
- After `formatBottleCellar` fix: bottles valid; local pour of md-tui 0.10.3 succeeded (then uninstalled)

## Fixes (worktree validated, batch mode — not released)
1. **`formatBottleCellar` / `renderBottleBlock`** in `lib/generators/homebrew-formula.ts`
   - keep `:symbol` API values as-is
   - quote absolute paths
   - bare names → single leading `:`
2. Unit tests: `tests/unit/homebrew-formula-bottle.test.ts` (md-tui cellar fixtures)

## Validation
- Unit tests in worktree: 7 pass
- Local generate (worktree): `sha256 cellar: :any_skip_relocation` (no `::`), `ruby -c` Syntax OK; brew install poured bottle then uninstall
- VM 0.0.24: binary-release path, VERIFY_OK=false

## Residual risk
Until release: 0.0.24 still page-discovers GitHub binary-release; main bottle fix still needed. Prefer `brew install md-tui` from core for end users.
