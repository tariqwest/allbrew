# FIX: dashbrew (https://github.com/rasjonell/dashbrew)

## Case
Go TUI dashboard builder. README primary install:
`go install github.com/rasjonell/dashbrew/cmd/dashbrew@latest`. Releases have no binary assets. Main package lives under `cmd/dashbrew`.

## Agent judgment
- generator: **go-package**
- service: **false** (interactive TUI; not brew-services)
- bin: `dashbrew` (`-list-themes` / `-c` flags; no `--version`)

## Failure (stock allbrew / current main without fix)
1. Analyzer detects `go (github.com/rasjonell/dashbrew/cmd/dashbrew@latest)`.
2. `collectGoPackagePayload` treats the full install path as `goModule`.
3. Formula renders `go build *std_go_args` **without** `./cmd/dashbrew`.
4. Source tarball has **no root main package** → `brew install` fails (or host success was a pre-existing tap formula that already had `./cmd/dashbrew`).
5. Livecheck incorrectly targeted `…/cmd/dashbrew@latest` proxy path instead of module root.

## Fix (batch Option A — fix-package / worktree only, no release)
| File | Change |
|------|--------|
| `lib/generators/go-package.ts` | Add `resolveGoInstallTarget`: strip `@version`, split `github.com/owner/repo/subpath` → module + `./subpath`; emit `goBuildExtraArgs`. |
| `lib/templates/formula/go-package.ts` | Append `${p.goBuildExtraArgs}` after `std_go_args`. |
| `lib/template-payload.ts` | Optional `goBuildExtraArgs` on `GoPackagePayload`. |
| unit test | dashbrew-like absolute module subpath + relative `./cmd` + root-only. |

Related: damon-2026-08-07 (relative `./cmd` only). This package generalizes to **absolute** `github.com/…/cmd/…@latest` paths.

## Validation (local worktree, temp tap)
```text
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  https://github.com/rasjonell/dashbrew --name dashbrew --tap "$TMP_TAP" --verbose
# formula install: system "go", "build", *std_go_args(...), "./cmd/dashbrew"
# livecheck: proxy.golang.org/github.com/rasjonell/dashbrew/@latest
```

## VM status
- local-1 / local-2: SSH unavailable on guest → env_fail
- homeserver: sparsebundle attach failed / connection reset during cleanup → env_fail
- Product fix validated offline; re-run `vm-install-one` after parent VM hygiene + reconcile/release

## Residual risk
- Formula `test` uses `--version` but CLI has no `--version` flag (`flag provided but not defined`) — `brew test` will fail; install/verify via `-list-themes` or `-h` is fine.
- Until released into guest bottle, VM stock allbrew still generates broken build without package path.
