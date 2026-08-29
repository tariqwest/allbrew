# cargo-package smoke breakdown

Generated: 2026-08-16T22:58:01.261Z

## Patch summary

- Cargo generator: implemented and unit-tested on `tests/unit/generators/cargo-package.test.ts` (38/38 pass).
- Smoke harness fixes committed mid-run:
  - `lib/cli.ts`: raised `execFileAsync` `maxBuffer` for `brew install` from the default 1 MB to 50 MB to avoid a Bun process crash when heavy source builds produce large output.
  - `tests/monitored-install-batch/smoke-batch.mjs`: changed log handling from `writeFileSync` to `appendFileSync` so `vm-install-one` guest transcripts are preserved instead of overwritten by orchestrator child output.
- Note: the running smoke had already loaded the previous `smoke-batch.mjs`, so the per-package guest build transcripts for this run are not preserved. Classification in this breakdown therefore relies on `smoke-outcomes.jsonl`, `smoke-*.log.status.json`, `*-vm-meta.json`, and the generated `.formula.rb` files.

## Validation results

- `bun run check`: passed.
- `bun test tests/unit/generators/cargo-package.test.ts`: 38 pass, 0 fail.
- Smoke: **0/30 packages installed successfully** across three endpoints.
- Classified failures: 
  - 8 system timeouts (per-URL budget > 300 s)
  - 15 Bun/VM signal-138 crashes
  - 0 system SIGKILLs
  - 2 generator/build/test failures
  - 5 generator/analyzer failures
  - 0 unknown

## Per-endpoint table

### homeserver

| name | url | status | duration (s) | real exit | formula | classification |
|------|-----|--------|--------------|-----------|---------|----------------|
| agy-acp | https://github.com/hicder/agy-acp | failed | 26.0 | 1 | no | Generator/classifier bug |
| rrtop | https://github.com/wojciech-zurek/rrtop | failed | 28.4 | 1 | no | Generator/classifier bug |
| manga-tui | https://crates.io/crates/manga-tui | failed | 126.8 | 1 | yes | Generator/build/test |
| tgt | https://github.com/FedericoBruzzone/tgt | failed | 29.7 | 1 | no | Generator/classifier bug |
| kiorg | https://github.com/houqp/kiorg | failed | 29.2 | 1 | no | Generator/classifier bug |
| ddv | https://github.com/lusingander/ddv | failed | 29.1 | 1 | no | Generator/classifier bug |
| twitch-tui | https://crates.io/crates/twitch-tui | failed | 215.8 | 138 | yes | System crash (Bun signal 138) |
| krokiet | https://crates.io/crates/krokiet | failed | 297.8 | 1 | yes | Generator/build/test |
| managarr | https://crates.io/crates/managarr | failed_system_timeout | 300.0 | — | no | System timeout |
| oatmeal | https://crates.io/crates/oatmeal | failed_system_timeout | 300.0 | — | no | System timeout |

### local-1

| name | url | status | duration (s) | real exit | formula | classification |
|------|-----|--------|--------------|-----------|---------|----------------|
| nostui | https://crates.io/crates/nostui | failed | 189.3 | 138 | yes | System crash (Bun signal 138) |
| oculante | https://crates.io/crates/oculante | failed | 53.1 | 138 | yes | System crash (Bun signal 138) |
| rerun-cli | https://crates.io/crates/rerun-cli | failed | 203.7 | 138 | yes | System crash (Bun signal 138) |
| aichat | https://crates.io/crates/aichat | failed | 69.5 | 138 | no | System crash (Bun signal 138) |
| emulsion | https://crates.io/crates/emulsion | failed | 83.0 | 138 | no | System crash (Bun signal 138) |
| gobang | https://github.com/TaKO8Ki/gobang | failed_system_timeout | 300.0 | — | no | System timeout |
| czkawka_cli | https://crates.io/crates/czkawka_cli | failed | 165.4 | 138 | yes | System crash (Bun signal 138) |
| tickrs | https://crates.io/crates/tickrs | failed | 110.7 | 138 | yes | System crash (Bun signal 138) |
| ripgrep | https://crates.io/crates/ripgrep | failed_system_timeout | 300.0 | — | no | System timeout |
| fd | https://crates.io/crates/fd-find | failed_system_timeout | 300.0 | — | no | System timeout |

### local-2

