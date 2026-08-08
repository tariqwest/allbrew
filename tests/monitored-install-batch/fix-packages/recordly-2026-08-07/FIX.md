# FIX: recordly (https://recordly.app)

## Failure class
**generate_fail** (catalog host is parked/for-sale)

## Assigned URL problem
`https://recordly.app` resolves but is a **GoDaddy for-sale / parking lander** (`/lander` → forsale.godaddy.com). No product downloads on-site.

Real open-source screen recorder product lives at **https://recordly.dev** with GitHub releases:
`webadderallorg/Recordly` → `Recordly-arm64.dmg` (v1.3.3).

Note: `https://recordly.com` is a **different**, dead Mac App Store listing — first-hit TLD recovery to `.com` is a footgun.

## Agent judgment
- generator: **cask-app** / cask-dmg after page-discover
- **service: false** (GUI `.app` only)
- packageName: `recordly`, app: `Recordly.app`

## Root cause
1. Catalog URL uses parked `.app` TLD.
2. `page-discover` only recovered alternate TLDs on DNS failure; parked hosts that still HTTP-200 were not recovered.
3. Naive first-success alternate TLD would pick dead MAS `.com` over GitHub DMG `.dev`.

## Dirty-tree regression note (uncommitted WIP on agent host)
Working-tree `lib/page-discover.ts` adds `/client/latest/*InstallerFull.pkg` probes that treat path-ending `.pkg` HEAD 200 as success even when `Content-Type: text/html` (parked lander body). That produces a false cask for `recordlyInstallerFull.pkg`. Fix `headOk` to reject HTML/text regardless of path extension before merging that probe into main.

## Fix (batch mode — fix-package only, no release)
In `lib/page-discover.ts` (vs clean HEAD):
1. `alternateTldUrls()` + DNS-failure recovery.
2. `looksLikeParkedOrForSale()` for GoDaddy/HugeDomains/etc.
3. When parked or no strong candidate, try **all** alternate brand TLDs, pick **best** artifact with kind boost favoring `cask-dmg`/`archive` over `mac-app-store`.
4. Unit tests for TLD swap + parked detection.

## Validation (local, stub brew, temp tap)
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 PATH=stubbin:$PATH \
  bun run bin/allbrew.ts "https://recordly.app" --name recordly --tap "$(mktemp -d)" --verbose
# → Recovered downloads via https://recordly.dev/ (cask-dmg)
# → Generated Casks/recordly.rb (Recordly-arm64.dmg v1.3.3)
bun test tests/unit/page-discover.test.ts  # 22 pass
```

## Residual
- Unreleased: VM/host brew allbrew still fails on assigned URL until patch is applied/reconciled/released.
- Catalog should prefer `https://recordly.dev` or GitHub release URL.
- Multi-TLD static probes add latency on parked URLs.
- arm64-only URL in generated cask (x64 also exists).

## agent_service_expectation
`false` — GUI cask; no service_mismatch when generate succeeds.
