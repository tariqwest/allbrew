# FIX: sanebar (https://sanebar.com)

## Failure class
**brew_fail** — generated cask installs nested Sparkle `Updater.app` instead of outer `SaneBar.app`:
`Error: It seems the App source '.../Updater.app' is not there.`

## Root cause
SaneBar ZIP has root `SaneBar.app/` embedding Sparkle
`.../Frameworks/Sparkle.framework/Versions/B/Updater.app`.
`classifyContents` in `lib/archive-inspector.ts` used the **first**
`.app/Contents/Info.plist` from a recursive walk, which often hits nested
Updater before the outer SaneBar bundle.

Same root cause as popclip-2026-08-07.

## Independent judgment (Phase 0.5)
- **input:** product homepage (`sanebar.com`) with JSON-LD downloadUrl ZIP
- **generator:** `cask-app` (page-discover → archive inspect → cask)
- **app:** `SaneBar.app` (menu bar icon manager, MIT)
- **service:** `false` (GUI cask only)
- **upstream Homebrew:** no official cask for SaneBar (sanesidebuttons is unrelated)

## Fix (batch mode — fix-package only, no release)
`lib/archive-inspector.ts`:
- Add `pickPrimaryAppName()`: collect all `.app/Contents/Info.plist` paths;
  prefer candidates **not nested inside another `.app/`**; then shallowest depth.
- Unit test: Sparkle nested Updater → still `SaneBar.app`.

## Validation
```bash
bun test tests/unit/archive-inspector-sparkle-sanebar.test.ts  # pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://sanebar.com" --name sanebar --tap "$(mktemp -d)" --verbose
# Found app bundle: SaneBar.app
# app "SaneBar.app" in cask; version 2.1.89
```

## VM
- local-1: SSH unavailable
- homeserver: sparsebundle attach failed at /opt/homebrew
- local-2: mutex held by other agents for full wall window
Stock bottle still selects Updater.app until fix is released/upgraded in VM.

## Residual risk
- `name "SaneBar.app"` display should strip `.app` for polish (separate).
- desc falls back to "Install from <url>" instead of homepage marketing copy.
- Nested-only archives still pick outermost non-nested.
