# FIX: poe (https://formulae.brew.sh/cask/poe)

## Case
**Case C** — official Homebrew Formulae **cask** page for **Poe** (AI chat GUI).

## Phase 0.5 judgment
| Field | Value |
|-------|--------|
| inputShape | `homebrew-cask-page` |
| expected.generator | `homebrew-cask` |
| expected.package/app | `poe` / `Poe.app` |
| service | **false** |
| Case C | Prefer official `homebrew/cask` token |

## Failures observed

### A. Released allbrew **0.0.24** (VM homeserver)
- Classified `unknown` → page-discover arm64 ZIP → nested **`Poe Helper (Renderer).app`** → rename **`poe-tap`** → brew install fails (app source not there).

### B. Current **main** (temp tap)
- `homebrew-cask` → official `Casks/poe.rb` (arch, livecheck, zap) → install ok.

## Fix status
**Already on main** — no additional patches. Bottle still **0.0.24** → VM fails until parent releases and guest upgrades.

See also: `tests/monitored-install-runs/2026-08-07T21-07-05Z__poe/fix-package/`.
