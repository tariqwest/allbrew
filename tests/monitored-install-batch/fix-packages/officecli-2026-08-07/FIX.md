# FIX: officecli (https://formulae.brew.sh/formula/officecli)

## Case
Case C — official Homebrew **formula** page for **officecli** (homebrew/core).
.NET CLI for Office documents (`iOfficeAI/OfficeCLI`), binary `officecli`, service: false.

## Agent judgment
- generator: **homebrew-formula** (mirror core Formula/o/officecli.rb + bottles)
- service: **false** (one-shot document CLI; API `service: null`)
- do **not** monorepo-source-build homebrew-core or binary-release from GitHub Linux-only assets

## Failures observed

### Local main generate (temp tap)
- Classifies as `homebrew-formula` and vendors core Ruby
- `renderBottleBlock` double-colons API cellar symbols (`:any_skip_relocation` → `::any_skip_relocation`)
- `brew install` fails at formula parse

### VM (allbrew 0.0.24, homeserver)
- Classified as **unknown** → page-discover → binary-release
- Error: `No macOS binary assets found in release (Linux-only binaries…)`
- Never hit homebrew-formula path (classifier missing/outdated on bottle)

## Fixes (worktree validated, batch mode — not released)
1. **`formatBottleCellar` / `renderBottleBlock`** in `lib/generators/homebrew-formula.ts`
   - keep `:symbol` API values as-is; never emit `::`
2. Unit tests: `tests/unit/homebrew-formula-bottle.test.ts`
3. Ensure released bottle includes formulae.brew.sh → homebrew-formula classifier (already on main)

## Validation
- Unit tests worktree: 9 pass
- Fixed generate: `cellar: :any_skip_relocation`, `ruby -c` OK; version **1.0.143**
- VM install with 0.0.24: EXIT_CODE=1 VERIFY_OK=false

## Residual risk
Until release+upgrade: dogfood install of formulae.brew.sh formula URLs fails on bottle DSL (main) or wrong generator (0.0.24). Prefer `brew install officecli` from core for end users. Formula depends on `dotnet`.
