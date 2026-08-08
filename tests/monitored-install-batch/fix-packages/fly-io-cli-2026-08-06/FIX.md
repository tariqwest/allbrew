# Fix: fly.io/install.sh → homebrew/core flyctl (not broken install-script)

## Problem
`https://fly.io/install.sh` classified as `bash-script` → `install-script` formula that:
- sets version `0.0.1`
- runs the vendor installer with `PREFIX`/`DESTDIR`/`HOME=buildpath` (script ignores PREFIX)
- script installs into `$HOME/.fly/bin` (`FLYCTL_INSTALL`)
- formula only harvests `buildpath/bin/*` → **Empty installation**

Docs prefer `brew install flyctl` on macOS; Homebrew core ships healthy `flyctl`.

## Root cause
1. `handleBashScript` always used install-script without inspecting the script body.
2. Secondary: `homebrew-formula` bottle renderer double-coloned API cellar symbols (`:any_skip_relocation` → `::any_skip_relocation`) → Ruby syntax error when vendoring core.

## Fix
1. New `lib/install-script-analyze.ts` — detect home-dir installers (`$HOME/.fly`, `FLYCTL_INSTALL`), bin names (`flyctl`), well-known `fly.io/install.sh` → `flyctl`.
2. `handleBashScript` in `lib/cli.ts`:
   - macOS .app + official cask → homebrew-cask / cask-app
   - system/home-dir installer + core formula name candidates → **homebrew-formula** (`flyctl`)
   - else install-script (+ optional service)
3. `formatBottleCellar` in `lib/generators/homebrew-formula.ts` — never emit double-colon cellar symbols.

## Validation
- Unit tests: install-script-analyze (fly fragment), formatBottleCellar
- Local generate (worktree): routes to flyctl, bottles use `:any_skip_relocation`
- Full VM install/verify still required after merge (batch mode: no release)

## Residual risk
- Vendoring core formula into a private tap is redundant with `brew install flyctl`; ideal UX is pure Case C short-circuit without copying Ruby (future).
- `isHomebrewCoreFormulaName` requires local homebrew/core checkout layout.
- Scripts without a core match still fail if they install only to `$HOME/.tool` (template still harvests only `buildpath/bin`).
