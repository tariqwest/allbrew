# FIX: qoder (https://qoder.com)

## Failure class
**generate_fail** — page discovery chose a dead Mac App Store link over real desktop DMGs.

## Independent judgment
| Field | Expected |
|-------|----------|
| generator | `cask-app` |
| app | `Qoder.app` |
| service | **false** (GUI AI IDE cask) |
| artifact | `https://download.qoder.com/release/latest/Qoder-darwin-arm64.dmg` (Apple Silicon) |
| version | `6.4` (from generated cask / app metadata) |

## Root cause
1. Homepage is a Next.js SPA; static HTML has no `.dmg` links.
2. `/download` hub HTML only surfaces `apps.apple.com/app/qoder/id6764005182` (score ~113). App Store ID is not resolvable (`No app found with ID 6764005182`).
3. Real installers live only in JS bundles as absolute URLs, e.g. `downloadUrl:"https://download.qoder.com/release/latest/Qoder-darwin-arm64.dmg"`.
4. **Regex bug** in `discoverFromScriptBundles`: character class `[^"'\\s)]` used `\\s` which is backslash + letter `s`, so any URL path containing `s` (e.g. `release`) failed to match. Bundle discovery always returned **0** candidates.
5. Hub follow did not scan hub script bundles; MAS alone counted as "strong" enough to short-circuit further work.

## Fix (batch mode — fix-package only, no release)
`lib/page-discover.ts`:
- Fix JS bundle artifact regexes to use `\s` (whitespace) not `\\s`.
- Prefer `/download` chunks when ordering scripts; raise default script fetch limit.
- Run script-bundle discovery when static top is only store/unknown/github (not only empty shell).
- On download-hub follow, also run `discoverFromScriptBundles` on hub HTML.
- Do not treat `mac-app-store` alone as strong enough to skip hub crawl.
- Soft-demote sibling product paths (`qoderwake`, `qoder-work`) so primary `Qoder-darwin-*.dmg` wins.

Unit tests in `tests/unit/page-discover.test.ts`:
- Absolute qoder-style `.dmg` URLs containing letter `s` in path.
- Hub bundle DMG preferred over MAS marketing link.

## Validation
```bash
bun test ./tests/unit/page-discover.test.ts   # 27 pass (main tree)
# discovery:
# Resolved … cask-dmg → https://download.qoder.com/release/latest/Qoder-darwin-arm64.dmg
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts https://qoder.com --name qoder --tap "$(mktemp -d)" --verbose
# → Casks/qoder.rb, app "Qoder.app", version 6.4
```

## VM (bottle without fix)
Expected: same MAS generate_fail until fix released/upgraded in VM.

## Residual risk
- Cask currently single-arch (host arch); Intel needs `on_intel` URL block.
- `livecheck` on `/latest/` + header_match is weak if CDN omits version headers.
- Multi-product site still exposes wake/work DMGs; demotion is heuristic.
- Host auto-install may have run during local temp-tap validate — uninstall if present.
