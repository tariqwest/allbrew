# FIX: screencharm (https://screencharm.app)

## Case
Catalog URL for **Screen Charm** (macOS screen recorder GUI). Assigned host is `screencharm.app`.

## Phase 0.5 judgment
| Field | Value |
|-------|--------|
| inputShape | homepage-url (`screencharm.app`) |
| expected.generator | `cask-app` / page-discover → `cask-dmg` |
| expected.app | `Screen Charm` / `Screen Charm.app` |
| service | **false** (GUI cask) |
| Canonical product site | `https://screencharm.com` |
| Direct DMG (2026-08) | `https://download.screencharm.com/Screen%20Charm-1.9.5-arm64.dmg` |

## Failures observed

### A. Assigned URL `https://screencharm.app`
1. Host DNS: **NXDOMAIN** (`dig` empty; `curl: Could not resolve host`).
2. Local `CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts … --tap $(mktemp -d)`:
   - Classified as **`unknown`**
   - page-discover: `fetch failed: Was there a typo in the url or port?`
   - Error: `Unable to automatically handle URL (non-interactive)`
3. VM homeserver `vm-install-one.mjs` (required isolation path): same generate_fail; `EXIT_CODE=1`, `VERIFY_OK=false`.
4. **No product generator bug** for a non-existent host — allbrew cannot invent content for NXDOMAIN.

### B. Diagnostic `https://screencharm.com` (not the assignment success path)
1. Classified `unknown` → page-discover static finds **cask-dmg** DMG (score 155).
2. Generates `Casks/screencharm.rb` successfully under temp tap:
   - version `1.9.5`, app `Screen Charm.app`
   - url `https://download.screencharm.com/Screen%20Charm-1.9.5-arm64.dmg`
3. Confirms product packaging path is healthy when URL is reachable.

### C. VM pool notes
| Endpoint | Result |
|----------|--------|
| local-2 | SSH unavailable + Homebrew lock |
| homeserver | acquired; generate fails on NXDOMAIN (product signal) |

## Root cause
**Catalog / queue URL typo or abandoned TLD:** `screencharm.app` does not resolve. Real marketing + download site is **`screencharm.com`**.

## Fix status (batch mode — Option A docs, no release)
| Layer | Action |
|-------|--------|
| Product code (`lib/*`) | **No patch** — correct behavior on NXDOMAIN |
| Catalog / agent-queue URL | **Correct to** `https://screencharm.com` (or direct DMG URL) |
| Optional future | Soft suggestion when fetch fails with DNS typo: try alternate public TLD only with explicit allowlist — **not** recommended without policy |

## Validation
```bash
# Assigned (expected fail)
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://screencharm.app" --name screencharm --tap "$(mktemp -d)" --verbose
# → Unable to automatically handle URL

# Corrected URL (expected generate cask)
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://screencharm.com" --name screencharm --tap "$(mktemp -d)" --verbose
# → cask-dmg discovery → Casks/screencharm.rb

# VM (assigned URL — fails generate; .com would install)
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url "https://screencharm.app" --name screencharm
```

## Residual risk
- Batch remains red for this queue row until **URL is fixed**.
- DMG is Apple Silicon–oriented (`-arm64`); Intel coverage unknown.
- Do not treat host brew install of diagnostic `.com` cask as isolation success.
