# FIX: shiori (https://github.com/go-shiori/shiori)

## Case
Go bookmark manager (go-shiori/shiori). Goreleaser assets: `shiori_Darwin_aarch64_1.8.0.tar.gz`, `shiori_Darwin_x86_64_…`, Linux aarch64/x86_64.

## Agent judgment
- generator: **binary-release** (prebuilt release tarballs; go-package also viable)
- service: **true** (`shiori serve` long-running web UI; k8s deploy uses serve) — allbrew auto-detect currently omits service block (warn mismatch, not brew_fail)
- bin: shiori

## Failures observed

### Local generate (main / unfixed)
- Classifies github-repo → binary-release v1.8.0
- `matchAssetToArch("shiori_Darwin_aarch64_1.8.0.tar.gz")` → **null** (patterns only had aarch64.*darwin, not darwin.*aarch64)
- Formula only `on_macos/on_intel` + Linux — Apple Silicon: `Error: shiori: formula requires at least a URL` → **brew_fail**

## Fixes (worktree validated, batch mode — no release)
1. **`archPatterns().macosArm`** in `lib/utils.ts`
   - add `/darwin.*aarch64/i`, `/macos.*aarch64/i`, `/osx.*a(rm64|arch64)/i`, `/aarch64.*macos/i`
2. Unit tests for goreleaser `Darwin_aarch64` asset names

## Validation
- `bun test tests/unit/utils.test.ts --test-name-pattern matchAssetToArch` — pass
- Local generate after fix: both Darwin arm + intel URLs; detected assets include aarch64
- Host brew install succeeded after fix (cleaned for isolation); **VM install still required** for green path; guest may still ship unfixed allbrew until reconcile/release

## Residual risk
- Service under-detection (`service: false` vs agent true) until analyzer recognizes `serve` for bookmark daemons
- Guest allbrew 0.0.24 without this patch will still fail arm64 formula URL
