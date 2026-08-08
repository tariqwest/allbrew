# FIX: monk-mode (https://mac.monk-mode.lifestyle)

## Failure class
**brew_fail** (VM bottle 0.0.24) — cask URL embeds version as `MonkMode_0.1.0_aarch64.dmg` but `extractVersionFromUrl` only matched `[/-]`, so version is empty → Homebrew `undefined method 'latest?' for nil`.

Secondary (dirty tree with Unfatten compact-version helper): `extractCompactVersion("…aarch64.dmg")` matched `r64` → false version **6.4**.

## Product (agent judgment)
- macOS **GUI** feed-blocker app (Apple Silicon, macOS 13+)
- Marketing site; artifact: `https://mac.monk-mode.lifestyle/downloads/MonkMode_0.1.0_aarch64.dmg`
- **service: false** (no brew services)
- Expected generator: **cask-app**

## Root causes
1. Underscore-separated dotted versions not parsed (`_0.1.0_`).
2. Compact two-digit fallback misreads arch suffixes ending in letter+digits (`aarch64` → 6.4).

## Fix (Option A — fix-package only, no release)
`lib/generators/cask-app.ts`:
- `extractVersionFromUrl`: allow `_` in separator class → `0.1.0`
- `extractCompactVersion`: return null for `aarch64` / `x86_64` / `arm64` / `amd64` / `x64` suffixes

## Local validation (patched source)
```text
version "0.1.0"
url "…/MonkMode_0.1.0_aarch64.dmg"
app "MonkMode.app"
sha256 a59a6466…
host brew install --cask succeeded then uninstalled (isolation cleanup)
```

## Residual risk
- Apple Silicon-only DMG (no x86_64 build on site)
- livecheck header_match on pinned DMG URL is weak
- desc still low-quality ("Install from URL") when displayName empty path
- Unsigned/indie DMG gatekeeping on fresh VMs
