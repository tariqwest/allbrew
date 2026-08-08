# FIX: twitch-tui (crates.io/crates/twitch-tui)

## URL
https://crates.io/crates/twitch-tui

## Failure class
`generate_fail` — classifier correctly returns `cargo-package`, but `dispatchClassification` had **no** non-interactive handler for `cargo-package` (only npm/pip/gem/dotnet). Falls through to:
`Unable to automatically handle URL (non-interactive)`.

## Agent judgment
- Generator: **cargo-package**
- Package: **twitch-tui** (crate); binary **twt** (`[[bin]] name = "twt"` / crates.io `bin_names`)
- `service: false` — interactive Twitch chat TUI, not a supervised daemon
- Prefer **max_stable_version** (2.6.19) over alpha `newest_version` (3.0.0-alpha.3)
- Catalog `expectedBin: twitch-tui` is stale; install test should use `twt --version`

## Fixes (batch Option A — no release)
1. **`lib/cli.ts`**: `case "cargo-package"` → `handleCargoPackage`
   - Fetch crates.io metadata (identifying User-Agent)
   - Resolve GitHub repo from `repository` when present
   - Pass `crateVersion` / `crateChecksum` / `binName` into generator
2. **`lib/generators/cargo-package.ts`**:
   - `fetchCratesIoCrate`, `parseGithubRepoFromUrl`, `cratesIoCrateUrl`
   - Versioned install via `static.crates.io` crate tarball + checksum + `version`
3. **`lib/templates/formula/cargo-package.ts`**: omit `head` when no real GitHub fullName
4. **Unit tests**: `tests/unit/generators/cargo-crates-io.test.ts`

## Validation (worktree)
```bash
bun test tests/unit/generators/cargo-crates-io.test.ts tests/unit/generators/cargo-package.test.ts
# 37 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://crates.io/crates/twitch-tui" --name twitch-tui --tap "$(mktemp -d)/tap" --verbose
# → Formula with twt --version test, no service do, version 2.6.19 crate URL
```

## Apply
```bash
# preferred: copy full files from patches/
cp fix-package/patches/cli.ts lib/cli.ts
cp fix-package/patches/cargo-package.ts lib/generators/cargo-package.ts
cp fix-package/patches/cargo-package.template.ts lib/templates/formula/cargo-package.ts
cp fix-package/tests/cargo-crates-io.test.ts tests/unit/generators/
# or: git apply fix-package/patches/*.patch (may need ordering)
```

## Residual
- Guest brew allbrew still lacks handler until promote/release → VM install remains generate_fail on released bottle.
- Rust source build of twitch-tui is heavy (rustc + crate deps); may hit wall-clock on slow VMs.
- `guessLicenseIdentifier` maps dual MIT OR Apache-2.0 to a single SPDX token.
- Livecheck regex may prefer `newest_version` (alpha) over stable depending on JSON order.
