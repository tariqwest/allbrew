# Fix: poolside.ai pool/install.sh → multi-arch binary formula

## Problem
`https://downloads.poolside.ai/pool/install.sh` classified as `bash-script` → `install-script` formula that:
- version `0.0.1` (no version in URL)
- runs interactive vendor installer (EULA prompt unless `POOL_INSTALL_ACCEPT_EULA=1`)
- installs to `$HOME/.local/bin` / `POOL_INSTALL_DIR` (ignores PREFIX)
- harvests only `buildpath/bin/*` → **empty or hung install**

## Root cause
`handleBashScript` always used install-script without inspecting the script body for prebuilt multi-arch archives.

## Fix
1. `lib/install-script-analyze.ts` — detect `BASE_URL` + `archive=…-${os}-${arch}.tar.gz` + latest-version file; home-dir installer signals.
2. `lib/generators/install-script-prebuilt.ts` — resolve version (preserve `v` path prefix), hash macOS/Linux archives, emit `binary_release` payload with `on_macos`/`on_linux` blocks.
3. `handleBashScript` — prefer prebuilt binary formula when plan detects; fall back to install-script.
4. install-script template — set `INSTALL_DIR`/`XDG_BIN_HOME` and harvest `.local/bin` as fallback for non-prebuilt scripts.
5. Unit tests for pool snippet.

## Validation
- Unit: `tests/unit/install-script-prebuilt.test.ts` 3/3 pass
- Local generate (worktree): multi-arch formula version 1.0.15, correct shas
- Service: false (CLI) — matches agent expectation
- VM: bottle still has old allbrew until reconcile/release; env may need `bun` on sparsebundle

## Residual risk
- Other installers with different archive naming may need more templates
- EULA acceptance is bypassed by not running vendor script (downloads official prebuilt only)
