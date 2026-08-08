# FIX: popclip (https://popclip.app)

## Failure class
**brew_fail** — generated cask installed `Updater.app` path which does not exist at
the zip root: `Error: It seems the App source '.../Updater.app' is not there.`

## Root cause
PopClip's ZIP is `PopClip.app/` at the archive root, but the app embeds Sparkle
with a nested `PopClip.app/Contents/Frameworks/Sparkle.framework/.../Updater.app`.
`classifyContents` in `lib/archive-inspector.ts` used the **first**
`.app/Contents/Info.plist` from a recursive filesystem walk, which often hits
the nested Sparkle Updater before the outer PopClip bundle.

## Independent judgment (Phase 0.5)
- **input:** commercial GUI homepage (`popclip.app` → free trial ZIP)
- **generator:** `cask-app` (page-discover → archive inspect → cask)
- **app:** `PopClip.app` (text-selection action palette)
- **service:** `false` (GUI cask only)
- **upstream Homebrew:** healthy official cask `homebrew/cask` token `popclip`
  (`brew install --cask popclip`, version 2026.7.1, same pilotmoon ZIP). Case C:
  prefer official cask when user only needs install; allbrew still generates
  `popclip-tap` when colliding with homebrew/cask token.

## Fix (batch mode — fix-package only, no release)
`lib/archive-inspector.ts`:
- Add `pickPrimaryAppName()`: collect all `.app/Contents/Info.plist` paths;
  prefer candidates **not nested inside another `.app/`**; then shallowest depth.
- Unit test: Sparkle-style nested Updater listed first in zip → still
  `PopClip.app`.

## Validation
```bash
bun test ./tests/unit/archive-inspector.test.ts   # 7 pass (incl. Sparkle case)
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://popclip.app" --name popclip --tap "$(mktemp -d)" --verbose
# Found app bundle: PopClip.app
# app "PopClip.app" in cask; sha256 matches official cask
```

## VM (allbrew 0.0.24 bottle)
`local-2` install with stock bottle still selects `Updater.app` and fails brew
install until fix is released/upgraded in the VM.

## Residual risk
- `name "PopClip.app"` display (should strip `.app` for polish — separate).
- Official cask collision renames to `popclip-tap`; users may want Case C
  upstream `brew install --cask popclip` instead of a tap duplicate.
- Nested-only archives (app only inside a wrapper folder with helper apps)
  still pick outermost non-nested; if only helpers are top-level, behavior
  unchanged from pre-fix "first find".
