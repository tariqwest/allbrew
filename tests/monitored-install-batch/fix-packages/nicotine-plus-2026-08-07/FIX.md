# FIX: nicotine-plus (https://github.com/nicotine-plus/nicotine-plus)

## Failure class
**brew_fail** / **generate_fail shape** — allbrew treated `macos-arm64-installer.zip` as a CLI **binary-release** formula and symlinked the inner **DMG** into `bin/`. Install is nonsense (not a runnable CLI). Correct path is **cask-app-release** with `container nested:` for the zip-wrapped DMG and `app "Nicotine+.app"`.

## Root cause
1. `isAppAsset()` rejects arch-tagged `macos`/`darwin` zips as CLI binaries. Names like `macos-arm64-installer.zip` contain both `macos` + `arm64`, so they never became app assets.
2. Even after classification, `detectAppNameFromAsset` only looked for `.app` inside the zip — Nicotine+ ships a **zip → DMG → .app** chain, so generation would fail without nested-DMG inspection + `container nested:`.

## Independent judgment (Phase 0.5)
- **input:** github-repo `nicotine-plus/nicotine-plus`
- **agent preferred:** desktop GUI; service **false**; upstream **homebrew/core** formula `nicotine-plus` (PyPI/GTK) is healthy; DOWNLOADS.md documents `brew install nicotine-plus`
- **codebase (broken bottle):** `binary-release` formula `nicotine-plus-tap` (core name collision) with DMG symlink
- **codebase (fixed local):** `cask-app-release` cask `nicotine-plus` + nested DMG

## Fix (batch mode — fix-package only, no release)
- `lib/utils.ts` `isAppAsset`: treat word-boundary `installer` + mac token as app asset (even with cpu arch).
- `lib/generators/cask-app-release.ts`: open nested `.dmg` inside zip, resolve `.app`, emit `container nested:`.
- `CaskAppReleasePayload.containerBlock` + template render.
- Unit tests: installer zip classification + Nicotine+-style nested DMG payload.

## Validation
```bash
bun test ./tests/unit/utils.test.ts ./tests/unit/generators/cask-app-release.test.ts
bun run test:templates
CI=1 ALLBREW_NONINTERACTIVE=1 DRY_RUN=1 bun run bin/allbrew.ts \
  "https://github.com/nicotine-plus/nicotine-plus" --name nicotine-plus \
  --tap "$(mktemp -d)" --verbose
# → Detected macOS app assets: macos-arm64-installer.zip, …
# → Casks/nicotine-plus.rb with container nested + Nicotine+.app
```

## Residual risk
- Single-arch cask URL (host arch only); no `on_arm`/`on_intel` dual urls yet.
- homebrew/core already has formula `nicotine-plus` (different install path); generating a cask with the same token can coexist with formula but may confuse users — prefer core formula when README/DOWNLOADS document it in non-interactive brew-offer path.
- Unsigned/unnotarized app may need Gatekeeper right-click open.
- VM bottle still broken until release + brew upgrade.
