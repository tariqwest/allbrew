# FIX: ia-writer (https://ia.net/writer)

## Failure class
**brew_fail** — VM allbrew 0.0.24 classified homepage `unknown`, page-discovered Mac App Store link, generated `cask-app-mas` with `url "macappstore://…"`, then `brew install --cask` failed: `Protocol "macappstore" not supported`.

**Local WIP regression:** uncommitted homepage→official-cask matching adopted wrong multi-product vendor cask `ia-markdown-dictionary` (same domain ia.net) instead of generating iA Writer.

## Root cause
1. Homepage has no static `.dmg`/`.zip` href; trial ZIP is via JS `download(this,"writer",…)` → POST `/download` → `files.ia.net/writer/release/iA-Writer-*.zip` (also Sparkle `updates.xml`). Stock 0.0.24 lacks Tier A.7b js-download-api enrichment → falls back to MAS.
2. MAS cask template uses `macappstore://` which curl/brew cannot download.
3. `matchOfficialCaskByHomepage` multi-product domain fallback treated preferred slug fragment `ia` (from `ia-writer`) as substring of `ia-markdown-dictionary`.

## Independent judgment
- **generator:** `cask-app` (ZIP from files.ia.net) preferred; MAS secondary
- **app:** `iA Writer.app`
- **service:** `false` (GUI only)
- **version observed:** 8.0.5 (build 80037)

## Fix (batch mode — fix-package only, no release)
1. **lib/generators/homebrew-cask.ts**:
   - Do not expand ultra-short first hyphen segments (`ia-writer` ↛ `ia`).
   - Multi-product domain: path-align cask homepage; require product-aligned preferred/path tokens; return null when ambiguous.
2. **lib/templates/cask/cask-app-mas.ts**: `url "https://apps.apple.com/app/id…"` instead of `macappstore://`.
3. **lib/page-discover.ts** + **lib/cli.ts** (carry WIP): Tier A.7b JS download API + official cask homepage adoption (needed for ZIP discovery; not in 0.0.24 bottle).
4. Unit tests: ia.net/writer → null; ia.net/presenter → ia-presenter.

## Validation
```bash
bun test ./tests/unit/generators/homebrew-cask-homepage.test.ts
TMP=$(mktemp -d); mkdir -p "$TMP/Casks" "$TMP/Formula"
CI=1 ALLBREW_NONINTERACTIVE=1 PATH="/tmp/fakebrew-bin:$PATH" \
  bun run bin/allbrew.ts "https://ia.net/writer" --name ia-writer --tap "$TMP" --verbose
# → archive ZIP files.ia.net/writer/release/iA-Writer-8.0.5-80037.zip
# → app "iA Writer.app", version 8.0.5
```

## Residual risk
- Stock brew allbrew 0.0.24 in VM still fails until parent reconciles/releases (needs page-discover A.7b + MAS https URL + homepage match fix).
- Commercial app: trial ZIP installs unsigned trial; full license is MAS/direct purchase.
- HTML entities in MAS links (`&amp;`) still present in discovery candidates (ZIP wins on score).
- Livecheck on fixed cask uses direct ZIP URL (not Sparkle updates.xml like official ia-presenter).
