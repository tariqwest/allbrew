# FIX: jan-ai (https://jan.ai)

## Case
**Case C / product homepage** — Jan offline local-LLM desktop GUI. Marketing homepage at `jan.ai` (redirects to `www.jan.ai/`). Official `homebrew/cask` token **`jan`** (homepage `https://jan.ai/`).

## Phase 0.5 judgment
| Field | Value |
|-------|--------|
| inputShape | `homepage-desktop-app` (`jan.ai`) |
| expected.generator | `homebrew-cask` / `cask-app-release` |
| expected.package/app | `jan` / `Jan.app` |
| service | **false** (GUI cask; optional in-app OpenAI-compatible API is not brew services) |
| Case C | Prefer official `homebrew/cask` token `jan`; do not invent `jan-ai-tap` |

API facts (2026-08-08): version `0.8.4`, zip `github.com/janhq/jan/.../jan-mac-universal-0.8.4.zip`, `auto_updates`, artifact `Jan.app`.

## Failures observed

### A. Released allbrew **0.0.24** (host + VM via `vm-install-one.mjs`)
1. Classified as **`unknown`**.
2. No `matchOfficialCaskByHomepage` / no "Matched official homebrew/cask" line.
3. page-discover tries to fetch `https://www.jan.ai/` → **`Response exceeds 2000000 bytes`**.
4. Non-interactive: `Unable to automatically handle URL` → **generate_fail**.
5. VM: `EXIT_CODE=1`, `VERIFY_OK=false`.

### B. Current **main** (local temp tap, `CI=1 ALLBREW_NONINTERACTIVE=1`)
```text
Classified as: unknown
  Matched official homebrew/cask jan via homepage domain
Generated: .../Casks/jan.rb   # official homebrew-cask Ruby (version, zip, zap)
```
`matchOfficialCaskByHomepage("https://jan.ai", "jan-ai")` → `{ token: "jan", version: "0.8.4", homepage: "https://jan.ai/" }`.

## Root cause
- **0.0.24 bottle** predates / does not ship homepage-domain Case C adoption (`matchOfficialCaskByHomepage` + cli unknown-branch) that lands official `homebrew/cask` Ruby for product marketing URLs.
- Secondary (0.0.24 only): HTML page-discover uses a **2 000 000 byte** body cap; Next.js marketing HTML for `www.jan.ai` exceeds it, so discovery cannot fall back to GitHub/DMG links either.

## Fix status (batch mode — no release)
**Already on main** — no additional product patches required for jan.ai Case C once bottle >0.0.24.

| Layer | Status |
|-------|--------|
| `lib/cli.ts` unknown → `matchOfficialCaskByHomepage` | on main |
| `lib/generators/homebrew-cask.ts` | on main |
| unit tests homepage domain | on main (pass; add jan case optional) |
| Released bottle | **still 0.0.24** → VM fails until parent releases + VM upgrades |

Optional future hardening (not required once bottle catches main): raise HTML `fetchText` maxBytes or stream-truncate HTML for page-discover so huge marketing pages still yield download links when Case C misses.

## Validation
```bash
# main source
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://jan.ai" --name jan-ai --tap "$(mktemp -d)" --verbose
# → Matched official homebrew/cask jan; Casks/jan.rb

bun -e 'import { matchOfficialCaskByHomepage } from "./lib/generators/homebrew-cask.ts";
  console.log(await matchOfficialCaskByHomepage("https://jan.ai", "jan-ai"));'
# → token jan

# bottle 0.0.24
CI=1 ALLBREW_NONINTERACTIVE=1 /opt/homebrew/bin/allbrew \
  "https://jan.ai" --name jan-ai --tap "$(mktemp -d)" --verbose
# → Response exceeds 2000000 bytes / Unable to automatically handle URL

# VM bottle 0.0.24 (this run)
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url "https://jan.ai" --name jan-ai
# → generate_fail until release
```

## Residual risk
- Batch VM remains red until allbrew **>0.0.24** is released and `ensureAllbrew` upgrades the guest.
- Host may already have `/Applications/Jan.app` (local generate auto-install hit "already an App"); not used as success criterion.
- Batch `--name jan-ai` is overridden to official token **`jan`** on main (correct Case C behavior).
