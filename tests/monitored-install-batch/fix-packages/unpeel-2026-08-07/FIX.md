# FIX: unpeel (https://unpeel.com)

## Failure class
**generate_fail** on stock allbrew — homepage SPA has no static `.dmg` href; real artifact is extensionless `https://unpeel.com/download/mac` (`Content-Type: application/x-apple-diskimage`, `Content-Disposition: Unpeel-latest.dmg`).

## Phase 0.5 judgment
| Field | Value |
|-------|--------|
| inputShape | homepage-url (`unpeel.com`) |
| expected.generator | `cask-app` |
| expected.app | `Unpeel.app` |
| service | **false** (native GUI terminal app) |
| Direct artifact | `https://unpeel.com/download/mac` |

## Root cause
1. `classify` → `unknown` (marketing homepage).
2. `page-discover` hub crawl tried `/download`, `/downloads`, `/get` (404).
3. WebView only harvested nav HTML (`docs`, github discussions) — no high-confidence cask-dmg.
4. `looksLikeExtensionlessArtifactUrl` already matched `/download/mac`, but **`enrichExtensionlessArtifactUrls` only invented** `/download/latest` / `api.*/download/latest`, **not** `/download/mac`.
5. Script-bundle scan only extracted paths with `.dmg|.pkg|.zip` suffixes; SPA embeds `` `/download/mac` `` without extension.
6. Hub follow incorrectly treated `/download/mac` as HTML hub and tried `fetchTextLimited` on a 23MB DMG.

## Fix (batch — Option A, no release)
`lib/page-discover.ts`:
1. **`isDownloadHubPath`**: exclude paths that look like extensionless platform download endpoints (`/download/mac`, `/download/latest`, …) so they are not re-fetched as HTML.
2. **`enrichExtensionlessArtifactUrls`**: invent same-origin guesses for `/download/mac`, `/download/macos`, `/download/osx`, `/download/darwin`, `/downloads/mac`, `/downloads/macos`; raise default `maxProbes` 6→10.
3. **`discoverFromScriptBundles`**: harvest quoted extensionless relative paths matching `/download(s)/(mac|macos|osx|darwin|…)`.

Unit tests: `looksLikeExtensionlessArtifactUrl` for unpeel paths + invent HEAD-probe test.

## Local validation (patched source + temp tap)
```
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://unpeel.com" --name unpeel --tap "$(mktemp -d)" --verbose
# → extensionless HEAD …/download/mac → cask-dmg (score 120)
# → Casks/unpeel.rb with url "https://unpeel.com/download/mac" + app "Unpeel.app"
# Host auto-install also succeeded once; uninstalled to keep host clean.
```

## VM validation (bottle 0.0.24, unpatched)
Expect **generate_fail** until fix is released/reconciled into guest allbrew. Run:
```
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url "https://unpeel.com" --name unpeel --log "$RUN_DIR/vm-install.log"
```

## Residual risk
- Cask `version` falls back to `1.0.0` (`Unpeel-latest.dmg` has no dotted version; marketing shows `0.1.0-beta.*`). livecheck `header_match` may not track betas well.
- Unsigned / Gatekeeper indie DMG.
- Host brew auto-install still runs after local generate when not using isolation-only flags — use temp tap + avoid treating host install as success.
