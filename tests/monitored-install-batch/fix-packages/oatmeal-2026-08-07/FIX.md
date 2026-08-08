# FIX: oatmeal (https://crates.io/crates/oatmeal)

## Failure class
`generate_fail` — classifier correctly returns `cargo-package` for crates.io URLs, but `dispatchClassification` in `lib/cli.ts` has no `cargo-package` case (falls through to unknown). Non-interactive mode throws `Unable to automatically handle URL`. Secondary: HEAD `lib/generators/cargo-package.ts` requires GitHub `repoInfo` and cannot build a formula from crates.io metadata alone.

## Expected
- Generator: **cargo-package**
- Formula: `oatmeal`, bin `oatmeal`
- `service: false` (interactive LLM TUI; not brew-services)
- Stable `.crate` URL from crates.io + livecheck against crates API
- No service stanza

## Agent judgment
- inputShape: crates.io package page
- Not on formulae.brew.sh/formula/oatmeal (404) — no Case C skip
- Upstream README also documents `brew install dustinblackman/tap/oatmeal` (third-party tap)

## Fixes (batch — no release)
1. **lib/cli.ts**: add `handleCargoPackage` + `case "cargo-package"` in `dispatchClassification` (mirror npm/pip/gem registry handlers; `repoInfo: null`, `crateName` from classification).
2. **lib/generators/cargo-package.ts**: crates.io registry path — `fetchCratesIoCrate` (User-Agent), `.crate` url/sha256/version, synthetic repoInfo from repository URL, optional binNames.

## Validation
```bash
# worktree
bun test tests/unit/generators/cargo-package.test.ts tests/unit/generators/cargo-package-oatmeal.test.ts
# 33 pass

CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://crates.io/crates/oatmeal" --name oatmeal --tap "$(mktemp -d)" --verbose
# → Formula/oatmeal.rb with static.crates.io .crate, no service do
```

## Apply
```bash
git apply fix-package/patches/0001-cli-handle-cargo-package-dispatch.patch
git apply fix-package/patches/0002-cargo-package-crates-io-registry-path.patch
# or copy files/cli.ts + files/cargo-package.ts over lib/
```

## Residual
- Guest brew allbrew lacks this until parent reconcile/release.
- Host disk pressure can fail `brew install` when pulling `llvm`/`rust` bottles (env, not product).
- Cargo source build is heavy (rust/llvm); prefer upstream `dustinblackman/tap/oatmeal` bottle for end users if acceptable.
