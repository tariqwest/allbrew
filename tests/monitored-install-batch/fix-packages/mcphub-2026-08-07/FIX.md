# mcphub service command fix

## Problem
URL https://github.com/samanhappy/mcphub (npm `@samanhappy/mcphub`).
`detectServiceConfig` saw `http://localhost:3000` + management CLI examples and chose:

`mcphub servers add fetch --type stdio --command uvx --arg mcp-server-fetch`

because `\bserver\b` matched inside `mcp-server-fetch`, and the one-shot `servers` subcommand was not filtered.

Real service entrypoint is bare `mcphub` (bin/cli.js falls through to the hub server when argv is not a management subcommand).

## Fix (lib/analyzer.ts)
1. Reject known one-shot package CLI subcommands (servers, tools, login, call, …).
2. Match service verbs as whole argv tokens only (not inside hyphenated names).
3. When local web/dashboard context exists but only management CLI remains, fall back to bare package binary for hub/dashboard/docker-documented hubs.
4. Reject bare prose token `Open`.

## Validation
- `bun test tests/unit/analyzer.test.ts` — 102 pass
- Live README → `detectServiceConfig(readme, "mcphub")` → `{ command: "mcphub", confidence: "high" }`
- Temp-tap generate → `service do; run opt_bin/"mcphub"`
