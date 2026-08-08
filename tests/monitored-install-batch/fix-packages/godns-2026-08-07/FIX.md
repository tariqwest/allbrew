# Fix: godns (TimothyYe/godns) service_mismatch + binary-release early path

## Package

- **URL:** https://github.com/TimothyYe/godns
- **Slug / formula:** `godns` → collides with homebrew/core → **`godns-tap`**
- **Kind:** binary-release (goreleaser multi-arch tarballs)
- **Version observed:** 3.4.3

## Failure class

`service_mismatch` (agent expects long-running DDNS daemon service; stock allbrew produced no `service do` block)

Install of the binary itself succeeds (local generate + brew install of `godns-tap` works). Formula `test` uses `--version` but upstream only supports `-h` / banner — `brew test` would fail (homebrew/core uses `-h`); residual risk, not the primary failure.

## Root cause

1. **Early binary-release short-circuit** in `handleGithubRepo` (`lib/cli.ts`): when release assets match `isBinaryAsset`, allbrew returns immediately with `{ repoInfo, release }` **without** fetching the README or calling `detectServiceConfig`. Service detection only ran on the later README path that never executes for binary-rich releases.

2. **Analyzer gaps** for systemd-managed Go daemons:
   - `detectServiceConfig` did not treat `systemctl enable/start <unit>` or “as a managed daemon” sections as high-confidence services.
   - Bare `./godns` / `nohup ./godns &` are rejected by `isRunnableCommand` (`./` prefix) and `isServiceLikeCommand` (single token).
   - `detectServiceConfigFromFiles` only recognized launchd plists, not `*.service` under `systemd/`.

3. **Service bin name vs formula rename:** when core collision renames the formula to `godns-tap`, `buildServiceBlock(..., name)` used the formula name as fallback, risking `opt_bin/"godns-tap"` instead of the real binary `godns`. Fixed by using resolved `binName`.

## Fix (not released — batch Option A)

| File | Change |
|------|--------|
| `lib/cli.ts` | Before early `binary-release` return, fetch README + `detectServiceConfig` and pass `serviceConfig` into `generateWithConfirmation`. |
| `lib/analyzer.ts` | Detect `systemctl enable/start` and managed-daemon sections; detect systemd unit paths in `detectServiceConfigFromFiles`. |
| `lib/generators/binary-release.ts` | `serviceBlock` uses `binName` (not formula name) for `opt_bin`. |
| `tests/unit/analyzer.test.ts` | Coverage for godns-like systemd README + unit file paths. |

Patches under `patches/0001-*.patch` … `0004-*.patch`. Full post-fix sources also copied into `patches/`.

## Validation (local)

```text
bun test tests/unit/analyzer.test.ts  # 102 pass in worktree
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  https://github.com/TimothyYe/godns --name godns --tap "$TMP_TAP" --verbose
```

Fixed formula includes:

```ruby
service do
  run opt_bin/"godns"
  keep_alive true
end
```

and logs: `Detected service/launchagent hint (high confidence)`.

## Agent judgment

- **expected.service:** `true` (DDNS client; systemd/upstart/procd/Windows service docs; optional web panel :9000)
- **expected.generator:** `binary-release`
- **codebase (stock):** binary-release, `godns-tap`, **no** service block
- **after fix:** service `true`, command `godns` via `opt_bin/"godns"`

## Residual risk

- Homebrew/core already packages `godns` (source build + web resource); allbrew emits `godns-tap` binary formula — intentional collision rename.
- Service requires a valid config (`-c`); default `./config.json` is missing in Cellar — `brew services start` may crash-loop until the user supplies config (same as upstream systemd unit expecting config path tweaks).
- Formula `test` still uses `--version` which godns rejects (`flag provided but not defined: -version`); core uses `-h`.
- Fix not released; VM stock allbrew still under-detects service until merge.
