# FIX: browser-sync (BrowserSync/browser-sync)

## URL
https://github.com/BrowserSync/browser-sync

## Failure class
**generate_fail** (allbrew 0.0.24 / HEAD): GitHub lerna monorepo root `package.json` has `"name": "browser-sync-mono", "private": true`. Build-system path chooses npm and uses that name for registry lookup → **404** (`browser-sync-mono`).

README has no `npm install -g` line (`detectInstallMethod` → null), so only the package.json build-system path runs.

## Expected path
- Generator: **npm-package**
- packageName: **browser-sync** (published npm package, bin `browser-sync`)
- service: **false** (session-scoped live-reload CLI/proxy, not launchd)
- formulaName/bin: browser-sync

## Root cause
`lib/cli.ts` npm build-system branch always preferred `pkg.name` over `repoInfo.name`, including private monorepo roots.

## Fix (Option A — no release)
1. `isNpmRegistryCandidate(pkg)` in `lib/analyzer.ts` — `private: true` or workspaces without `bin` → false.
2. `lib/cli.ts` npm case — only use `pkg.name` when candidate; otherwise keep **repo name** for registry lookup (browser-sync-mono → browser-sync).
3. On registry 404, fall back to source-build (npm) for true app monorepos (LibreChat-class).
4. Unit tests for `isNpmRegistryCandidate`.

## Validation (local worktree)
```bash
bun test tests/unit/analyzer.test.ts --test-name-pattern "isNpmRegistryCandidate"  # 5 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://github.com/BrowserSync/browser-sync" --name browser-sync --tap "$(mktemp -d)" --verbose
# → Formula with registry.npmjs.org/browser-sync/-/browser-sync-3.0.4.tgz, no service block
```

## VM with brew allbrew 0.0.24
Expected still **generate_fail** until patch is released/reconciled onto the bottle.
