# Classifier breakdown — generalized fix extracted

## Scope

- Worktree: `/Users/tariqwest/Developer/allbrew-wt-classifier`
- Branch: `fix/classifier`
- Archive source: `tests/monitored-install-batch/archive/manifest.json`
  - Date: `2026-08-10`
  - Commit: `2fc0d66b2aa1fec9655129ec7676089a79c41ea9`
  - Fix packages: 213
- Exploratory scripts removed:
  - `tmp-classify-failed.mjs`
  - `tmp-classify-head.mjs`
  - `tmp-classify-urls.mjs`
  - `tmp-croc.mjs`
  - `tmp-croc2.mjs`
  - `tmp-discover.mjs`
  - `tmp-head-scripts.mjs`

## Findings

I inspected the 213 archived fix packages and the exploratory scripts for recurring, non-product-specific classifier issues. Several packages (Aldente, BalenaEtcher, Croc, Deno, Nix, SDKMAN, Zellij, Zoom, and others) contained classification changes, but most were product-specific mappings that should not be hard-coded in the core classifier.

Generalized patterns that appeared repeatedly and were safe to extract:

1. **`.pkg` installers should be `cask-dmg`, not generic `archive`.**
   - Many CDNs deliver `.pkg` with `application/octet-stream` or `application/vnd.apple.installer` plus a `Content-Disposition` header that reveals the real filename.
   - Redirects can also land on a final response path ending in `.pkg`.
   - Implemented in `lib/classifier.ts` line 162 and in the `classifyWithHead` header-classification helper.

2. **GitHub pseudo-owners should not be classified as repositories.**
   - Paths like `/sponsors/...`, `/settings/...`, `/marketplace/...`, etc. look like `owner/repo` but are GitHub site pages.
   - Added `GITHUB_RESERVED_OWNERS` to `lib/classifier.ts` (line 8) and the oracle (line 47 of `tests/helpers/classifier-oracle.ts`).

3. **Extensionless install endpoints need body/shebang sniffing.**
   - Portals such as `get.pnpm.io`, `getcroc.schollz.com`, and Zoom's installer often return misleading `text/html` to browser user agents and a real shell script to curl.
   - `classifyWithHead` now performs:
     - a `HEAD` probe with a curl-like `User-Agent`;
     - a `Range: bytes=0-1023` GET fallback;
     - a browser-UA fallback for marketing pages that only serve the script to browsers.
   - See `lib/classifier.ts` lines 70–73 and 198–226.

4. **Binary samples must be rejected before shell detection.**
   - ZIP archives served as `application/octet-stream` were at risk of being mis-classified as shell scripts.
   - Added `isBinarySample` (line 181) and used it in `sniffShellScriptBody` and the final GET fallback.

5. **Shell shebang detection was broadened.**
   - `looksLikeShellScript` (line 175) recognizes `#!/bin/sh`, `#!/bin/bash`, `#!/usr/bin/env sh`, zsh, etc.

## Product-specific changes that were NOT generalized

- Direct registry mapping for individual products (e.g. `get.pnpm.io -> pnpm`, `install.python-poetry.org -> poetry`).
- Mapping specific application homepages to Homebrew formula/cask pages.
- Release-asset preference rules for Deno or other products.
- Special-casing Oh My Zsh or similar distribution-specific scripts.

## Files changed

- `lib/classifier.ts`
  - Added reserved GitHub owner set.
  - Treats `.pkg` as `cask-dmg` by path.
  - Added curl/browser UA constants.
  - Added `looksLikeShellScript`, `isBinarySample`, `sniffShellScriptBody`, and an async `classifyWithHead` that uses `HEAD` + `Range` GET + browser fallback.
- `tests/helpers/classifier-oracle.ts`
  - Mirrored the reserved-owner logic and the `.pkg` -> `cask-dmg` rule so oracle drift is visible in validation tests.
- `tests/unit/classifier-conflict-matrix.test.ts`
  - Added conflict-matrix cases for reserved pseudo-owners, text/plain and octet-stream shell bodies, binary archive rejection, and `.pkg` via `Content-Disposition`.
- `tests/unit/classifier.test.ts`
  - Added reserved pseudo-owner rejection test.
- `tests/monitored-install-batch/logs/classifier-breakdown.md` (this file)

## Validation

### Type check

```bash
bun run check
# $ tsc --noEmit
# (pass)
```

### Classifier-targeted tests

```bash
bun test tests/unit/classifier.test.ts tests/unit/classifier-conflict-matrix.test.ts \
  tests/unit/classifier-validation.test.ts tests/unit/classifier-ground-truth.test.ts
```

Result:

- 122 pass
- 0 fail
- 2040 expect() calls
- Ran 122 tests across 4 files

### Full unit suite

```bash
bun run test
```

Result:

- 1289 pass
- 13 fail
- 4005 expect() calls
- Ran 1302 tests across 49 files

The 13 failures are pre-existing and unrelated to the classifier changes. I verified this by stashing the classifier work and re-running `bun run test`; the same 13 tests fail on the baseline worktree:

- `enrichGithubReleaseAssets > adds release DMG candidates so they beat install scripts`
- `reconcileOne docs-mode skip > skips docs packages without apply/promote`
- `reconcileOne docs-mode skip > returns dry_run for patch packages when dryRun=true`
- 10 `matchOfficialCaskByHomepage` tests (official cask homepage matching)

These failures involve page-discovery release-asset scoring, fix-package coordinator behavior, and Homebrew API cask matching, not `classify` or `classifyWithHead`.

## Branch / merge / push status

- Branch: `fix/classifier`
- No merge to `main` performed.
- No push to `origin/fix/classifier` performed; no source-sync conflict required it.
