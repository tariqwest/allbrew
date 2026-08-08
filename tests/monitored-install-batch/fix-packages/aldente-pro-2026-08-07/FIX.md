# FIX: aldente-pro (https://apphousekitchen.com)

## Failure class
**generate_fail / brew_fail** (product) — vendor multi-product homepage classified `unknown`; Case C homepage matcher only probed tokens `aldente-pro` and `apphousekitchen`, missing official homebrew/cask **`aldente`**. Page-discover then picked unversioned `AlDente.pkg` → weak cask (`version "1.0.0"`, placeholder pkgutil) requiring sudo installer (host) / wrong artifact vs official Sparkle DMG.

## Root cause
1. AppHouseKitchen homepage hosts AlDente + Leftovers; official cask is `aldente` (homepage `https://apphousekitchen.com/`).
2. Batch slug `--name aldente-pro` does not equal cask token `aldente`; host SLD `apphousekitchen` also ≠ token.
3. Prior page-discover PKG-over-MAS fix still yields inferior unversioned pkg cask vs official versioned DMG + zap/uninstall.

## Agent judgment
| Field | Expected |
|-------|----------|
| generator | **homebrew-cask** (Case C adopt official) |
| package | `aldente` |
| app | `AlDente.app` |
| service | **false** (GUI menubar; helper via cask uninstall launchctl, not formula service) |

## Fix (Option A — no release)
`lib/generators/homebrew-cask.ts` `matchOfficialCaskByHomepage`:
1. **`expandPreferredCaskTokens`**: strip edition suffixes (`-pro`, `-app`, …), first hyphen segment, dehyphenated form → `aldente-pro` probes `aldente`.
2. **Domain index fallback**: if token probes miss, scan `formulae.brew.sh/api/cask.json` for homepage registrable-domain matches; disambiguate multi-product domains via preferred tokens.

Depends on existing (unreleased) Case C wiring in `lib/cli.ts` (homepage match before page-discover; `name: matched.token`).

Tests: `tests/unit/generators/homebrew-cask-homepage.test.ts` — aldente-pro slug + bare homepage.

## Validation
```bash
bun test ./tests/unit/generators/homebrew-cask-homepage.test.ts
# 7 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://apphousekitchen.com" --name aldente-pro --tap "$(mktemp -d)" --verbose
# → Matched official homebrew/cask aldente via homepage domain
# → Casks/aldente.rb (official 1.38.1 DMG + Sparkle + zap)
```

## VM note
Stock brew allbrew **0.0.24** lacks this fix → expects page-discover pkg path until parent reconciles/releases. Host brew install is not success for batch isolation.

## Residual risk
- Domain index fetch is ~17MB when preferred/host token probes miss (only unknown homepage path).
- Multi-product vendor domains with several official casks need preferred-name disambiguation.
- Privileged helper install may prompt on first app launch (cask uninstall handles launchctl).
