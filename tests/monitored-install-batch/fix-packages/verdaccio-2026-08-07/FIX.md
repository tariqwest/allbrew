# Fix: verdaccio (npmjs.com/package/verdaccio) service_mismatch

## Package

- **URL:** https://npmjs.com/package/verdaccio
- **Slug / formula:** `verdaccio`
- **Kind:** npm-package
- **Version observed:** 6.9.2

## Failure class

`service_mismatch` (agent expects long-running private npm registry service; stock allbrew produced no `service do` block)

Install of the npm formula itself succeeds (temp-tap generate + brew install works). Primary bug is missing service stanza on pure npmjs URLs.

## Root cause

1. **`handleNpmPackage` short path** in `lib/cli.ts`: pure npmjs URLs call `generateWithConfirmation("npm-package", { packageName, repoInfo: null })` **without** fetching any README or calling `detectServiceConfig`. Service detection only ran on the GitHub-repo README path.

2. npm registry `readme` field for verdaccio is empty; description alone is insufficient for `detectServiceConfig` (needs documented run command + local endpoint).

3. Upstream GitHub README (default branch / 6.x) documents bare `verdaccio` plus `http://localhost:4873/`, which already classifies as **high-confidence** local web service via existing `detectLocalWebService`.

## Fix (not released — batch Option A)

| File | Change |
|------|--------|
| `lib/cli.ts` | Add `resolveNpmServiceConfig(packageName)`: fetch npm registry meta → parse `repository` → `getReadme(owner, repo)` → `detectServiceConfig`; fall back to description/keywords text. Pass `serviceConfig` into `generateWithConfirmation` from `handleNpmPackage`. |
| `tests/unit/analyzer.test.ts` | Fixture: bare `verdaccio` + `localhost:4873` → high confidence service. |

Patches under `patches/0001-*.patch` … `0002-*.patch`. Full post-fix `cli.ts` also under `patches/`.

## Validation (local worktree)

```text
bun test tests/unit/analyzer.test.ts --test-name-pattern verdaccio  # pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  https://npmjs.com/package/verdaccio --name verdaccio --tap "$TMP_TAP" --verbose
```

Logs: `Detected service/launchagent hint (high confidence)`.

Fixed formula includes:

```ruby
service do
  run opt_bin/"verdaccio"
  keep_alive true
end
```

## Agent judgment

- **expected.service:** `true` (private npm proxy registry daemon; default binds :4873)
- **expected.generator:** `npm-package`
- **codebase (stock):** npm-package, **no** service block
- **after fix:** service `true`, command `verdaccio` via `opt_bin/"verdaccio"`

## Residual risk

- Service starts with default config under launchd; first-run may write config under `$HOME` / Cellar paths — verify storage permissions in real brew services use.
- GitHub API rate limits without token may skip README fetch → no service; description fallback alone may not fire.
- engines `node >= 22` vs Homebrew `node` formula version may cause runtime issues on older Node bottles.
- Fix not released; VM stock allbrew still under-detects service until merge.
- VM pool was flaky (local-1 SSH disabled; homeserver sparsebundle attach failures) during this run — install verify may be env-blocked independent of product fix.
