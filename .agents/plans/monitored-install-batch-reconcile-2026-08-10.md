# Monitored-install-batch reconcile — 2026-08-10 (≈213 patches)

> Integrate ~100–213 `fix-package/` patches from `tests/monitored-install-batch/` (35 on `main`, 178 archived) into `main` without losing new use-cases and without regressions.

## Context (grounded)

- **Current lean state:** `tests/monitored-install-batch/fix-packages/` 35 dirs (agent-deck..tusk), `archive/manifest.json` points to `~/.cache/allbrew/batch-artifacts/2026-08-10/batch-2026-08-10.tar.zst` (9.2M, sha256 `01af8e`, 213 fixPackages + 1501 runs + 1516 logs, gitSha `2fc0d66`). `state/fix-index.jsonl` 1903 entries, `state/index.jsonl` 1009 runs, `state/progress.json` `done 256/256`. `scripts/archive-batch-artifacts.mjs --verify --prune-move` keeps `main` lean; index stays tracked.
- **Per fix-package shape:** `FIX.md` (failureClass `brew_fail|generate_fail|prompt_hang`, root-cause), `patches/*.patch` (worktree `git diff` vs `HEAD`, not committed to main), `manifest.json`/`validation.json` (`bun run check` + targeted `bun test`), `agent-judgment.json`/`classifier-rule.mjs` when deltas, plus `worktrees/<slug>-<ts>/` for local re-verify.
- **Tooling:** `reconcile-fix-packages.mjs` (disposable `worktrees/`, never mutates working tree, promotes `fix/<slug>` branch, enqueues retry), `lib/patch-coordinator.mjs` (`discoverFixPackages`, `reconcileOne/Pending`), `batch-ops.mjs` (list/restore archived slice), `vm-install-one.mjs` (VM `th-allbrew` exclusive `/opt/homebrew` via `vm-pool.json`, `vm-guest-health.mjs`), `archive/manifest.json` as remote index.
- **Current HEAD:** `7b3559f` (0.0.30) includes `binary-release` wrapper fix for `atomic-agent` (`4d6a06b`). Patches based on `2fc0d66` will drift — skill phase renumber (`ec3d6ad`) already accounted.

## Goals

- All distinct new scenarios (e.g., `agent-deck` install-script `--non-interactive`, `bear` `page-discover` `mt=12`) merged to `main` as minimal, typed patches.
- No regression: `bun run check` (tsc --noEmit), `bun run test` (868 unit, mocked), `bun run test:templates` (13 fixtures byte-parity) green; selective `test:int:gate` and VM `brew install` retries.

## Non-goals

- No bulk `git am` on `main`; no `bun run release` during batch (harness `TH_BATCH_FIX_MODE=docs`).
- No per-URL branches on `main` — option-A worktrees only.

## Strategy — staged reconcile

### 1. Inventory + restore (read-only)

```bash
bun tests/monitored-install-batch/batch-ops.mjs --list-archived --tar ~/.cache/allbrew/batch-artifacts/2026-08-10/batch-2026-08-10.tar.zst | head
tar -I zstd -tf ~/.cache/.../batch-*.tar.zst | grep fix-packages | wc -l  # 213
bun scripts/archive-batch-artifacts.mjs --dry-run
# materialize slice on demand (keep main lean):
tar -I zstd -xf ~/.cache/.../batch-*.tar.zst -C /tmp/restore fix-packages/<slug>/
# or:
bun tests/monitored-install-batch/batch-ops.mjs --restore --slug bear --dest /tmp/restore
```

Bucket: `rg "^## Failure class" fix-packages/*/FIX.md | sort | uniq -c`; `rg --files patches | xargs rg -l "page-discover|binary-release|install-script|classifier|templates/formula"` → group by `lib/*.ts` touch-set. Dedup by `patch sha256` and `failureClass+file` → 213 → ~110–130 distinct logical fixes (e.g., duplicate `bear` MAS, overlapping `binary-release` wrapper).

### 2. Conflict preflight (no mutation)

```bash
node tests/monitored-install-batch/reconcile-fix-packages.mjs --dry-run --limit 100 --json | jq '.[] | {slug, files, conflicts, validation}'
git apply --check fix-packages/*/patches/*.patch   # hunk overlap
```

Merge order: `template-payload/utils` → generators (`binary-release`, `npm`, `pip`, `go`, `cargo`, `cask`) → `analyzer/classifier/page-discover` (most cross-cutting) last. Note: `binary-release` wrapper already on `main` (`4d6a06b`) — mark overlapping picks superseded.

### 3. Worktree per logical group (never on main working tree)

