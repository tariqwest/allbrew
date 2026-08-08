# FIX: superconductor (https://superconductor.dev)

## Failure class
**generate_fail**

## Product judgment
- Desktop multiplayer workspace for coding agents (GUI)
- Download: `Superconductor-mac-arm64.dmg` / `Superconductor-mac-x64.dmg` from
  `github.com/superconductor/desktop-releases/releases/latest/download/…`
- Also Mac App Store `id6749349238`
- **service: false** (GUI cask; no brew services)
- Expected generator: **cask-app** / **cask-app-release** after page-discover finds DMG

## Root cause
1. Homepage HTML has only nav links (`/download`, auth) — no direct `.dmg` href.
2. SPA script-bundle discovery regex can synthesize a **comma-separated extension allowlist**
   path (`/.7z,.aac,…,.dmg,…,.zip`) which `classify()` treats as `archive` (ends with `.zip`)
   and `pathLooksMac` boosts because `.dmg` appears mid-list → score ~102 and generate 404.
3. Released bottle **0.0.24** (VM): webview timeout + only score-22 HTML nav links →
   `Unable to automatically handle URL (non-interactive)`.

## Fix (batch — fix-package only, no release)
`lib/page-discover.ts`:
- `isImplausibleArtifactUrl()` — drop multi-extension / comma-list junk paths
- `isDownloadHubPath()` + `enrichDownloadHubPages()` — when no strong artifact, fetch
  same-site `/download` (and well-known hubs) and merge HTML candidates
- Apply implausible filter in normalize + script-bundle artifact collection

Unit tests cover junk rejection + hub follow to Superconductor-style DMG.

## Validation
```bash
bun test ./tests/unit/page-discover.test.ts --test-name-pattern "implausible|download hub|follows|enrichDownload"
# offline fixture: chosen Superconductor-mac-arm64.dmg (cask-dmg)
```

## VM (allbrew 0.0.24)
`vm-install-one` on **local-2**: EXIT_CODE=1, VERIFY_OK=false — no high-confidence candidate.
homeserver/local-1: env acquire failures (sparsebundle / VM not running).

## Residual risk
- Until parent reconciles + releases, VM bottle still fails on homepage URL.
- Large DMG download may be slow; dual-arch needs arm/intel cask blocks.
- DNS/network to superconductor.com may be flaky from some environments.
