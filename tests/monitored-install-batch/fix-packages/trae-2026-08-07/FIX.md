# FIX: trae (https://trae.ai)

## Failure class
**brew_fail** — generation succeeds (cask-app via page discovery), `brew install --cask` fails with `curl: (18) Transferred a partial file` on the ~316MB DMG under concurrent VM load. Official `homebrew/cask/trae` already exists (name collision → `trae-tap`).

## Root cause
1. Homepage is a JS SPA; page-discover finds multi-region mirrors (`trae-ai-us`, `trae-ai-sg`) plus secondary product **TraeWork**.
2. Prior ranking treated us/sg Trae/TraeWork as equal score (190); non-deterministic first pick often chose **sg** CDN.
3. VM brew install of large DMG repeatedly hit partial transfer (`curl 18`) under heavy concurrent allbrew/brew jobs.
4. Non-interactive `guessDesc` fell back to `Install from <dmg-url>` (poor cask quality).

## Agent judgment
| Field | Expected |
|-------|----------|
| generator | `cask-app` |
| app | `Trae.app` |
| service | **false** (GUI IDE cask) |
| note | Prefer official `brew install --cask trae` when acceptable; allbrew renames collision to `trae-tap` |

## Fix (batch mode — fix-package only, no release)
`lib/page-discover.ts`:
- `rankCandidatesForPage({ preferredName })` — boost basename matching `--name`, boost `-us` CDN, demote `-cn`/TraeWork when preferred is `trae`
- `preferArchUrls` multi-region weights align with homebrew/cask/trae (US first)

`lib/cli.ts`:
- pass `preferredName: opts.name || package || appName` into `discoverPageDownloads`
- `guessDesc` prefers short product blurb over raw CDN URLs for casks

Tests: `rankCandidatesForPage (trae multi-mirror)` in `page-discover.test.ts` (17 pass).

Local generate after fix picks:
`https://lf-cdn.trae.ai/obj/trae-ai-us/pkg/app/releases/stable/2.3.61406/darwin/Trae-darwin-arm64.dmg`

## Validation
```bash
bun test tests/unit/page-discover.test.ts
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://trae.ai" --name trae --tap "$(mktemp -d)" --verbose
# expects top candidate: trae-ai-us ... Trae-darwin-arm64.dmg
```

VM install (bottle 0.0.24, pre-fix): EXIT_CODE=1, VERIFY_OK=false, curl (18) partial DMG twice.

## Residual risk / blocked
- Full success still needs reliable ~316MB download in VM (or use core cask `trae`).
- Dual-arch cask (arm/intel) not yet generated; official homebrew cask is better shaped.
- Host ENOSPC can abort SHA download during local generate.
