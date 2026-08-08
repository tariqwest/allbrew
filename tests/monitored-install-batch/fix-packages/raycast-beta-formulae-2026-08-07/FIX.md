# FIX: raycast-beta (https://formulae.brew.sh/cask/raycast)

## Failure class
**generate_fail** — HTTP 404 for `https://formulae.brew.sh/api/cask/raycast-beta.json`

## Case C
`formulae.brew.sh/cask/*` is allowed. Official cask token is **`raycast`** (healthy on homebrew/cask). Catalog slug **`raycast-beta`** is dogfood naming only.

## Root cause
`generateWithConfirmation` prefers CLI `--name` over classification name. For `homebrew-cask` / `homebrew-formula` the "preserve official token" branch then tokenized **that** slug:

```
--name raycast-beta → API /cask/raycast-beta.json → 404
```

The official token lives in the URL path (`/cask/raycast` → `classification.name` → `params.name`).

Distinct from older `raycast-beta-2026-08-06` (homepage SPA / signed R2 DMG) which targeted `https://raycast.com`.

## Expected
- generator: `homebrew-cask`
- package/app: `raycast` / `Raycast.app`
- service: **false** (GUI cask)
- `--name raycast-beta` must not change API token

## Fix (batch mode — fix-package only, no release)
`lib/cli.ts`: for `homebrew-cask` and `homebrew-formula`, set
`userOpts.name = toCaskToken|toFormulaName(params.name || preferred)` so the
formulae.brew.sh path token wins over catalog `--name`.

## Validation (worktree)
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://formulae.brew.sh/cask/raycast" --name raycast-beta --tap "$(mktemp -d)" --verbose
# Classified as: homebrew-cask
# Generated: .../Casks/raycast.rb  (not raycast-beta)
# brew install --cask raycast OK on host temp tap

bun test tests/unit/homebrew-cask-name-token.test.ts  # 2 pass
```

## VM (allbrew bottle)
- If bottle lacks `homebrew-cask` generator: Case C page-discover path may still fail until release past `5e7a04e`.
- If bottle has generator but not this token fix: same 404 with `--name raycast-beta`.
