# FIX: carbon-copy-cloner (https://bombich.com)

## Failure class
**brew_fail** / product-shape **generate_fail** — vendor homepage `https://bombich.com` classifies as `unknown`. Page-discover auto-picks the **Mac App Store companion** `CCC Mobile Backup` (score 105: mac-app-store + trusted-host) instead of the desktop Carbon Copy Cloner ZIP/DMG. allbrew then:
1. Renames the cask to `carbon-copy-cloner-tap` because token collides with `homebrew/cask`
2. Emits a MAS installer cask (`mas install 6471621409`, `macappstore://…`)
3. `brew install` fails: `Protocol "macappstore" not supported`

## Case C
`homebrew/cask` already ships a healthy **carbon-copy-cloner** cask (7.1.6,8368 — `Carbon Copy Cloner.app`, CDN zip). Prefer official cask over re-packaging vendor marketing pages or the wrong mobile product.

## Root cause
1. Marketing homepage has no direct `.zip`/`.dmg` href; static discovery ranks MAS mobile highest.
2. No early Case C path: `--name carbon-copy-cloner` matching `isHomebrewCaskToken` is ignored until after discovery wrongly resolves.
3. `resolveNonCollidingCaskName` renames to `-tap` instead of adopting the official cask.
4. Secondary: mac-app-store candidates score +90 even when they are companion/mobile products unrelated to the requested desktop name.

## Expected
- **agent_service_expectation:** `false` (GUI cask; helper LaunchDaemons are app-managed)
- **generator:** `homebrew-cask` when `--name` is official token; else `cask-app` via download_ccc.php / CDN zip
- **package/app:** `carbon-copy-cloner` / `Carbon Copy Cloner.app`

## Fix (batch mode — fix-package only, no release)
1. **`lib/cli.ts`**: After classify `unknown`, if `toCaskToken(opts.name)` is `isHomebrewCaskToken`, route to `homebrew-cask` **before** page discovery (Case C — same as DEVONthink).
2. Optional follow-up: pass `preferredName` into `discoverPageDownloads` and penalize MAS URLs whose slug does not match preferred desktop token (e.g. `ccc-mobile-backup` vs `carbon-copy-cloner`); hop `/software/download_ccc.php` same-site.

## Validation (local worktree + Case C patch)
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://bombich.com" --name carbon-copy-cloner --tap "$(mktemp -d)" --verbose
# Preferring official Homebrew cask (homebrew/cask already has "carbon-copy-cloner")
# Generated: .../Casks/carbon-copy-cloner.rb  (official Ruby, version 7.1.6,8368)
```

## VM (allbrew bottle without Case C)
Fails until fix is released/upgraded in VM: wrong MAS mobile cask or same brew_fail. Host brew install intentionally not used as success path for the batch marathon.
