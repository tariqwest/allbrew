# FIX: aimeflux (https://aimeflux.app)

## Failure class
**generate_fail** (partial product fix + residual external block)

## Assigned URL problem
Catalog/homepage source used `https://aimeflux.app`. That hostname **does not resolve** (NXDOMAIN). The real product site is **https://aimeflux.com**.

## Product (docs judgment)
- Native **macOS GUI** menu-bar dictation/transcription (local Whisper)
- Apple Silicon only, macOS 13.3+
- Download CTA: `https://aimeflux.com/download` → `https://aimeflux.com/download/mac`
- **service: false** (GUI cask; CLI/MCP are power-user extras, not brew-services primary)
- Expected generator: **cask-app** after page-discover finds DMG/ZIP
- No official `homebrew/cask` token for aimeflux

## Root cause
1. **Wrong TLD in catalog** (`.app` vs `.com`) → fetch fails before discovery.
2. **Even on `.com`**: Cloudflare managed challenge (`cf-mitigated: challenge`, HTTP 403) blocks static fetch of download endpoints and WebView only sees Cloudflare challenge links — no direct `.dmg` URL is available to automation.

## Fix applied (batch mode — fix-package only, no release)
1. **`lib/page-discover.ts`**: On DNS/host-lookup failure for `brand.tld` hosts, retry a small set of alternate public suffixes (`.com`, `.app`, `.io`, `.dev`, …) via `alternateTldUrls()`. Logs: `Host lookup failed for …; recovered via …`.
2. Unit tests for TLD swap / path preserve / multi-label skip.

## Validation
```bash
bun test tests/unit/page-discover.test.ts   # 19 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://aimeflux.app" --name aimeflux --tap "$(mktemp -d)" --verbose
# Now recovers to aimeflux.com, but still:
# No high-confidence download candidate (Cloudflare challenge only)
```

## Residual risk / still blocked
- **Cloudflare bot protection** on aimeflux.com prevents automated artifact discovery and SHA256 download. Full install needs either:
  - vendor CDN URL outside CF challenge, or
  - interactive human browser session / CF-capable WebView that completes the challenge, or
  - catalog URL updated to a direct signed DMG once published publicly.
- Catalog should prefer `https://aimeflux.com` over `.app`.
- VM install with assigned URL still exits 1 until CF-bypass or direct artifact URL exists (TLD recovery alone insufficient for brew install).

## agent_service_expectation
`false` — matches expected (GUI); no service_mismatch if generate ever succeeds.
