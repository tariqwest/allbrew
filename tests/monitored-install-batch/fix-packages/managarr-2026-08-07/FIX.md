# FIX: managarr (https://crates.io/crates/managarr)

## Failure class
**generate_fail** — classifier returns `cargo-package` for crates.io URLs, but
`dispatchClassification` has no non-interactive handler for `cargo-package` (or
`go-package`). Falls through to:
`Unable to automatically handle URL (non-interactive)`.

## Root cause
`lib/cli.ts` wires npm/pip/gem/dotnet registry URLs into handlers, but crates.io
classification stops at `classify()` → missing `case "cargo-package"`.

## Independent judgment
- **generator:** `cargo-package`
- **package:** managarr (TUI/CLI Servarr manager)
- **service:** `false` (interactive TUI/CLI; not a daemon)
- **note:** upstream also publishes `brew tap Dark-Alex-17/managarr` (outside allbrew)

## Fix (batch mode — fix-package only, no release)
1. **`lib/cli.ts`**: `case "cargo-package"` → `handleCargoPackage`; `case "go-package"` → `handleGoPackage`.
2. **`handleCargoPackage`**: fetch crates.io metadata via `fetchCratesIoCrate`, build
   synthetic `repoInfo` via `repoInfoFromCratesMeta`, pass `cratesMeta` into
   `generateCargoPackage` with `fromCratesIo`.
3. Ensure `lib/generators/cargo-package.ts` exports registry path helpers
   (`fetchCratesIoCrate`, `repoInfoFromCratesMeta`) — present on working tree;
   older published bottles may still lack them.

## Validation
```bash
# unit
bun test tests/unit/classifier.test.ts --test-name-pattern crates
bun test tests/unit/generators/cargo-package.test.ts

# local temp tap (fake brew to avoid host install)
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://crates.io/crates/managarr" --name managarr --tap "$(mktemp -d)" --verbose
# → Formula/managarr.rb with static.crates.io .crate URL, no service block
```

## VM (released bottle 0.0.24)
Confirmed `generate_fail` on local-2: same dispatch miss. VERIFY_OK=false.

## Residual risk
- Cargo build of managarr is heavy (Rust); real brew install may exceed 15m wall.
- crates.io may rate-limit bare User-Agents; generator already sets descriptive UA.
- Until release, VM uses bottle without fix.
