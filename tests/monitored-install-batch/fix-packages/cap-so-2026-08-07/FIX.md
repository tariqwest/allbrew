# FIX: cap-so (https://cap.so)

## Failure class
**generate_fail** (wrong generator) → would become **brew_fail** if installed as cargo formula.

Homepage `https://cap.so` is a marketing site for **Cap**, a native desktop GUI screen recorder (Loom alternative). Install path is a DMG via `/download/apple-silicon` → CrabNebula CDN. allbrew 0.0.24 instead chose the monorepo `CapSoftware/Cap` and emitted a **cargo** formula (`cargo install`) with crates.io livecheck.

## Independent judgment
| Field | Expected |
|-------|----------|
| generator | `cask-app` |
| app | `Cap.app` |
| service | **false** (GUI cask only; optional `install-cli.sh` is agent helper, not primary) |
| version | `0.5.8` (from `Cap_0.5.8_aarch64.dmg` Content-Disposition) |
| artifact | `https://cdn.crabnebula.app/asset/…?publicPlatform=dmg-aarch64` |
| sha256 | `74afd36c9541e57eaeb155adfe7dfbeda11ea72b0bd9fcc5a3d8641217bb4c57` |

## Root cause
1. **Page discover** ranks bare `github.com/CapSoftware/Cap` at ~90 (github-repo + trusted-host). Same-site `/download/apple-silicon` is extensionless, so it gets **html-download-page-penalty** and never becomes `cask-dmg`.
2. **GitHub release enrich** only inspects `assets[]`. Cap publishes **0** GitHub assets; real DMGs are CrabNebula links in the **release body**.
3. Without a DMG, CLI builds from monorepo → cargo (workspace, not a CLI crate) → useless formula.
4. After redirect fix, **cask-app** still mishandled extensionless CDN URLs: no `version` stanza (Homebrew `latest?` nil), app name taken from opaque asset id (`01KZ8….app`), no homepage.

## Fix (batch mode — fix-package only, no release)
`lib/page-discover.ts`:
- Detect macOS platform download paths (`/download/apple-silicon`, etc.)
- `resolveRedirectArtifact` / `enrichPlatformDownloadRedirects` — HEAD/redirect, promote CDN targets with Content-Disposition `*.dmg`
- Parse GitHub release **body** URLs when `assets` empty (CrabNebula)
- Demote bare `github-repo` when cask artifacts exist

`lib/sha256.ts`:
- Capture Content-Disposition; rename temp download to real `Cap_*.dmg`

`lib/generators/cask-app.ts`:
- Version from disposition/filename; fallback `version :latest` (never omit)
- Clean base name; DMG app detection; homepage from `sourceUrl`

`lib/cli.ts`:
- `handleCaskDmg` sets `homepage` from `sourceUrl`

Unit tests: Cap fixtures in `page-discover.test.ts`; cask-app version expectations updated.

## Validation
```bash
bun test tests/unit/page-discover.test.ts   # 21 pass
bun test tests/unit/generators/cask-app.test.ts
# discovery (fixed tree):
# Resolved … cask-dmg → cdn.crabnebula.app/asset/…dmg-aarch64
# Manual DMG: Cap.app present; sha256 74afd36c…
```

Full local generate of the ~129MB DMG can time out on slow links; hash confirmed via curl once.

## VM (allbrew 0.0.24 bottle)
Still fails until fix is released/upgraded in VM: cargo formula path.

## Residual risk
- CDN asset IDs change per release; livecheck on crabnebula URL is weak — prefer `cap.so/download/apple-silicon` header strategy or GitHub tag.
- Multi-arch: arm64 vs Intel need `on_arm`/`on_intel` URL blocks (current pick follows host arch via redirect order).
- Optional Cap CLI (`curl …/install-cli.sh`) is out of scope for primary cask path.
