# FIX: devonthink (https://devontechnologies.com)

## Failure class
**generate_fail** — multi-product vendor homepage classified `unknown`; static page-discover found no direct `.dmg`/`.zip` (download links live on `/apps/devonthink` and `/download/apps`). Non-interactive mode exited with `Unable to automatically handle URL`. WebView timed out.

## Case C
`homebrew/cask` already ships a healthy **devonthink** cask (4.3.2, auto_updates, `DEVONthink.app`). Prefer official cask over re-packaging multi-GB vendor archives.

## Root cause
1. Marketing homepage HTML has product nav only — no artifact URLs.
2. No same-site product-page hop before failing discovery.
3. `onclick="window.location='…'"` download tables were not scraped.
4. No Case C path: `--name devonthink` matching `homebrew/cask` was ignored after discovery failure.
5. Secondary: when discovery *did* find `DEVONthink.dmg.zip` (apps page), archive inspect returned `unknown` and hung on interactive "How should this archive be treated?" (prompt_hang risk).

## Expected
- **agent_service_expectation:** `false` (GUI cask; Server web UI is not the default Standard edition)
- **generator:** `homebrew-cask` when `--name` is an official cask token; otherwise `cask-app` via product-page hop → `DEVONthink.dmg.zip` / `.app.zip`
- **package/app:** `devonthink` / `DEVONthink.app`

## Fix (batch mode — fix-package only, no release)
1. **`lib/cli.ts`**: After classify `unknown`, if `toCaskToken(opts.name)` is `isHomebrewCaskToken`, route to `homebrew-cask` generator **before** discovery/download (Case C).
2. **`lib/cli.ts`**: Non-interactive unknown archive contents → prefer `cask-app` when URL looks like macOS app/dmg.
3. **`lib/page-discover.ts`**: Extract `window.location='…'` from onclick handlers; **Tier A.7** `enrichSameSiteProductPages` hops same-site `/apps/*` and `/download/*` pages biased by `preferredName`.
4. **`lib/cli.ts`**: Pass `preferredName: opts.name` into `discoverPageDownloads`.
5. Unit tests for onclick extraction + product-page hop.

## Validation
```bash
bun test tests/unit/page-discover.test.ts   # 18 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://devontechnologies.com" --name devonthink --tap "$(mktemp -d)" --verbose
# Preferring official Homebrew cask (homebrew/cask already has "devonthink")
# Generated: .../Casks/devonthink.rb  (official cask Ruby, version 4.3.2)
```

## VM (allbrew 0.0.24 bottle)
Fails until fix is released/upgraded in VM: same homepage generate_fail. Host brew install intentionally not used as success path.
