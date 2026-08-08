# FIX: bun (https://github.com/oven-sh/bun)

## Case
GitHub repo dogfood for oven-sh/bun (not formulae.brew.sh). JS runtime with multi-platform release zips.

## Failures observed (allbrew 0.0.24 / pre-fix main)

1. **`matchAssetToArch` miss for `bun-darwin-aarch64.zip`**
   - Patterns had `aarch64.*darwin` but not `darwin.*aarch64`.
   - Host darwin/arm64 saw "no host binary assets" → skipped binary-release.
2. **`prompt_hang` on upstream brew offer**
   - README documents `brew tap oven-sh/bun && brew install bun`.
   - Non-interactive CI/VM still called unguarded `@inquirer/prompts` `select`.
3. **Secondary asset preference**
   - Without scoring, linux could pick `*-android.zip` / profile variants over primary glibc builds.
4. **Hardcoded archive entrypoint**
   - Inspecting only macos arm archive produced `libexec/"bun-darwin-aarch64/bun"` — breaks intel/linux.

## Agent judgment
- generator: **binary-release**
- package/formula name: **bun-tap** (core collision with homebrew/core `bun`)
- service: **false** (CLI/runtime)
- bin: **bun**

## Fixes (batch mode: fix-package only, no release)
1. `lib/utils.ts` — add `darwin.*aarch64` / `macos.*aarch64` (and reverse) to `macosArm`.
2. `lib/cli.ts` — non-interactive skip of upstream brew offer → `continue`.
3. `lib/generators/binary-release.ts` — asset preference score (penalize android/profile/baseline/musl); portable `Dir[libexec/"**/bun"]` install body for nested archives.
4. Unit tests for `bun-darwin-aarch64.zip` matching.

## Validation
- Local temp-tap generate: formula `bun-tap` with correct mac/linux primary URLs and portable install.
- Unit: matchAssetToArch bun-darwin-aarch64 → macosArm.
- VM 0.0.24 bottle still unfixed until reconcile/release.

## Residual risk
- Core `bun` collision → formula named `bun-tap`; bin may fail `brew link` if core bun is linked.
- Released bottle lacks fix; VM install on 0.0.24 still fails until patch applied in guest or release.
