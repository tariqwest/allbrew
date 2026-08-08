# FIX: metricsync (https://metricsync.download)

## Failure class
**generate_fail** (product bugs) + **platform unsupported** for full install.

## Root cause
1. Homepage is an iPhone nutrition app (App Store id `6746950963`). HTML has:
   - `dns-prefetch` → bare `https://apps.apple.com` (no app id)
   - JSON-LD `downloadUrl` / `sameAs` with full `/id6746950963` listing
   - `<meta name="apple-itunes-app" content="app-id=6746950963">`
2. **page-discover bare-url regex** used `[^\s"'<>)\\]]+` where the mid-class `]` **closed the character class early**, so bare URL extraction matched nothing (required trailing `]`). Discovery only saw the dns-prefetch host and auto-picked `https://apps.apple.com/` (score 105).
3. **cask-app-mas** then threw `Could not extract App Store ID from URL: https://apps.apple.com/`.
4. Even with a correct id, iTunes lookup returns `kind=software` (iOS/iPadOS only), not `mac-software` — cannot install via Homebrew `mas` on macOS.

## Agent judgment
| Field | Expected |
|-------|----------|
| generator | `cask-app-mas` (then reject as non-Mac) |
| package | metricsync |
| service | **false** |
| install | **not possible** on macOS (iPhone/iPad only) |

## Fix (batch mode — fix-package only, no release)
`lib/page-discover.ts`:
- Fix bare URL regex: `/https?:\/\/[^\]\s"'<>)]+/gi` so `]` is a literal exclude
- Prefer App Store URLs with `/id\d+` (+95); penalize bare `apps.apple.com` origins (−40)
- Extract JSON-LD App Store / artifact URLs and `apple-itunes-app` meta `app-id`

`lib/generators/cask-app-mas.ts`:
- `assertMacAppStoreListing`: require `kind=mac-software` or non-mobile-only device list; clear error for iOS listings

Tests: metricsync-style fixture in `page-discover.test.ts`; iOS reject + mac-software accept in `cask-app-mas.test.ts`.

## Validation
```bash
bun test tests/unit/page-discover.test.ts tests/unit/generators/cask-app-mas.test.ts  # 40 pass
# discovery → full MAS URL; generate → clear "not a Mac app (kind=software)"
```

## Residual risk
- Catalog URLs that are pure iOS marketing sites will still **fail generate** after this fix (intentional, with a clear message). Success requires a Mac App Store listing or a desktop DMG/ZIP.
- Universal apps without `kind`/`supportedDevices` still pass the guard (conservative allow).
