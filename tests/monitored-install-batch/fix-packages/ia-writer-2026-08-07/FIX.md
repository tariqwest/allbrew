# FIX: ia-writer (https://ia.net/writer)

## Failure class
**generate_fail / brew_fail** — product homepage classified `unknown`; page-discover invented unrelated `https://ia.com/client/latest/iaInstallerFull.pkg` (HTML 200) via brand TLD fan-out, generated a bogus pkg cask (`app`/`pkg` wrong product). After discovering the real ZIP, archive-inspector picked sibling `Updater.app` over `iA Writer.app`.

## Root cause
1. `inventClientLatestArtifactUrls` fan-out to `brand.com`/`brand.us`/`brand.io` for short label `ia` → `ia.com` (unrelated host).
2. client/latest `headOk` treated any `*.pkg` URL as OK even when Content-Type is `text/html` and body is 114 bytes.
3. No discovery of iA's JS `download(this,"writer","writer-landing")` → POST `/download?type=&code=&start=1` JSON `{file}` API.
4. `classifyContents` took the first `.app/Contents/Info.plist` walk order hit (`Updater.app` / `Metadata.app` siblings).

## Independent judgment
- **generator:** `cask-app` (ZIP contains `iA Writer.app`)
- **service:** `false` (GUI Markdown editor; no brew services)
- **artifact:** `https://files.ia.net/writer/release/iA-Writer-8.0.5-80037.zip`
- **MAS:** id 775737590 also sold (secondary)

## Fix (batch mode — fix-package only, no release)
1. **`lib/page-discover.ts`**: Remove generic brand TLD fan-out; keep same-origin + Zoom dualTld allowlist only.
2. **`isBinaryInstallerHead`**: Reject HTML/text content-types; require binary CT or large length.
3. **`extractJsDownloadApiCalls` + `enrichJsDownloadApiArtifacts`**: Parse `download(type, code)` (HTML entities), POST same-origin `/download` API, score returned `.zip`/`.dmg`.
4. **`lib/archive-inspector.ts`**: `pickPrimaryAppBundleName` prefers top-level product apps; deprioritize Updater/Metadata/helpers.

## Validation
```bash
bun test ./tests/unit/page-discover.test.ts ./tests/unit/archive-inspector.test.ts
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://ia.net/writer" --name ia-writer --tap "$(mktemp -d)/tap" --verbose
# → Casks/ia-writer.rb with app "iA Writer.app", version 8.0.5, files.ia.net zip
```

## Residual risk
- Stock brew allbrew (0.0.24) still broken until fix reconciled/released into VM bottle.
- Download API codes may change; path fallback `{product}-landing` helps.
- MAS id 775737172 is iOS — discovery still surfaces it; zip scores higher.
