# gotify (gotify/cli) collision rename → generic `cli`

## Failure
`allbrew https://github.com/gotify/cli --name gotify` detects binary-release assets correctly, but because `gotify` is a homebrew/core token, collision rename picks the bare GitHub repo name `cli`, producing `Formula/cli.rb` / class `Cli`. That loses product identity and is a bad formula token.

## Expected
- Prefer homebrew/core when README documents `brew install gotify` (healthy core package).
- If generating a tap formula anyway: rename to identity-preserving alt (`gotify-cli`, `gotify-gotify`, `gotify-tap`) — never bare generic nouns (`cli`, `app`, `server`, …).
- service: false (one-shot push CLI, not gotify/server daemon).

## Root cause
`resolveNonCollidingFormulaName` / alt ordering in `lib/cli.ts` tried `repoInfo.name` (`cli`) before owner-repo / `*-cli` style alts, and did not skip generic bare-noun alts.

## Fix (patch mode)
See patches:
- Skip generic formula name alts (`isGenericFormulaNameAlt`) in `lib/utils.ts`
- Prefer `owner/repo`, `owner-repo`, `preferred-owner`, `preferred-cli` before bare repo name in `lib/cli.ts`
- Unit tests in `tests/unit/utils.test.ts`

## Validation
```bash
TMP=$(mktemp -d); mkdir -p "$TMP/Formula"
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts https://github.com/gotify/cli --name gotify --tap "$TMP" --verbose
# expect Formula/gotify-cli.rb or gotify-tap.rb, NOT cli.rb
rg -n "class |bin.install" "$TMP/Formula"/*.rb
```