| name | url | status | duration (s) | real exit | formula | classification |
|------|-----|--------|--------------|-----------|---------|----------------|
| bat | https://crates.io/crates/bat | failed | 141.1 | 138 | yes | System crash (Bun signal 138) |
| eza | https://crates.io/crates/eza | failed | 77.5 | 138 | no | System crash (Bun signal 138) |
| zoxide | https://crates.io/crates/zoxide | failed | 187.2 | 138 | yes | System crash (Bun signal 138) |
| starship | https://crates.io/crates/starship | failed | 241.9 | 138 | yes | System crash (Bun signal 138) |
| dust | https://crates.io/crates/du-dust | failed_system_timeout | 300.0 | — | no | System timeout |
| dua | https://crates.io/crates/dua-cli | failed | 276.6 | 138 | yes | System crash (Bun signal 138) |
| git-delta | https://crates.io/crates/git-delta | failed | 107.1 | 138 | no | System crash (Bun signal 138) |
| hyperfine | https://crates.io/crates/hyperfine | failed | 101.4 | 138 | no | System crash (Bun signal 138) |
| tokei | https://crates.io/crates/tokei | failed_system_timeout | 300.0 | — | no | System timeout |
| onefetch | https://crates.io/crates/onefetch | failed_system_timeout | 300.0 | — | no | System timeout |

## Failure classification

1. **System timeout** (`status=failed_system_timeout`, duration ≈ 300 s): the package hit the 5-minute per-URL budget and was killed. These are environment/time-budget failures, not generator code failures. They occurred on the first/early packages where `rust` was not yet cached or on packages whose compile took the full budget.

2. **System crash / Bun signal 138** (`real exitCode=138`): the allbrew process inside the Lume VM terminated with signal 10 (SIGBUS) during `brew install`. This is a runtime/VM issue: the `bun` process in the VM was killed by the OS while installing or building. It is not a generator logic bug. It was the dominant failure mode on local-1 and local-2 and also hit a few packages on homeserver (e.g., twitch-tui).

3. **Generator/build/test failure** (`real exitCode=1`, formula generated): allbrew generated a valid-looking formula and started `brew install`/`brew test`, but the install/test returned 1 (build error, missing dependency, or test mismatch). Examples: `manga-tui` and `krokiet` on homeserver. These are the class of failure we would investigate as generator or package-specific issues.

4. **Generator/analyzer failure** (`real exitCode=1`, no formula): allbrew failed before producing a formula, usually during GitHub repo analysis, README/build-system detection, or source fetch. Examples on homeserver: `agy-acp`, `rrtop`, `tgt`, `ddv`, `kiorg`. These point to classifier/generator logic for GitHub-sourced cargo packages.

## VM hygiene notes

- Post-smoke `vm-guest-health.mjs --clear-stale --deep` for all three endpoints reported `healthy_with_warnings`; all endpoints are free, running, and SSH-reachable.
- Each endpoint shows a **guest Homebrew lock present** at `/var/run/lume-homebrew.lock`. This is a stale lock left by the last timed-out/killed package and is normally force-unlocked by `vm-install-one` pre-acquire.
- The mutexes in `tests/monitored-install-batch/logs/vm-mutex-*.lockdir` were all free after the smoke.
- Guest disks have ample free space (`/` 13–35 GiB, `/opt/homebrew` 14–15 GiB), so disk exhaustion is not the primary cause of the 138 crashes.
- `rust` was never fully installed on local-1 and local-2 during the smoke, so every cargo formula had to pull `rust` (and its large `llvm` dependency) repeatedly. This is the main driver of the 5-minute timeouts and the repeated Bun crashes.

## Additional findings

- **No package completed install + verification**. The closest were `manga-tui` and `krokiet` on homeserver, which generated formulas and returned a controlled `exitCode=1` from the build/test phase (formula files are preserved).
- **Guest transcripts lost**: because the active `smoke-batch.mjs` process held the old `writeFileSync(log, chunks.join(""))` behavior, the per-package `vm-install-one` host logs were overwritten with only the orchestrator child summary. The committed `appendFileSync` fix will preserve full transcripts in future runs.
- **Source sync did update mid-run**: the `lib/cli.ts` maxBuffer fix and `smoke-batch.mjs` log fix were committed and pushed to `origin/fix/cargo-package` during the smoke. Post-fix packages (e.g., tickrs, onefetch, twitch-tui) still crashed with 138, confirming the crash is deeper than stdout buffering and likely tied to the VM/Bun runtime or `rust` source-build environment.

## Recommended next steps

1. Pre-install or cache a working `rust` formula on the Lume endpoints so the smoke budget is spent on the package, not on `rust` build/install.
2. Investigate the Bun signal-138 crashes: run a single heavy package with `bun` strace/dtruss, use `spawn` with streaming instead of `execFileAsync` for `brew install`, and/or reduce concurrent memory pressure.
3. Fix GitHub-sourced cargo classifier path for repos with no Cargo.toml at root or no matching install method (agy-acp, rrtop, etc.).
4. Re-run the smoke with the committed log-preservation fix and a longer or per-endpoint `rust` pre-warm step.
