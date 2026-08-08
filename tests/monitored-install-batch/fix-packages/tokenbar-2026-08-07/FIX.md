# FIX: tokenbar (https://tokenbar.site/get-started)

## Failure class
**generate_fail** — SPA download page discovers a 404 root `.dmg` filename; real binary is extensionless `/api/download/latest` → GitHub release DMG.

## Independent judgment
| Field | Expected |
|-------|----------|
| generator | `cask-app` |
| app | `TokenBar.app` |
| service | **false** (macOS menu bar GUI; not brew-services) |
| version | `0.37.6` (from GitHub release redirect `…/download/v0.37.6/TokenBar-latest.dmg`) |
| artifact | `https://www.tokenbar.site/api/download/latest` (307 → GitHub release asset) |
| sha256 | `bd546729da88124813d76a931b3ecd1315d44fb396edeb20230a6f6dc0f06976` |

## Root cause
1. Next.js download hub embeds `R="TokenBar-latest.dmg"` and `"/api/download/latest"` in JS bundles.
2. Script discovery absolutizes the bare filename to `https://www.tokenbar.site/TokenBar-latest.dmg` (404) and scores it ~190 as `cask-dmg`.
3. `enrichExtensionlessArtifactUrls` early-returns when **any** `.dmg` candidate exists, so `/api/download/latest` is never HEAD-probed.
4. Older bottle (0.0.24 on VM) never finds a strong candidate at all (no hub/API path) → non-interactive generate_fail.
5. Even with correct API URL, HEAD-era `cask-app` omitted `version` and named app `latest.app` from path segment `/latest`.

## Fix (batch mode — fix-package only, no release)
`lib/page-discover.ts`:
- Treat `/api/download(s)?/…` as extensionless artifact URLs (not HTML download hubs).
- Guess `${origin}/api/download/latest` and `/api/download/file`.
- Extract `/api/download…` relative paths from SPA bundles.
- Demote same-site root `*-latest.dmg` filename placeholders; still HEAD-probe extensionless APIs when only those placeholders exist; score verified API DMGs at ≥200.

`lib/sha256.ts`:
- Record redirect chain; expose final URL; pull version from GitHub `/releases/download/vX.Y.Z/` hops into `versionHeader`.

`lib/generators/cask-app.ts`:
- Always emit version (fallback `1.0.0`); strip `-latest` from server filenames for app/token; prefer version from redirect chain / final URL; inspect DMG for `TokenBar.app`.

Unit tests: TokenBar-class SPA download API vs filename placeholder.

## Validation (worktree)
```bash
bun test tests/unit/page-discover.test.ts   # TokenBar cases pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://tokenbar.site/get-started" --name tokenbar --tap "$(mktemp -d)" --verbose
# → cask-dmg api/download/latest; version 0.37.6; app TokenBar.app; EXIT 0
```

## VM (allbrew 0.0.24 bottle)
`vm-install-one` on homeserver: **EXIT_CODE=1** generate_fail — no high-confidence candidate (bottle lacks this fix). Local VMs SSH-unavailable during this run.

## agent_service_expectation
`false` — matches (GUI cask; no service stanza).
