# FIX: ia-writer (https://formulae.brew.sh/cask/ia-writer)

## Failure class
**generate_fail** — Case C fail-closed.

## Root cause
- URL is a Homebrew **cask** formulae.brew.sh page for token `ia-writer`.
- Classifier correctly selects `homebrew-cask` (not monorepo source-build).
- Official API `GET https://formulae.brew.sh/api/cask/ia-writer.json` returns **HTTP 404**.
- Host `brew info --cask ia-writer`: *Cask 'ia-writer' is unavailable: No Cask with this name exists.*
- Related official iA casks that **do** exist: `ia-presenter`, `ia-markdown-dictionary` (not iA Writer).
- iA Writer is commercial; install path is product homepage / MAS (`https://ia.net/writer`), not a missing core/cask token.

## Independent judgment
- **generator:** `homebrew-cask` for this URL shape
- **service:** `false` (GUI cask)
- **Expected product behavior:** adopt official cask Ruby when token exists; **fail-closed** when missing — never package Homebrew/homebrew-cask monorepo sources.

## Fix (batch mode — Option A, no release)
1. **Docs / catalog:** treat this catalog URL as stale/wrong. Prefer `https://ia.net/writer` (homepage path already has prior fix-packages for ZIP/MAS discovery) or drop the formulae.brew.sh entry.
2. **lib/generators/homebrew-cask.ts** (optional UX): wrap API 404 with an explicit Case C message so operators do not chase monorepo packaging.

## Validation
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://formulae.brew.sh/cask/ia-writer" --name ia-writer --tap "$(mktemp -d)" --verbose
# → exit 1, clear 404 / no official cask message
# Does NOT attempt github.com/Homebrew/homebrew-cask monorepo source-build
```

## Residual risk
- VM helper may still race pool endpoints; product generate_fail is independent of VM.
- Homepage URL path needs separate reconciliation (prior ia-writer-2026-08-08 fix for ia.net/writer).
