# FIX: raycast-beta (https://raycast.com)

## Failure class
**generate_fail** (VM bottle 0.0.24) + **brew_fail** (local HEAD pre-fix)

### VM (allbrew 0.0.24)
Page discovery found only unknown same-site/GitHub noise; non-interactive path exited:
`Unable to automatically handle URL` / `No high-confidence download candidate`.

### Local HEAD (pre-fix)
WebView captured a **presigned R2 DMG** URL and generated a broken cask:
- No `version` stanza → Homebrew `undefined method 'latest?' for nil`
- `app "Raycast_v1…_universal.app"` (query-string URL skipped DMG inspect)
- Ephemeral `X-Amz-Signature` URL baked into cask
- Bad `name`/`desc` from signed filename

## Root cause
1. Raycast homepage is a JS SPA; stable download is `https://releases.raycast.com/download` (not in static HTML).
2. `classifyWithHead` fails (HEAD→403 on signed CDN) so seed URLs looked "unknown".
3. `cask-app` omitted `version` when path had no digits; `endsWith(".dmg")` failed on `?query` and on bare `/download`.
4. Presigned CDN URLs preferred over stable vendor endpoints.

## Expected
- Generator: `cask-app` (homepage → vendor seed / discover → cask-dmg)
- App: `Raycast.app`, version from Raycast releases API or `Raycast_vX.Y.Z` path
- URL: `https://releases.raycast.com/releases/<ver>/download` (stable)
- service: **false** (GUI cask)
- Case C note: `homebrew/cask` already ships healthy `raycast`; catalog slug is `raycast-beta` so a tap cask is valid for dogfood. Prefer core `brew install --cask raycast` for end users.

## Fix (batch mode — fix-package only, no release)
1. **`lib/page-discover.ts`**: `seedVendorDownloadCandidates` for `raycast.com` → stable `/download`; `demotePresignedCandidates`.
2. **`lib/cli.ts`**: if HEAD classifies unknown but discovery score ≥100 and kind non-unknown, trust discovery kind.
3. **`lib/generators/cask-app.ts`**:
   - always emit `version` (`"x.y.z"` or `:latest`)
   - `canonicalizeCaskDownloadUrl` for Raycast signed R2 → versioned releases URL
   - `fetchRaycastLatestVersion` JSON API for `/download`
   - query-stripped / vendor-path DMG detection + `Raycast.app` fallback
   - Content-Disposition filename parsing

## Validation
```bash
bun test tests/unit/generators/cask-app.test.ts   # 65 pass
bun test tests/unit/page-discover.test.ts         # 18 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://raycast.com" --name raycast-beta --tap "$(mktemp -d)" --verbose
# cask: version "1.104.24", app "Raycast.app", stable releases.raycast.com URL
# brew install --cask succeeded (local temp tap)
```

## VM (allbrew 0.0.24 bottle)
Still fails until fix is released/upgraded in VM (no vendor seed in bottle).
