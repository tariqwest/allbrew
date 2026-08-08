# FIX: go2tv (https://github.com/alexballas/go2tv)

## Failure class
**generate_fail / brew_fail** — GitHub macOS release zips are arch-tagged
(`go2tv_v*_macOS_arm64.zip`) so `isAppAsset()` classifies them as CLI binary
archives → `binary-release`. Archive listing only exposes `LICENSE` / `README.md`
at shallow depth (real binary lives in `go2tv.app/Contents/MacOS/go2tv`), so the
formula symlinks `LICENSE` as `go2tv`. Install "succeeds" but no usable binary;
official product is a **cask** (`brew install --cask go2tv`).

## Root cause
1. `isAppAsset` returns false for any macOS/darwin zip with a CPU arch tag
   (correct for gogs-style CLI zips; wrong for app-in-zip releases like go2tv).
2. `pickArchiveEntrypoint` allowed `LICENSE` as a candidate (depth ≤ 1) and
   did not hard-exclude doc basenames.
3. No content-based reclassification when a "binary" zip actually contains
   `*.app/`.

## Independent judgment
- **generator:** `cask-app-release` (GUI `.app` in macOS zip)
- **service:** `false` (GUI/CLI cast tool; optional Web UI is not brew-services)
- **upstream:** README documents `brew install --cask go2tv` (homebrew/cask)

## Fix (batch mode — fix-package only, no release)
1. `membersContainMacAppBundle(members)` in `lib/utils.ts`.
2. `lib/cli.ts` — before `binary-release`, peek one macOS archive listing; if it
   contains a `.app` bundle, route to `cask-app-release` with
   `extraAppAssetNames` (mac arch zips).
3. `lib/generators/cask-app-release.ts` — honor `options.extraAppAssetNames`;
   prefer host-arch asset.
4. `lib/generators/binary-release.ts` — refuse archives that contain `.app`;
   hard-exclude LICENSE/README from `pickArchiveEntrypoint`; export
   `listArchiveMembersFromPath`.

## Validation
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 PATH="/tmp/fakebrew-go2tv:$PATH" \
  bun run bin/allbrew.ts "https://github.com/alexballas/go2tv" \
  --name go2tv --tap "$(mktemp -d)" --verbose
# → Casks/go2tv.rb with app "go2tv.app", arm64 sha256 matching official cask
bun test tests/unit/utils.test.ts --test-name-pattern membersContainMacAppBundle
```

## Residual risk
- Single-arch cask URL (host arch) vs official multi-`arch` cask.
- Peek downloads one zip per generate (extra network).
- VM bottle still broken until fix is released; prefer `brew install --cask go2tv`
  from homebrew/cask for end users.
- Linux zips remain real CLI archives; only mac peek is reclassified.
