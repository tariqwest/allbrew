# Fix: @hehehai/buke (npm engines.bun → depends_on "bun")

## Package
- URL: https://npmjs.com/package/@hehehai/buke
- Slug: hehehai-buke
- Generator: npm-package

## Failure
VM install of the generated formula reported success (`brew install` unpacks via npm), but post-install binary verification was weak:
1. Harness `strictVerifyCmd` looks for a binary named after the **formula** (`hehehai-buke`), while the real bin is **`buke`** → `BIN_MISSING` in batch verify.
2. Product bug: published tarball has shebang `#!/usr/bin/env bun` and `engines.bun: ">=1.3.0"`. Formula only had `depends_on "node"`. Without Bun on PATH, `buke --version` fails with `env: bun: No such file or directory`.

Upstream’s own Homebrew formula installs a **prebuilt binary** from GitHub Releases (`hehehai/tap/buke`), not the npm package path.

## Root cause
`lib/generators/npm-package.ts` / npm template always emit `depends_on "node"` and never consult `package.json` `engines.bun`.

## Fix
- Detect `engines.bun` via `npmPackageNeedsBun(versionData)`.
- Emit `runtimeDependsLines: depends_on "bun"` into the npm formula template after `depends_on "node"`.
- Unit coverage: fixture `@hehehai/buke` + `npmPackageNeedsBun` tests.

## Validation
- `bun test tests/unit/generators/npm-package.test.ts` → 85 pass (worktree).
- Local generate with fix shows both `depends_on "node"` and `depends_on "bun"`.
- Full VM re-verify after fix was blocked by Homebrew lock contention on pool endpoints; re-run VM install after merge expected to install bun as dependency and run `buke --version`.

## Residual risk
- `depends_on "bun"` assumes a Homebrew formula named `bun` is available (core or oven-sh/bun). If the user’s Homebrew lacks that formula, install fails until they tap it.
- Batch `strictVerifyCmd` still checks `command -v $FORMULA_NAME` not `testBinName` — scoped npm CLIs will still report `BIN_MISSING` unless harness is fixed separately.
- Preferring GitHub release binaries for this package may be healthier long-term than npm+bun.
