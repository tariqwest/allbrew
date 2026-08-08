# FIX: paw (https://github.com/lucor/paw)

## Failure class
**generate_fail / brew_fail** — released allbrew treats arch-tagged macOS zips as CLI
`binary-release`, then (1) prefers `.minisig` sidecars as download URLs, and (2) even
with real zips, symlinks `THIRD_PARTY_LICENSES` as the formula binary because the zip
contains `Paw.app` (Fyne GUI).

## Root cause
1. `isBareBinaryAsset` did not skip `.minisig` / `.minisign`; iteration overwrote real
   archives with signature assets for the same arch.
2. `isAppAsset` returns false for arch-tagged macOS zips (CLI heuristic); no content peek
   for nested `.app` (same class as go2tv).
3. `pickArchiveEntrypoint` could still pick license files at depth ≤ 1 when no true CLI
   binary is present at shallow paths.

## Independent judgment
- **generator:** `cask-app-release` (macOS zip contains `Paw.app`)
- **service:** `false` (GUI password manager; optional SSH agent is not brew-services)
- **formula alternative:** `go install lucor.dev/paw@latest` / go-package for CLI-from-source

## Fix (batch mode — fix-package only, no release)
1. Skip `.minisig`/`.minisign` in bare-binary suffix list; prefer archives over bare when
   selecting per-arch assets.
2. `membersContainMacAppBundle` + CLI peek of one macOS archive → route to
   `cask-app-release` with `extraAppAssetNames`.
3. `cask-app-release` honors `extraAppAssetNames` and prefers host arch.
4. `binary-release` refuses `.app` archives; hard-exclude THIRD_PARTY_LICENSES-style docs
   from entrypoint selection; export `listArchiveMembersFromPath`.

## Validation
```bash
bun test tests/unit/utils.test.ts --test-name-pattern "minisign|membersContain"
CI=1 ALLBREW_NONINTERACTIVE=1 PATH="/tmp/fakebrew:$PATH" \
  bun run bin/allbrew.ts "https://github.com/lucor/paw" --name paw --tap "$(mktemp -d)" --verbose
# → Casks/paw.rb with app "Paw.app", arm64 zip URL (no .minisig)
```

## Residual risk
- Single-arch cask URL (host arch) vs multi-`arch` cask.
- Peek downloads one zip per generate.
- VM bottle still broken until fix is released.
- Linux tar.xz remain CLI archives if someone forces binary-release.
