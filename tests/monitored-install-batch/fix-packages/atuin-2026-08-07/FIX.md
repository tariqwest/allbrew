# FIX: atuin (https://github.com/atuinsh/atuin)

## Case
GitHub Rust CLI with dual release product lines: primary shell-history CLI
(`atuin-*-apple-darwin.tar.gz`) and companion self-host server
(`atuin-server-*-apple-darwin.tar.gz`). Formula name collides with homebrew/core
`atuin` → `atuin-tap`.

## Failures observed

### Released allbrew 0.0.24
- Classifies `github-repo` → `binary-release` (correct for release assets)
- Per-arch asset loop **last-wins**: later `atuin-server-*` overwrites `atuin-*`
- Inspects server archive → entrypoint `atuin-server-aarch64-apple-darwin/atuin-server`
- Install body hardcodes that arch path and symlink-renames `atuin-server` → `atuin`
- Result: wrong product installed; `atuin` binary is the server companion
- service: none (OK for CLI; homebrew/core optionally ships `atuin daemon` as a service)

## Agent judgment
- Preferred generator: **binary-release** (client assets) or cargo-package
- service: **false** (interactive shell history CLI; optional server/daemon is advanced)
- package/bin: `atuin` (formula may be `atuin-tap` due to core collision)

## Fixes (worktree validated, not released)
1. **`lib/generators/binary-release.ts`**
   - `scoreBinaryReleaseAsset(name, productHints)` — prefer stem match to repo/formula,
     penalize `-server`/`-daemon`, secondary product-prefix tools, musl/android/deltas
   - Per-arch selection keeps highest score (not last asset)
   - `pickArchiveEntrypoint`: strip `-tap` suffix from preferred names; penalize `*-server` basenames
   - `buildBinaryReleaseInstallBody`: when entry path is arch-prefixed, discover binary via
     `Dir[libexec/"**/basename"]` so multi-arch platform URLs share one install body

## Validation
- Unit: `tests/unit/generators/binary-release-atuin-score.test.ts` + existing binary-release suite
- Local generate (worktree): formula `atuin-tap` 18.19.0, URLs are `atuin-*-apple-darwin` (not server),
  no `service do`, install finds `**/atuin`
- Host brew install of fixed formula: ~24MB client tree (vs ~9MB server); uninstalled after
- Batch mode: no release; VM on 0.0.24 still installs wrong product until parent promote

## Residual risk
- Projects that **only** ship `*-server` assets intentionally will score lower but still win
- Preferring gnu over musl is unchanged heuristic
- homebrew/core `atuin` remains the healthier path for end users (`brew install atuin`)
