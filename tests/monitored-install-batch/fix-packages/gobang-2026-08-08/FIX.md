# FIX: gobang (github.com/TaKO8Ki/gobang)

## URL
https://github.com/TaKO8Ki/gobang

## Failure class
`brew_fail` — guest allbrew 0.0.24 generated `binary-release` with only
`on_macos` / `on_intel` (release ships `x86_64-apple-darwin` only; no arm64).
On Apple Silicon Homebrew fails:

`Error: gobang: formula requires at least a URL`

## Agent judgment
- **generator (preferred):** `cargo-package` / source cargo (`cargo install gobang`, crates.io + GitHub tarball)
- **formula name:** `gobang`
- **version:** 0.1.0-alpha.5
- **service:** **false** — interactive TUI DB tool; not a brew service
- README also documents `brew install tako8ki/tap/gobang`

## Root cause
`handleGithubRepo` treated any macOS-classified binary asset as sufficient for
`binary-release`. Intel-only macOS assets leave no active `url` on arm64 hosts
(same class as tickrs / shiori / tdash).

## Fix (Option A — fix-package only, no release)
**lib/cli.ts**: After collecting macOS `binAssetsRaw`, if none are `macosArm` /
`macosUniversal`, clear `binAssets` (intel-only skip) and fall through to older
releases / README install methods (cargo for gobang). Log a dim diagnostic.

Patch: `patches/0001-cli-skip-intel-only-macos-binaries.patch` (same as tickrs-2026-08-08).

## Local validation
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://github.com/TaKO8Ki/gobang" --name gobang --tap "$(mktemp -d)" --verbose
# → cargo formula (url tarball + depends_on rust), no service do
```
Expected formula shape: see `formula-gobang-cargo-expected.rb`.

Host `brew install` after generate is **not** success; use `vm-install-one.mjs`.
VM bottle 0.0.24 without this patch still fails.

## Residual
- Guest brew allbrew without this patch still picks binary-release → brew_fail on arm64 VM.
- Cargo source build needs `rust` (slow on VM).
- Upstream may add aarch64-apple-darwin later; then binary-release becomes valid again.
- Alpha crate version tags may confuse livecheck.
