# FIX: unfatten (https://avelio.tech/unfatten)

## Failure class
1. **generate_fail** (host / environments where WebView misses SPA links) — relative artifact paths in JS bundles
2. **brew_fail** (VM bottle 0.0.24) — cask generated without `version` → Homebrew `undefined method 'latest?' for nil`

## Product (agent judgment)
- macOS **GUI** app: trims universal binaries on audio plugins
- SPA marketing page; artifacts under `https://avelio.tech/download/Unfatten{16,15,14,}.dmg`
- **service: false**
- Expected generator: **cask-app**

## Root causes
### A. Relative paths in script bundles
`discoverFromScriptBundles` only matched absolute `https?://…dmg` URLs. Unfatten embeds `href:"/download/Unfatten16.dmg"`. Static HTML is empty SPA shell. Some hosts then fail non-interactive generate; VM WebView sometimes still finds hrefs.

### B. Missing cask `version`
`extractVersionFromUrl` only matches dotted versions (`1.2.3`). Filename `Unfatten16.dmg` encodes **1.6**. Empty `versionLine` produces a cask Homebrew 6.x rejects during install (`Cask::Upgrade.outdated_casks` → `latest?` on nil).

## Fix (batch — fix-package only, no release)
1. **`lib/page-discover.ts`**: resolve quoted relative `.dmg|.pkg|.zip` paths from JS bundles against page origin.
2. **`lib/generators/cask-app.ts`**:
   - `extractCompactVersion("Unfatten16.dmg")` → `"1.6"`
   - always emit `version "…"` (fallback `"1.0.0"`)
   - strip `.app` from `name` displayName

## Local validation
```text
# After fix: generates + brew install --cask succeeds (temp tap)
version "1.6"
url "https://avelio.tech/download/Unfatten16.dmg"
app "Unfatten.app"
```

## VM validation (bottle 0.0.24, unpatched)
- generate OK via webview → Unfatten16.dmg
- brew install **FAIL**: `undefined method 'latest?' for nil`
- VERIFY_OK=false, EXIT_CODE=1, endpoint=local-2

## Residual risk
- Equal-score multi-version DMGs; first CTA (16) wins
- livecheck header_match on DMG URL may not yield dotted versions
- Indie/unsigned DMG gatekeeping
