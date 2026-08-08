# FIX: chirpy (https://chirpy.pro/download)

## Failure class
**brew_fail** — generated cask omitted `version`, Homebrew crashed with:
`undefined method 'latest?' for nil` in `Cask::Upgrade.outdated_casks`.

## Root cause
Page-discover correctly resolves `https://chirpy.pro/download` →
`https://gitlab.com/chirpy_pro/releases/-/raw/main/v2/Chirpy.dmg`.
`collectCaskAppPayload` only took versions from URL path digits; `/v2/` is not
`x.y` → empty `versionLine` → invalid cask. Same class as **pasty** fix-package.

## Independent judgment
- **generator:** `cask-app` (homepage download → static discover → cask-dmg)
- **app:** menu-bar GUI `Chirpy.app` (custom notification sounds)
- **service:** `false` (cask only; no brew services)
- **version on site:** 3.0.1 (notarized Universal Binary)

## Fix (batch mode — fix-package only, no release)
`lib/generators/cask-app.ts`:
1. `resolveCaskVersion()` — option → URL path → GitHub latest tag → scrape
   `sourceUrl`/`homepage` HTML for "version X.Y.Z" / "… for macOS"
2. Fallback `version :latest` (never omit stanza)
3. Strip `.app` from cask `name` display field
4. Prefer `homepage` from `options.homepage || options.sourceUrl`

Unit tests: empty `versionLine` → `:latest` (or scraped when homepage live);
Chirpy GitLab raw DMG cases added.

## Validation
```bash
bun test tests/unit/generators/cask-app.test.ts   # 65 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://chirpy.pro/download" --name chirpy --tap "$(mktemp -d)" --verbose
# cask contains: version "3.0.1", name "Chirpy", homepage download page
# allbrew brew install --cask succeeded (host validation), then uninstalled
```

## VM (allbrew 0.0.24 bottle)
Still fails until fix is released/upgraded in VM: same nil version path.

## Residual risk
- Unversioned GitLab raw URL: livecheck header_match may not see 3.0.1 after
  scrapes change; Sparkle in-app updates are primary for users.
- Accessibility permission is runtime OS setup, not packaging.
