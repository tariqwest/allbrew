# FIX: damon (https://github.com/hashicorp/damon)

## Case
HashiCorp Nomad TUI. Early-stage Go app; README documents `make build` and `go install ./cmd/damon`. No non-prerelease GitHub releases (only `nightly` assets).

## Agent judgment
- generator: **go-package** with package path `./cmd/damon`
- service: **false** (interactive TUI; not brew-services)
- not a cask

## Failure (allbrew 0.0.24 / VM homeserver)
1. `GO_INSTALL_RE` required `@version`, so `go install ./cmd/damon` was ignored.
2. README `make build` → **source-build** HEAD formula: `system "make", "PREFIX=#{prefix}", "install"`.
3. GNUmakefile has **no** `install` target (only `build`, `install-osx` hardcoding `/usr/local/bin`) → `brew install --HEAD` fails.
4. Even if routed to go-package, root `go build *std_go_args` would miss main at `./cmd/damon`.

## Fixes (worktree; batch mode — no release)
1. **analyzer** — `GO_INSTALL_RE` accepts module paths without `@version` and relative `./cmd/...` specs.
2. **cli** — relative go install package → `goModule=github.com/owner/repo` + `packagePath`.
3. **go-package generator/template** — optional `goBuildExtraArgs` / `packagePath` → `go build *std_go_args, "./cmd/damon"`.
4. **unit tests** for go install without version and damon-like README (go wins over make).

## Validation
- Unit: `bun test tests/unit/analyzer.test.ts --test-name-pattern "go install"` → pass in worktree.
- Offline payload render: formula uses `depends_on "go"` and `go build …, "./cmd/damon"` (no make install).
- VM install with 0.0.24: **brew_fail** (reproduces product bug). Host API DNS flaked during re-generate; fix not released into guest bottle.
- Re-verify after parent reconciles + release: VM `vm-install-one` expected green.

## Residual risk
- go.mod module path is `github.com/hcjulz/damon` (fork history); livecheck/proxy via `github.com/hashicorp/damon` may miss versions — HEAD build from hashicorp/damon still correct.
- Binary nightly zips exist but `getLatestRelease` skips prereleases; binary-release path not used.
- `damon --version` may not match version assertion in brew test (TUI); post-install verify may need `--help`.
