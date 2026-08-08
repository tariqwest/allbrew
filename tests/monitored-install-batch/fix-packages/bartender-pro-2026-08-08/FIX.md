# FIX: bartender-pro (https://macbartender.com)

## Failure class
**brew_fail** — VM stock allbrew 0.0.24 classified homepage as `unknown`, page-discovered `B6Latest/Bartender%206.dmg`, generated cask **without `version`**, then `brew install --cask` crashed: `undefined method 'latest?' for nil`.

## Root cause
1. Product homepage not adopted as official homebrew/cask `bartender` (match path not in 0.0.24 bottle).
2. Fallback cask-app path for unversioned "latest" DMG URLs left `versionLine` empty in 0.0.24 → Homebrew 4+ NPE.

## Independent judgment
- **generator:** `homebrew-cask` (prefer) / `cask-app` (DMG fallback)
- **package:** official token `bartender` (Pro is license tier, not separate binary)
- **service:** `false`
- **official version:** 6.6.2

## Fix (batch mode — fix-package only, no release)
1. **lib/cli.ts**: On unknown, `matchOfficialCaskByHomepage` before page-discover.
2. **lib/generators/homebrew-cask.ts**: expandPreferredCaskTokens strips `-pro` (bartender-pro → bartender).
3. **lib/generators/cask-app.ts**: Always emit version (fallback `1.0.0`).
4. Unit tests for macbartender.com + bartender-pro.

## Validation
```bash
bun test ./tests/unit/generators/homebrew-cask-homepage.test.ts ./tests/unit/generators/cask-app.test.ts
TMP=$(mktemp -d); mkdir -p "$TMP/Casks" "$TMP/Formula"
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://macbartender.com" --name bartender-pro --tap "$TMP" --verbose
# → Matched official homebrew/cask bartender; version 6.6.2
```

## Residual risk
- Stock brew allbrew 0.0.24 in VM still fails until parent reconciles/releases.
- Host residual Caskroom from accidental local install may need sudo zap.
- B6Latest DMG path still uses placeholder 1.0.0 if homepage match skipped.
