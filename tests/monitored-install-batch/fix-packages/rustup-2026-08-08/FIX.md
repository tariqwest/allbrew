# FIX: rustup (`https://sh.rustup.rs`)

## Case
Official rustup bootstrap URL. Downloads `rustup-init` and installs under `$HOME/.cargo`, not Homebrew PREFIX/Cellar. homebrew/core already ships healthy formula `rustup` (keg-only, bottles).

## Failures observed (allbrew main / 0.0.24)
1. Classified `bash-script` → **install-script** formula renamed to `rustup-tap` (core name collision).
2. Formula runs `system "bash", cached_download` without `-y` → `Unable to run interactively`.
3. Even with `-y`, binaries land in `$HOME/.cargo/bin`, not `buildpath/bin` → **Empty installation**.
4. version hard-coded `0.0.1`; livecheck against bootstrap URL is useless.
5. Parallel path: homebrew-formula bottle injector double-colons API cellar symbols (`::any_skip_relocation`) — fixed as dependency of Case C.

## Agent judgment
| Field | Value |
|-------|--------|
| inputShape | bash-script / rustup-init bootstrap |
| expected.generator | **homebrew-formula** `rustup` (Case C) |
| expected.service | **false** (CLI toolchain manager) |
| installPossible via install-script wrap | **false** |

## Fix (batch Option A — no release)
1. **`lib/install-script-analyze.ts`** — detect rustup bootstrap URL/body (`sh.rustup.rs`, `rustup-init` + `RUSTUP_UPDATE_ROOT`); `packageHintFromInstallUrl` → `rustup`; kind `home-dir-installer`.
2. **`lib/cli.ts` `handleBashScript`** — on `home-dir-installer` / OOS / appstore, `resolveExistingHomebrewClassification` → Case C homebrew-formula/cask; else throw clear error.
3. **`lib/utils.ts`** — `resolveExistingHomebrewClassification` (core preferred over cask).
4. **`lib/generators/homebrew-formula.ts`** — `formatBottleCellar` (no `::` double-colon).
5. Unit tests `tests/unit/install-script-analyze-rustup.test.ts`.

## Validation (worktree `worktrees/rustup-2026-08-08`)
```bash
bun test tests/unit/install-script-analyze-rustup.test.ts  # 5 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://sh.rustup.rs" --name rustup --tap "$(mktemp -d)" --verbose
# → Case C formula "rustup", cellar: :any_skip_relocation, ruby -c OK
```

## Residual risk
- Full green path needs parent integrate + release + VM bottle upgrade; released 0.0.24 still wraps install-script.
- Core `rustup` is keg-only (conflicts with `rust`); PATH caveats apply.
- VM pool: local-2 SSH unavailable; homeserver mutex contention during batch — product failure proven via local generate + install-script simulation.
- Host brew auto-install during fixed generate may touch host core `rustup` (already present); not the isolation success path.
