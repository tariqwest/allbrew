# veusz (Case C / formulae.brew.sh cask)

## Summary

**Case C** — official Homebrew Formulae **cask** page for **veusz** (scientific plotting GUI).

| Field | Value |
|-------|--------|
| URL | https://formulae.brew.sh/cask/veusz |
| expected.generator | `homebrew-cask` |
| expected.package | `veusz` / `Veusz.app` |
| service | false (GUI cask) |
| Case C | Prefer official `homebrew/cask` token; do **not** monorepo-source-build |

Official cask is **deprecated** (`disable! date: 2026-09-01, because: :fails_gatekeeper_check`) but still installable until disable date.

## Local source (main / working tree)

```
Classified as: homebrew-cask
Generated: …/Casks/veusz.rb   # official homebrew-cask Ruby (arch, livecheck, zap, disable!)
```

## VM bottle 0.0.24

```
Classified as: unknown
→ page-discover cask-dmg arm DMG
→ name collision → veusz-tap (cask-app minimal)
Installed: veusz-tap  VERIFY_OK=true
```

## Root cause

**0.0.24 bottle** does not ship `formulae.brew.sh/cask/:token` → `homebrew-cask` classification + generator (present on main). Same bottle-lag pattern as Proxyman Case C.

## Fix package (Option A)

**Already on main** — no additional product patches required for veusz Case C once the bottle catches main.

- `lib/classifier.ts` — `formulae.brew.sh/cask/` → `homebrew-cask`
- `lib/generators/homebrew-cask.ts` — fetch official cask Ruby
- unit: `formulae.brew.sh official pages > classifies cask pages as homebrew-cask`

## Validation

```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  https://formulae.brew.sh/cask/veusz --name veusz --tap "$TMP_TAP" --verbose
# → homebrew-cask, official veusz.rb

LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url https://formulae.brew.sh/cask/veusz --name veusz
# bottle 0.0.24: veusz-tap VERIFY_OK; post-release: expect official veusz
```

## Residual risk

- Gatekeeper / deprecation: cask will disable 2026-09-01 upstream.
- Until bottle upgrade, monitored VM path mints a worse `veusz-tap` duplicate of the official cask.
