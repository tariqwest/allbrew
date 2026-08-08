# FIX: emulsion (crates.io)

## URL
https://crates.io/crates/emulsion

## Failure class
`generate_fail` on released allbrew (0.0.24) — classifier returns `cargo-package` for
`https://crates.io/crates/*`, but `dispatchClassification` had no `cargo-package` case;
non-interactive runs throw `Unable to automatically handle URL`.

Same root cause as oatmeal-2026-08-07 / aichat-2026-08-07 / nostui-2026-08-07.

## Agent judgment
- **generator:** `cargo-package` (crates.io `.crate` + `cargo install *std_cargo_args`)
- **formula name:** `emulsion`, bin `emulsion`
- **version:** 12.0.0 from crates.io
- **service:** **false** — desktop GUI image viewer (discontinued); not a daemon
- Upstream README: `cargo install emulsion`; project marked DISCONTINUED

## Fixes (batch Option A — fix-package only, no release)
1. **lib/cli.ts**: `case "cargo-package"` → `handleCargoPackage` (crateName from
   classification / `--package` / `--crate-name`), `repoInfo: null`.
2. **lib/generators/cargo-package.ts**: crates.io API + `.crate` URL/sha256/version when
   `repoInfo` is null.

## Local validation (worktree on clean HEAD + patches)
```bash
git apply fix-package/patches/0001-cli-handle-cargo-package-dispatch.patch
git apply fix-package/patches/0002-cargo-package-crates-io-registry-path.patch
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://crates.io/crates/emulsion" --name emulsion --tap "$(mktemp -d)/t" --verbose
# → Formula/emulsion.rb, cargo-package 12.0.0, no service do
```

## Apply
```bash
git apply fix-package/patches/0001-cli-handle-cargo-package-dispatch.patch
git apply fix-package/patches/0002-cargo-package-crates-io-registry-path.patch
# or copy files/cli.ts → lib/cli.ts and files/cargo-package.ts → lib/generators/
```

## Residual
- Guest brew allbrew 0.0.24 lacks dispatch until parent reconcile/release → VM generate_fail.
- Emulsion is a discontinued GUI image viewer; cargo build may need system graphics libs.
- Formula `test do` uses `emulsion --version` — GUI crates sometimes lack --version.
- Prefer upstream installers from ArturKovacs/emulsion releases for end users if available.
