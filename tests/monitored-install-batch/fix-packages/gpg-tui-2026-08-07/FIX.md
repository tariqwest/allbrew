# FIX: gpg-tui (GitHub orhun/gpg-tui)

## URL
https://github.com/orhun/gpg-tui

## Failure class
`generate_fail` — Linux-only GitHub release assets short-circuit to `binary-release`, which throws "No macOS binary assets". Secondary: non-interactive hang risk on upstream `brew install` offer; cargo formula missing native deps (gpgme).

## Expected
- Interactive GnuPG **TUI CLI** (Rust). `service: false`.
- README documents `brew install gpg-tui` (homebrew/core) + `cargo install gpg-tui`.
- Releases ship Linux-only tarballs → allbrew must **not** take binary-release; fall through to README → `cargo-package`.
- Core name collision → formula `gpg-tui-tap` with `binName` `gpg-tui`.
- Cargo formula needs `gpgme`, `gnupg`, `libgpg-error`, `pkgconf`, `libxcb` (from Cargo.toml).

## Fixes (batch — no release)
1. **lib/cli.ts**: treat only macOS-arch binary assets as binary-release candidates; log Linux-only and fall through to README.
2. **lib/cli.ts**: non-interactive skip of upstream brew offer (`continue` generate).
3. **cargo-package**: `inferCargoBrewDependencies(Cargo.toml)` + `dependenciesLines` on payload/template; fetch Cargo.toml via GitHub API.

## Validation
```bash
bun test tests/unit/generators/cargo-package.test.ts  # 34 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://github.com/orhun/gpg-tui" --name gpg-tui --tap "$(mktemp -d)" --verbose
# → cargo-package, gpg-tui-tap.rb with gpgme deps
```

## Apply
```bash
git apply fix-package/patches/0001-fix-gpg-tui-linux-binary-cargo-deps.patch
```

## Residual
- Guest brew allbrew 0.0.24 lacks this until release/reconcile.
- Cargo source build is heavy (rust/llvm); prefer core `gpg-tui` bottle when Case C is accepted.
- `libxcb` heuristic via arboard+wayland-data-control may over-deps non-TUI crates (rare).
