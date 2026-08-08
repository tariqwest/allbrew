# FIX: deno (https://github.com/denoland/deno)

## Case
GitHub repo for denoland/deno. JS/TS runtime with multi-platform release zips plus secondary `denort` / `libdenort` assets and `.bsdiff` deltas.

## Failures observed (allbrew 0.0.24 / main)

1. **Wrong binary asset selected per arch**
   - `collectBinaryReleasePayload` last-write-wins over `archAssets[arch]`.
   - Release order ends with `libdenort-*-apple-darwin.zip` → formula downloaded the dylib archive.
   - `bin.install "deno"` failed: `Errno::ENOENT: No such file or directory - deno`.

2. **`.bsdiff` classified as binary**
   - `deno-*.from-2.9.4.bsdiff` matched `isBinaryAsset` + arch patterns, competing with real zips.

## Agent judgment
- generator: **binary-release**
- package/formula name: **deno-tap** (core collision with homebrew/core `deno`)
- service: **false** (CLI/runtime; not a long-lived brew service)
- bin: **deno**

## Fixes (batch mode: fix-package only, no release)
1. `lib/generators/binary-release.ts` — `scoreBinaryReleaseAsset()` prefers product-stem match (`deno`), penalizes `lib*` / product-prefix secondaries (`denort`), android/profile/musl/deltas; keep highest score per arch.
2. `lib/utils.ts` — `isDeltaPatchAsset` + skip `.bsdiff`/`.delta`/`.patch` in bare-binary suffixes; `isBinaryAsset` rejects deltas.
3. Unit tests for scoring, deno multi-asset selection, and bsdiff rejection.

## Validation
- Unit: binary-release + utils (91 pass).
- Local temp-tap generate: formula `deno-tap` URLs are `deno-*-apple-darwin.zip` / linux gnu zips (not libdenort).
- Host brew install may fail at **link** if core `deno` already owns the bin (expected); VM clean prefix is the success path after reconcile/release.
- Released bottle 0.0.24 still unfixed until parent reconcile.

## Residual risk
- Core `deno` collision → formula named `deno-tap`; `brew link` conflicts if core deno is installed.
- Large multi-arch downloads for hashing during generate.
