# Fix: tdash (jessfraz/tdash) incomplete binary-release on Apple Silicon

## Package
- **URL:** https://github.com/jessfraz/tdash
- **Slug / formula:** `tdash`
- **Kind after fix:** go-package (source build via `go build` + `std_go_args`)
- **Version observed:** 0.5.5

## Failure class
`brew_fail` — generated binary-release formula has only `on_macos / on_intel` (darwin-amd64 asset). On Apple Silicon Homebrew reports: `tdash: formula requires at least a URL`.

## Root cause
1. Early binary-release short-circuit in `handleGithubRepo` treated *any* platform-matched binary asset (`matchAssetToArch`) as sufficient, including `tdash-darwin-amd64` + Linux assets on `darwin/arm64`.
2. `collectBinaryReleasePayload` emitted macOS intel-only `url` blocks; no `on_arm` → empty active spec on arm64 Mac.
3. Repo is Go (`go.mod`, language Go) and would install correctly as `go-package`.

## Fix (batch Option A — fix-package only, no release)
| File | Change |
|------|--------|
| `lib/utils.ts` | Add `isHostCompatibleBinaryAsset` / `releaseHasHostCompatibleBinary` (host OS/CPU vs macosArm/Intel/Universal/linux*). |
| `lib/cli.ts` | Auto-select binary-release only when host-compatible CLI binaries exist; otherwise log skip and fall through to README / repo files (go.mod → go-package). |
| `lib/generators/binary-release.ts` | Fail fast if generating on darwin/arm64 without macosArm (or darwin/x64 without macosIntel). |
| `tests/unit/utils.test.ts` | Coverage for tdash-like asset sets. |

## Validation (local worktree, temp tap)
```text
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  https://github.com/jessfraz/tdash --name tdash --tap "$TMP_TAP" --verbose
# → go-package formula, brew install succeeds, bin tdash
```

## Agent judgment
- **expected.service:** `false` (interactive TUI dashboard)
- **expected.generator:** go-package (or binary-release only when host arch binary exists)
- **codebase (stock):** binary-release, intel-only macOS → brew_fail on arm64
- **after fix:** go-package, no service block

## Residual risk
- Until released/merged, VM stock allbrew still generates broken binary-release on arm64.
- Upstream has no darwin-arm64 release asset; go build is the correct packaging on Apple Silicon.
- Formula `test` uses `--version`; CLI documents `tdash version` subcommand — verify may need help path.
