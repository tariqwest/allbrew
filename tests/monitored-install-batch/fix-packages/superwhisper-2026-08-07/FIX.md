# FIX: superwhisper (https://superwhisper.com)

## Failure class
**generate_fail** — page-discover preferred App Store storefront URL without `/idNNNN`, then `cask-app-mas` threw `Could not extract App Store ID`.

## Phase 0.5 judgment
| Field | Value |
|-------|--------|
| inputShape | product homepage (`superwhisper.com`) |
| expected.generator | **homebrew-cask** (Case C) |
| expected.package/app | `superwhisper` / `superwhisper.app` |
| service | **false** (GUI cask) |
| official artifact | `https://builds.superwhisper.com/vVERSION/superwhisper.zip` |

## Failures observed (main before fix)
1. Classified `unknown`.
2. Discovery ranked `apps.apple.com/us/mac/discover` **135** over real app `id6471464415` **110** (`pathLooksMac` on `/mac/` + full MAS base score).
3. `collectCaskAppMasPayload` → **generate_fail** (no App Store ID).
4. After MAS-id scoring only: real MAS link wins, but yields **iOS** MAS cask (`superwhisper-ios` bundle) renamed `superwhisper-tap`, and `macappstore://` install fails without mas session.

## Root cause
1. **MAS storefront noise**: any `apps.apple.com/*` classifies as `mac-app-store` with score 90; storefront paths can outrank real `/idNNNN` app links.
2. **Missing Case C homepage adopt**: product homepage whose domain matches an official homebrew/cask homepage still went through HTML discovery instead of mirroring official cask Ruby.

## Fix (batch Option A — no release)
1. `lib/page-discover.ts` `scoreCandidateUrl`: MAS URLs with `/id\d+` get `+20` (`mas-app-id`); without ID get `-100` (`mas-no-app-id-penalty`).
2. `lib/generators/homebrew-cask.ts` `matchOfficialCaskByHomepage`: API lookup by `--name` / hostname label; require homepage registrable domain match.
3. `lib/cli.ts`: on `unknown`, try homepage match **before** page-discover → `homebrew-cask`.

## Validation
```bash
bun test ./tests/unit/page-discover.test.ts
bun test ./tests/unit/generators/homebrew-cask-homepage.test.ts
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://superwhisper.com" --name superwhisper --tap "$(mktemp -d)" --verbose
# → Matched official homebrew/cask superwhisper via homepage domain
# → Casks/superwhisper.rb (official zip + sparkle livecheck + zap)
```

## VM (allbrew 0.0.24 bottle)
Bottle lacks this fix → still storefront MAS generate_fail until parent reconciles/releases. Host brew install is not success for batch isolation.

## Residual risk
- Case C depends on formulae.brew.sh API + homepage domain alignment.
- Hostname label guess (`foo.com` → token `foo`) may miss multi-word cask tokens without `--name`.
- Official cask version may lag App Store (e.g. MAS 2.19 vs cask 2.17.2).
