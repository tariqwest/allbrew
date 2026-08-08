# FIX: nostui (crates.io)

## URL
https://crates.io/crates/nostui

## Failure class
`generate_fail` — classifier returns `cargo-package` for crates.io URLs, but `dispatchClassification` had no case; non-interactive runs throw `Unable to automatically handle URL`. Secondary: cargo-package generator on HEAD only accepted GitHub `repoInfo` (no crates.io registry `.crate` fetch path).

## Expected
- **generator:** `cargo-package`
- **formula:** `nostui` from `https://static.crates.io/crates/nostui/nostui-0.1.1.crate`
- **service:** false (interactive Nostr TUI CLI)
- **deps:** `rust` => :build only

## Fixes (batch — no release)
1. **lib/cli.ts**: `case "cargo-package"` → `handleCargoPackage` (crateName from classification / `--package` / `--crate-name`).
2. **lib/generators/cargo-package.ts**: crates.io API fetch + `.crate` URL/sha256/version when `repoInfo` is null (already present as dirty WIP on some checkouts; include full file).

## Local validation
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://crates.io/crates/nostui" --name nostui --tap "$(mktemp -d)" --verbose
# → Formula/nostui.rb cargo-package, no service do
```

## Apply
```bash
git apply fix-package/patches/0001-cli-dispatch-cargo-package.patch
git apply fix-package/patches/0002-cargo-package-crates-io-registry-path.patch
# or copy files/cli.ts and files/cargo-package.ts
```

## Residual
- Guest brew allbrew 0.0.x lacks this until parent reconcile/release.
- Cargo source build is heavy (rust); first install may exceed short guest timeouts.
- Host brew auto-install after generate is not the success path (use vm-install-one).
