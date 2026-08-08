# FIX: termscp (https://formulae.brew.sh/formula/termscp)

## Case
Case C / homepage-download-test-cases — official Homebrew formula page for **termscp** (homebrew/core TUI file transfer CLI, MIT, Rust/cargo).

## Agent judgment
- generator: **homebrew-formula** (API + vendor core Ruby + bottles)
- service: **false** (interactive TUI CLI; brew API `service: null`; not a daemon)
- do **not** monorepo source-build homebrew-core

## Failures observed

### A. Current main `homebrew-formula` path (local generate)
- Correctly classifies as `homebrew-formula` and vendors core Ruby.
- `renderBottleBlock` turns API cellar `":any"` into invalid Ruby `::any`.
- `brew install` fails at formula parse (syntax errors).

### B. Released allbrew (VM, typically 0.0.24)
- May still classify formulae.brew.sh as unknown → page-discover → monorepo HEAD of homebrew-core (same class as dnote/pug).

## Fixes (worktree validated, batch mode — no release)
1. **`formatBottleCellar` / `renderBottleBlock`** in `lib/generators/homebrew-formula.ts`
   - keep `:symbol` API values; quote absolute paths; bare names → single `:`
   - never emit `::any` / `::any_skip_relocation`
2. Unit tests: `tests/unit/homebrew-formula-bottle.test.ts` (termscp `:any` bottles + classify formulae.brew.sh)

## Validation
- Unit tests in worktree: 7 pass
- Local generate (worktree): Ruby Syntax OK, `cellar: :any`, no `::any`
- Host brew install after fix succeeded then **uninstalled** (isolation cleanup); not counted as monitored success path
- VM: uses guest allbrew bottle (likely unreleased fix) — expect fail until bottle fix merged/released

## Residual risk
Until bottle fix released/synced to guest allbrew: Case C parse-fails on main unreleased or monorepos on 0.0.24. Prefer `brew install termscp` from core for end users.
Related: dnote-2026-08-07, pug-2026-08-06, gpg-tui-2026-08-07
