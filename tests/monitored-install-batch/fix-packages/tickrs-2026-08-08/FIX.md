# FIX: tickrs (github.com/tarkah/tickrs)

## URL
https://github.com/tarkah/tickrs

## Failure class
`brew_fail` — generated `binary-release` with only `on_macos` / `on_intel` (release ships
`x86_64-apple-darwin` only; no arm64/universal). On Apple Silicon Homebrew fails:

`Error: tickrs: formula requires at least a URL`

## Agent judgment
- **generator (preferred):** `cargo-package` (`cargo install tickrs` / crates.io + GitHub tarball)
- **formula name:** `tickrs`
- **version:** 0.15.0
- **service:** **false** — interactive TUI stock ticker; not a long-running brew service
- README also documents third-party `brew tap tarkah/tickrs && brew install tickrs`

## Root cause
`handleGithubRepo` treated any macOS-classified binary asset as sufficient for
`binary-release`. Intel-only macOS assets leave no active `url` on arm64 hosts
(same failure class as Linux-only binaries, which already fall through).

## Fix (Option A — fix-package only, no release)
**lib/cli.ts**: After collecting macOS `binAssetsRaw`, if none are `macosArm` /
`macosUniversal`, clear `binAssets` (intel-only skip) and fall through to older
releases / README install methods (cargo for tickrs). Log a dim diagnostic.

## Local validation
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://github.com/tarkah/tickrs" --name tickrs --tap "$(mktemp -d)" --verbose
# → cargo formula, depends_on rust, no service do, test tickrs --version
```

Host `brew install` after generate is **not** success; use `vm-install-one.mjs`.

## Residual
- Guest brew allbrew without this patch still picks binary-release → brew_fail on arm64 VM.
- Cargo source build needs `rust` (heavier than a bottle).
- Upstream may add aarch64-apple-darwin later; then binary-release becomes valid again.
