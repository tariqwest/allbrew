# FIX: diskonaut (https://github.com/imsnif/diskonaut)

## Case
Rust TUI disk-space navigator (`cargo install diskonaut`). Interactive CLI, service: false.
README documents `brew install diskonaut` (homebrew/core already). Releases are linux-musl only.

## Agent judgment
- generator: **cargo-package** (crate `diskonaut`)
- service: **false** (interactive TUI; not brew-services)
- end users should prefer core `brew install diskonaut` once healthy
- custom formula collides with core → may become `diskonaut-tap` when real brew lists core

## Failures observed

### Local auto-detect (main before fix)
- Classifies github-repo, no macOS release assets, README brew detect → **prompt_hang** on
  `select("What would you like to do?")` even with `CI=1` / `ALLBREW_NONINTERACTIVE=1`.

### After fix (worktree)
- Non-interactive: continues generation
- Detected install method: cargo (diskonaut)
- Formula: cargo-package, no `service do`, version 0.11.0, crates.io livecheck

## Fix (batch Option A — fix-package only, no release)
**`lib/cli.ts`**: when `detectBrewInstall` hits and `isNonInteractive(opts)`, default choice
to `"continue"` (generate custom formula) instead of awaiting `select()`.

## Validation
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 PATH="/tmp/fakebrew:$PATH" \
  bun run bin/allbrew.ts "https://github.com/imsnif/diskonaut" --name diskonaut \
  --tap "$(mktemp -d)" --verbose
# → Formula/diskonaut.rb cargo-package, no service do
```

## Residual
- Guest brew allbrew 0.0.24 still hangs on brew-available select until release.
- Cargo source build is heavy; VM install may timeout building rust.
- Prefer homebrew/core `diskonaut` for end users (Case C).
