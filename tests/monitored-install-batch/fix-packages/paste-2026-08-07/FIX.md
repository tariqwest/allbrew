# Fix: paste.app → homebrew/cask paste (brand-compatible homepage match)

## Failure
- URL `https://paste.app` is classified `unknown`.
- The domain now 302s to WeTransfer (`pasteapp.com` → `wetransfer.com`); page discovery finds no installable artifact.
- Product is the macOS clipboard manager **Paste**, official site `https://pasteapp.io/`, already on homebrew/cask as token `paste`.

## Root cause
Case C (`matchOfficialCaskByHomepage`) either missing on released allbrew, or only equates **exact registrable domains**. `paste.app` ≠ `pasteapp.io`, so official cask adoption never fires and non-interactive mode errors.

## Fix
1. Add/extend `matchOfficialCaskByHomepage` with `brandsCompatible()` so host brand label `paste` matches cask homepage brand `pasteapp` for token `paste`.
2. Wire Case C in `lib/cli.ts` before page-discovery for `unknown` URLs.
3. Unit tests for paste.app brand match + unrelated-domain refusal.

## Validation (local worktree)
- `bun test tests/unit/generators/homebrew-cask-homepage.test.ts` → 5 pass
- `CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts https://paste.app --name paste --tap $TMP` → exit 0, writes official `paste.rb` v6.6.6

## Residual risk
- Brand prefix matching requires token length ≥ 3; could theoretically alias similarly named brands (acceptably rare).
- `paste.app` is a dead/repurposed domain; matching on original URL host brand is intentional so redirects to WeTransfer do not poison discovery.
- VM stock allbrew will still fail until parent reconciles + releases this fix.
