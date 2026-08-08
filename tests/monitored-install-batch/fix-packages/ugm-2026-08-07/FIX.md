# FIX: ugm (GitHub ariasmn/ugm)

## URL
https://github.com/ariasmn/ugm

## Failure class
`generate_fail` (initial): Linux-only release assets short-circuit to `binary-release`, which throws "No macOS binary assets".

`brew_fail` (after fallthrough): go-package formula generates correctly, but **ugm does not compile on Darwin** — `userparser` / `groupparser` use `//go:build linux || freebsd || openbsd || netbsd` only. Releases also ship no darwin assets. README notes OSX inaccuracy; code excludes macOS entirely.

## Expected
- Interactive TUI (bubbletea). `service: false`.
- README: `go install github.com/ariasmn/ugm@latest` → generator `go-package`.
- Linux-only GitHub release binaries must not select binary-release on macOS.
- Go install path@version must strip tag so head URL is `github.com/ariasmn/ugm.git` not `…/ugm@latest.git`.

## Fixes (batch — no release)
1. **lib/cli.ts**: only macOS-arch binary assets count for binary-release; Linux-only → README fallthrough (same as gpg-tui).
2. **lib/analyzer.ts**: strip `@version` / `@latest` from `go install` module path.
3. **lib/generators/go-package.ts**: sanitize `options.goModule` the same way.
4. **tests/unit/analyzer.test.ts**: expect stripped module path; ugm@latest fixture.

## Residual (hard blocker on macOS)
- Product generate path is fixed; **macOS `brew install` cannot succeed** without upstream adding darwin build support or shipping macOS binaries.
- Prefer documenting as Linux-only / `depends_on :linux` if packaging for Linux Homebrew; do not treat host/VM macOS install failure as an allbrew bug after these patches.
- Guest brew allbrew 0.0.24 lacks patches until parent reconcile/release.

## Validation
```bash
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://github.com/ariasmn/ugm" --name ugm --tap "$(mktemp -d)" --verbose
# → go-package Formula/ugm.rb, no service, head without @latest
bun test tests/unit/analyzer.test.ts tests/unit/generators/go-package.test.ts
```
