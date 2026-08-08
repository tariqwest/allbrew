# FIX: krokiet (crates.io cargo-package dispatch)

## URL
https://crates.io/crates/krokiet

## Failure class
`generate_fail` — classifier returns `cargo-package` for crates.io URLs, but `dispatchClassification` had no `case "cargo-package"` (or `go-package`). Non-interactive runs throw `Unable to automatically handle URL`.

## Expected
- Generator: `cargo-package`, package/crate `krokiet`, bin `krokiet`
- `service: false` (Slint GUI frontend for Czkawka, not a daemon)
- Stable source from crates.io `.crate` artifact (monorepo `qarmin/czkawka` must not be used as sole workspace root install)

## Fixes (batch — no release)
1. **lib/cli.ts**: add `handleCargoPackage` / `handleGoPackage` and wire them in `dispatchClassification`.
2. **lib/generators/cargo-package.ts**: `fetchCratesIoCrate` + `repoInfoFromCratesMeta`; registry path emits `url`/`sha256`/`version` for `static.crates.io` `.crate` files (User-Agent required by crates.io).
3. **tests/unit/generators/cargo-package.test.ts**: crates.io path + githubFullName helper.

## Validation
```bash
bun test tests/unit/generators/cargo-package.test.ts
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://crates.io/crates/krokiet" --name krokiet --crate-name krokiet \
  --tap "$(mktemp -d)/tap" --verbose
# → Generated Formula/krokiet.rb with static.crates.io .crate url
```

## Residual
- Guest brew allbrew 0.0.24 still fails until release/reconcile.
- Building krokiet from source is **heavy** (Slint + czkawka_core, rustc); may exceed 15m VM wall even after generate works.
- GUI binary may not honor `--version` the way `test do` expects; verify with `--help` if needed.
- `head` points at monorepo root (czkawka); stable install uses `.crate` only.
