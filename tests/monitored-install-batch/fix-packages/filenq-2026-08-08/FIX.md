# FIX: filenq (https://filenq.app)

## Failure class
**generate_fail** (blocked) — no stable direct `.dmg` URL; download is Gumroad PWYW only.

## Failure modes observed
1. **Phantom SPA artifacts:** script-bundle discovery invented `https://filenq.app/build-0.9.0.dmg` / `release.zip` (score ~172) which 404 as HTML SPA shells, causing `downloadAndHash` to fail mid-cask generation.
2. **Store gate:** real distribution is `https://webseidon.gumroad.com/l/jrvyrv` (checkout before file URL). Homebrew cannot cask without a stable fetchable artifact.

## Agent judgment
| Field | Expected |
|-------|----------|
| generator | `cask-app` *if* a direct DMG existed |
| app | `FilenQ.app` |
| service | **false** (GUI cask) |
| version | 0.9.0 early access |

## Fix (Option A — fix-package only, no release)
`lib/page-discover.ts`:
- `isStoreDownloadGateUrl` / `findStoreDownloadGate` (Gumroad `/l/…`, gum.co, itch.io)
- static-asset score -50; store gates score mid-band, never auto-picked
- JSON-LD / bare-url extract for store gates + installUrl/downloadUrl
- `filterUnreachableScriptArtifacts` HEAD-probes same-site script-bundle `.dmg/.zip` and drops 404/HTML soft-404s before auto-pick
- `pickAutoCandidate` skips `store-download-gate`

`lib/cli.ts`:
- non-interactive: exclude store gates from usable; warn with Gumroad/itch explanation

`lib/page-discover-webview.ts`:
- drop static assets; allow gumroad/itch hosts; cap store-gate score

Tests: Gumroad scoring + filterUnreachableScriptArtifacts in `tests/unit/page-discover.test.ts`.

## Validation
```bash
bun test ./tests/unit/page-discover.test.ts   # 45 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://filenq.app" --name filenq --tap "$(mktemp -d)" --verbose
# expects: script-artifact HEAD drop build-0.9.0.dmg
#          Download is behind a store gate … gumroad.com/l/jrvyrv
#          Unable to automatically handle URL (non-interactive)
```

## Residual / cannot fully fix without
Vendor-hosted stable direct DMG/ZIP (or out-of-scope Gumroad free-checkout automation). Install remains **blocked** for batch success criteria.
