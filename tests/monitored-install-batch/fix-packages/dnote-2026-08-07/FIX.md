# FIX: dnote (https://formulae.brew.sh/formula/dnote)

## Case
Case C / homepage-download-test-cases — official Homebrew formula page for **dnote** (homebrew/core CLI notebook, Apache-2.0, Go CLI).

## Agent judgment
- generator: **homebrew-formula** (API + vendor core Ruby + bottles)
- service: **false** (one-shot CLI notebook; no brew-services)
- do **not** monorepo source-build homebrew-core

## Failures observed

### A. Released allbrew 0.0.24 (VM homeserver)
- Classified formulae.brew.sh as `unknown`.
- page-discover picked `github.com/Homebrew/homebrew-core/blob/.../Formula/d/dnote.rb` as github-repo.
- Generated nonsense HEAD monorepo formula: `make PREFIX= install` of homebrew-core (desc "Default formulae…", homepage brew.sh).
- `brew install --HEAD dnote` exited 0 but VERIFY is a **false positive** (core `dnote` bottle / name collision, not the generated monorepo formula).

### B. Current main `homebrew-formula` path (local generate)
- Correctly classifies as `homebrew-formula` and vendors core Ruby.
- `renderBottleBlock` turns API cellar `":any_skip_relocation"` into invalid Ruby `::any_skip_relocation`.
- `brew install` fails at formula parse (syntax errors).

## Fixes (worktree validated, batch mode — no release)
1. **`formatBottleCellar` / `renderBottleBlock`** in `lib/generators/homebrew-formula.ts`
   - keep `:symbol` API values; quote absolute paths; bare names → single `:`
2. **`classify` tree/blob** in `lib/classifier.ts` (for 0.0.24 gap / blob URLs)
   - Homebrew/homebrew-core `Formula/**/*.rb` → `homebrew-formula`
3. **`scoreCandidateUrl`** monorepo penalty (from bun fix-package) when discover still runs

## Validation
- Unit tests in worktree: `homebrew-formula-bottle.test.ts` 7 pass
- Local generate (worktree): Ruby Syntax OK, `cellar: :any_skip_relocation`, no `::any`
- VM: product signal captured (monorepo formula + false VERIFY_OK on 0.0.24)

## Residual risk
Until bottle fix released/synced to guest allbrew: Case C either monorepos (0.0.24) or parse-fails (main unreleased). Prefer `brew install dnote` from core for end users. Do not trust VERIFY_OK alone when install used `--HEAD` monorepo formula.
