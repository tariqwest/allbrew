# Fix: picoshare (mtlynch/picoshare)

## URL
https://github.com/mtlynch/picoshare

## Failure class
`generate_fail` (binary-release selected for Linux-only release assets on macOS)

## Root cause
1. Release `v1.5.4` ships only Linux tarballs (`*-linux-amd64/arm64/armv7.tar.gz`).
2. `handleGithubRepo` treated any arch-matched binary asset as installable, including `linuxArm` / `linuxIntel` (truthy `matchAssetToArch` results).
3. That routed to `binary-release`, which correctly throws:
   `No macOS binary assets found in release (Linux-only binaries cannot be installed with Homebrew on macOS)`.
4. Routing never fell through to README / `go.mod` → `go-package`.
5. Even after fallthrough, `go-package` built the module root (`go build` with no package path). PicoShare’s main is at `./cmd/picoshare` (`go build .` → `no Go files`). Also no `--version` flag (daemon flags only `-db`).

## Product fix
1. **`hasHostInstallableBinaryAssets`** (`lib/utils.ts`) — require macOS-tagged assets on Darwin (Linux on Linux) before choosing binary-release.
2. **`lib/cli.ts`** — use host-installable binary assets only; if only non-host binaries exist, fall through to README/source analysis.
3. **`lib/generators/go-package.ts`** — detect `cmd/<name>` (or sole `cmd/*`) via GitHub `cmd/` listing / `resolveGoBuildPackage`; pass as extra `go build` arg.
4. **Template** — append `"./cmd/..."` to `std_go_args` build; use `assert_path_exists` when cmd package (no reliable `--version`).

## Validation (local, worktree)
- Unit: `hasHostInstallableBinaryAssets`, `resolveGoBuildPackage`, go-package suite, template parity.
- Local generate (temp tap + token): produces go formula with `./cmd/picoshare` + `service do`.
- Manual `CGO_ENABLED=1 go build ./cmd/picoshare` on extracted tarball succeeds.

## Residual risk
- Service starts without `PS_SHARED_SECRET` / `PS_SHARED_SECRET_FILE` will exit; launchd may flap. Env not injected into service stanza.
- License rendered as `NOASSERTION` (GitHub API); README claims AGPL.
- CGO/sqlite (`go-sqlite3`) needs a working C toolchain on the install host.
- Bottled/released allbrew does **not** include this fix until released; VM batch uses brew allbrew → still fails until parent promotes fix-package + release.

## Files
- `lib/utils.ts`, `lib/cli.ts`
- `lib/generators/go-package.ts`, `lib/templates/formula/go-package.ts`, `lib/template-payload.ts`
- tests: `tests/unit/utils.test.ts`, `tests/unit/generators/go-package.test.ts`, `scripts/test-templates.ts`
