# FIX: filenq (https://filenq.app)

## Failure class
**generate_fail** — homepage classifies as `unknown`; download is Gumroad-only PWYW with no stable direct `.dmg` URL. VM bottle (0.0.24) and local generate both fail.

## Root cause
1. FilenQ is a **native Swift/AppKit GUI** distributed exclusively via **Gumroad** (`https://webseidon.gumroad.com/l/jrvyrv`). Docs instruct: open `.dmg` → drag to Applications. No GitHub releases / CDN artifact.
2. Gumroad free products still require checkout before a signed download URL is issued (`public_files: []` on product page). Homebrew casks need a stable, fetchable URL + SHA256 → **cannot fully generate**.
3. Product gaps amplified the failure:
   - WebView candidates ranked same-site nav/CSS above the Gumroad CTA (score 10 vs 22).
   - Bare URL / JSON-LD extract ignored `installUrl`/`downloadUrl` pointing at Gumroad.
   - Non-interactive path said only “No high-confidence download candidate” without naming the store gate.

## Agent judgment
| Field | Expected |
|-------|----------|
| generator | `cask-app` (if direct DMG existed) |
| app | `FilenQ.app` |
| service | **false** (GUI cask) |
| version | 0.9.0 early access (homepage) |

## Fix (batch mode — fix-package only, no release)
Partial product improvements; **install remains blocked** until vendor publishes a direct artifact URL.

`lib/page-discover.ts`:
- `isStoreDownloadGateUrl` / `findStoreDownloadGate` (Gumroad `/l/…`, gum.co, itch.io)
- score store gates above nav noise; never high enough to auto-pick as cask URL
- demote static assets (css/js/fonts) to score -50
- extract JSON-LD `installUrl`/`downloadUrl` + bare Gumroad URLs

`lib/page-discover-webview.ts`:
- drop static assets early; allow gumroad/itch hosts; cap store-gate score

`lib/cli.ts`:
- exclude `store-download-gate` from auto-usable candidates
- non-interactive warning: “Download is behind a store gate…”

Tests: Gumroad scoring + JSON-LD fixture in `page-discover.test.ts`.

## Validation
```bash
bun test tests/unit/page-discover.test.ts   # 18 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://filenq.app" --name filenq --tap "$(mktemp -d)" --verbose
# logs: store-download-gate gumroad + clear gate warning; still exits unable to handle
```

## Residual risk / blocked
Full `brew install` success requires **vendor** to host a stable direct DMG (or allbrew implementing Gumroad free-checkout automation — fragile, ToS-sensitive, out of batch scope).
