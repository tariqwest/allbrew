# FIX: spotify-player (https://formulae.brew.sh/formula/spotify_player)

## Case
Case C — official Homebrew **formula** page for **spotify_player** (homebrew/core).
Command-driven Spotify TUI (`aome510/spotify-player`), binary `spotify_player`, service: false.

## Agent judgment
- generator: **homebrew-formula** (API + vendor core Ruby + bottles)
- service: **false** (interactive TUI CLI; brew API `service: null`)
- do **not** monorepo-source-build homebrew-core
- end users should prefer `brew install spotify_player` from core once healthy

## Failures observed

### Local main generate (temp tap)
- Correctly classifies as `homebrew-formula` with classifier name `spotify_player`
- `toFormulaName` rewrites `_` → `-` → API fetch `spotify-player.json` → **HTTP 404**
- Same failure with assignment slug `--name spotify-player` (no underscore fallback)

### Secondary (latent after name fix)
- `renderBottleBlock` previously prefixed `:` onto API cellar values already containing `:`, yielding `::any_skip_relocation` (invalid Ruby). Fixed via `formatBottleCellar` (same class as md-tui/kubetui).

## Fixes (worktree validated, batch mode — not released)
1. **`toHomebrewCoreToken` / `homebrewFormulaApiCandidates` / `resolveHomebrewFormulaInfo`** in `lib/generators/homebrew-formula.ts`
   - preserve `_` in core tokens
   - try underscore + hyphen API candidates so `--name spotify-player` still resolves
   - write formula using API `info.name` (`spotify_player`)
2. **`formatBottleCellar` / `renderBottleBlock`** — no double-colon cellar symbols
3. **`lib/cli.ts`** homebrew-formula branch: use `toHomebrewCoreToken` instead of `toFormulaName`
4. Unit tests: `tests/unit/homebrew-formula-spotify-player.test.ts`

## Validation
- Unit tests in worktree: 7 pass
- Local generate (worktree): Formula/spotify_player.rb, `ruby -c` OK, cellar `:any_skip_relocation` (no `::`), version 0.24.1
- Both URL-only and `--name spotify-player` resolve to `spotify_player.rb`
- VM install uses released allbrew (still broken) — expect generate_fail until release

## Residual risk
Until release: main/released allbrew 404s on underscore core formula tokens. Prefer `brew install spotify_player` from homebrew/core for end users.
