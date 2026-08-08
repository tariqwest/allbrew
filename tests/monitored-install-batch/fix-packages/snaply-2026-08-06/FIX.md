# FIX: snaply (https://snaply.app)

## Failure class
**generate_fail** — homepage classifies as `unknown`; no installable DMG/ZIP candidate. Local temp-tap generate and Lume VM bottle (0.0.24, endpoint `homeserver`) both fail non-interactively.

## Root cause
1. **Assigned URL is domain parking, not the product site.** As of 2026-08-06, `https://snaply.app` is served by Sedo-style parking (`Parking/1.0`, HEAD → HTTP 405). Local WebView discovery failed with `net::ERR_CONNECTION_RESET`; VM WebView found only low-confidence junk navigations:
   - `https://global.sitesafety.trendmicro.com/index.php`
   - `http://findonlineresults.com/?dn=snaply.app&…`
2. Non-interactive allbrew correctly refused auto-pick: *“No high-confidence download candidate”* → `Unable to automatically handle URL`.
3. The live Mac product (private on-device AI dictation GUI) markets/downloads at **`https://snaply.ai`** (`/download`, macOS 14+ Apple Silicon). Catalog row `homepage-download-test-cases` points at the wrong/expired TLD. Substituting the TLD is **out of assignment scope** (canonical URL is fixed).

## Agent judgment
| Field | Expected |
|-------|----------|
| generator | `cask-app` (if real product homepage/DMG) |
| app | `Snaply.app` |
| service | **false** (GUI cask only) |
| serviceCommand | null |

`agent_service_expectation: false` — no long-running daemon story.

## Product fix assessment
**No durable allbrew generator fix unblocks install of the assigned URL** while it remains parked. Behavior is largely correct (do not cask-install parking/ad redirects).

Optional future hygiene (not required for this package, not shipped here):
- Demote known parking / monetized search hosts (`findonlineresults.com`, Sedo parking fingerprints, trendmicro site-safety interstitial) in `page-discover` / webview scoring.
- Clearer non-interactive error: “homepage appears parked or expired; no product download found”.
- Catalog correction: point Snaply at `https://snaply.ai` or a stable direct DMG once published.

## Validation
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://snaply.app" --name snaply --tap "$(mktemp -d)" --verbose
# Classified as: unknown; no high-confidence candidate; no Formula/Cask written

LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url "https://snaply.app" --name snaply --endpoint homeserver \
  --log "$RUN_DIR/vm-install.log"
# EXIT_CODE=1 VERIFY_OK=false
```

## Residual risk / blocked
Full success requires **vendor/catalog** to provide a live homepage or direct `.dmg`/`.zip` URL (or intentional reassignment to `https://snaply.ai` with verified download discovery). Do not treat parking redirects as cask sources.
