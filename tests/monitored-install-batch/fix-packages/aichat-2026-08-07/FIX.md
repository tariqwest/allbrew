# FIX: aichat (crates.io)

## URL
https://crates.io/crates/aichat

## Failure class
`generate_fail` on released allbrew (0.0.24) — classifier returns `cargo-package` for
`https://crates.io/crates/*`, but `dispatchClassification` had no case; non-interactive
runs throw `Unable to automatically handle URL`.

Same root cause as nostui-2026-08-07 / other crates.io batch URLs.

## Agent judgment
- **generator:** `cargo-package` (crates.io registry `.crate` + `cargo install *std_cargo_args`)
- **formula name:** `aichat-tap` when homebrew/core already has `aichat` (collision rename)
- **version:** 0.30.0 from crates.io (`static.crates.io/.../aichat-0.30.0.crate`)
- **service:** **false** — primary UX is CMD/REPL/shell-assistant CLI; optional `aichat --serve` is convenience HTTP, not brew-services primary
- README also documents `brew install aichat` (core)

## Fixes (batch Option A — fix-package only, no release)
1. **lib/cli.ts**: `case "cargo-package"` → `handleCargoPackage` (crateName from
   classification / `--package` / `--crate-name`), `repoInfo: null` so generator uses
   crates.io registry path.
2. **lib/generators/cargo-package.ts**: crates.io API + `.crate` URL/sha256/version when
   `repoInfo` is null (already on main WIP / nostui fix).

## Local validation (worktree)
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://crates.io/crates/aichat" --name aichat --tap "$(mktemp -d)/t" --verbose
# → Formula/aichat-tap.rb, cargo-package 0.30.0, no service do, test aichat --version
```

Host `brew install` after generate is **not** success (disk/isolation); use vm-install-one.

## Apply
```bash
git apply fix-package/patches/0001-cli-dispatch-cargo-package.patch
# or copy files/cli.ts → lib/cli.ts
```

## Residual
- Guest brew allbrew 0.0.x lacks dispatch until parent reconcile/release → VM generate_fail.
- Cargo source build needs rust (heavy; llvm bottle can exhaust disk on full host installs).
- Name collision renames to `aichat-tap`; verify/uninstall must use that name.
- Prefer core `brew install aichat` for end users when healthy upstream bottles exist.