```bash
node tests/monitored-install-batch/reconcile-fix-packages.mjs --path fix-packages/agent-deck --no-cleanup
# inspect: cat worktrees/agent-deck-*/FIX.md; git -C worktrees/... log --oneline -2; cat validation.json

# batch next group (10 at a time, baseline is current release):
node tests/monitored-install-batch/reconcile-fix-packages.mjs --limit 10 --baseline 7b3559f --json > /tmp/reconcile-1.json
```

Each promotion is `fix/<slug>-<shortsha>` with single commit. Same-file conflicts (5 patches touch `pickArchiveEntrypoint`) → squash into one topic branch `fix/binary-release-batch1` by `git apply --3way` sequentially in `worktrees/`, preserving each `FIX.md` as trailer. Requires `zstd` for archive.

Lock hygiene: prefer `TH_BATCH_CONCURRENCY=1 TH_BATCH_WORKERS=th-allbrew` until multi-prefix Homebrew works; `vm-guest-health.mjs` + `forceUnlockHomebrewPrefix` avoids mass `env_fail` (stale `/var/run/lume-homebrew.lock` with dead host PID).

### 4. Verification (gating before merge to main)

- **Fast gate (host, every group):** `bun run check` + `bun test tests/unit --test-name-pattern "<generator>"` + `bun run test:templates`. Already in `validateBeforePromote`; use `--skip-validation` only for `--dry-run`.
- **Per-use-case gate (VM, selective 1 per generator group):** `vm-install-one.mjs --allbrew-src $WT --url <original URL> --name <slug>` → harness acquires exclusive `/opt/homebrew`, runs `agent-judgment` + `brew install` + `bin --help/--version` or `.app` + optional `service` stanza + `brew uninstall` + `assertUninstallResiduals`. Sample coverage suffices for new scenario.
- **Regression gate (on `integration/batch-2026-08-10`):** merge topics via `git merge --no-ff fix/binary-release-batch1 fix/page-discover-batch1 ...` then `bun run test` (full mocked), `bun run test:templates`, at least `bun run test:int:gate` for live registries; casks/mas need `vm-guest-health.mjs --json` healthy before `brew install --cask`.

### 5. Catalog promotion (lock new use-cases)

```bash
bun tests/monitored-install-batch/regen-catalog-queue.py   # or add-test-case/add-row.mjs
# uses md-spreadsheet-parser (never raw split('|')) for .agents/plans/allbrew-test-cases.md (24-col GFM, backtick pipes)
# and tests/e2e/catalog.json (skip:true unless live E2E requested)
```

### 6. Final merge → main

```bash
git checkout main && git merge --no-ff integration/batch-2026-08-10 -m "batch: reconcile 2026-08-10 213 fix-packages (120 distinct) via worktrees"
git status  # must be clean (release script requires it)
GITHUB_TOKEN=... bun run release patch  # pushes tag + tap tariqwest/tap
brew update && brew upgrade allbrew && allbrew --version  # verify bottle
```

## Risks & mitigations

- **Same-file hunk conflicts (score/filter in `pickArchiveEntrypoint`, `scoreCandidateUrl`):** mitigate by grouping and 3-way apply in worktrees; preserve `FIX.md` evidence (`mas-mac-storefront +8` for `mt=12` vs iOS tie).
- **Wrapper flattening (`libexec.install Dir["*"]` vs `darwin-arm64/` wrapper):** already fixed for `atomic-agent`; re-check any `binary-release` patch that re-introduces wrapper path.
- **MAS/iOS env limitation (`bear` id 1091189122 requires Apple ID via `mas`):** keep as doc, not VM gate — corrected selection is the deliverable; brew install will still `env_fail` on headless VM without `mas signin`.
- **VM pool contention (homeserver/local-1/local-2):** throttle to single-worker, preflight-unlock before/after bootstrap.
- **Disk pressure:** batch artifacts ~107M per wave (archived to 9.2M zstd); `brew cleanup -s` before large waves.

## Files

- Inputs: `tests/monitored-install-batch/fix-packages/*/FIX.md|patches/*.patch|validation.json`, `state/fix-index.jsonl`, `archive/manifest.json`, `~/.cache/allbrew/batch-artifacts/2026-08-10/batch-2026-08-10.tar.zst`
- Tools: `reconcile-fix-packages.mjs`, `lib/patch-coordinator.mjs`, `batch-ops.mjs`, `vm-install-one.mjs`, `vm-guest-health.mjs`, `scripts/archive-batch-artifacts.mjs`, `add-test-case` skill
- Outputs: `integration/batch-2026-08-10` branch → `main`, `tests/e2e-runs/<ts>/readout.txt` analogue, `allbrew 0.0.31+` bottle
