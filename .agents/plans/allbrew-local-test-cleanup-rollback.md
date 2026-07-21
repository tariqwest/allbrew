# Local E2E Test Cleanup & Rollback

## Goal
Mirror the Lume VM reset/rollback concept for local runs so that running E2E tests on the user's real macOS filesystem and Homebrew instance does not pollute `~/.config/allbrew/`, custom taps, or installed packages.

## Background

- The VM harness (`scripts/e2e-vm-reset.sh`) can fully reset a Lume VM after a test run.
- Local E2E tests currently have gaps:
  - `tests/e2e-tap/helpers/config.ts` only backs up `config.json` and has a bug that tries to read the `packages` directory as a file.
  - `tests/e2e/catalog.e2e.test.ts` does not backup/restore `~/.config/allbrew/` at all.
  - If a test process is killed, no automatic cleanup runs.
  - There is no manual local cleanup/recovery script equivalent to `e2e-vm-reset.sh`.

## Design decisions

| Decision | Choice |
|----------|--------|
| Trigger | Built into the test harness (automatic snapshot/restore) |
| Mode | Conservative: restore `~/.config/allbrew/` and remove test-created disposable taps; leave unrelated user Homebrew state alone |
| Tiers covered | E2E only (`e2e-tap` and `e2e` catalog) |

## Implementation steps

1. **Create shared local-state helpers** (`tests/helpers/local-state.ts`)
   - `snapshotLocalState()`: copy `~/.config/allbrew/` into a timestamped run record under `tests/e2e-runs/local/<timestamp>/config-backup/`, symlink `tests/e2e-runs/local/latest`.
   - `restoreLocalState(snapshot)`: replace the current `~/.config/allbrew/` directory with the backup.
   - `getLatestSnapshot()`: read the `latest` symlink for the manual cleanup script.

2. **Fix E2E-tap config backup/restore** (`tests/e2e-tap/helpers/config.ts`)
   - Replace the current broken `backupConfig()`/`restoreConfig()` with calls to the shared snapshot/restore helper.
   - Keep `setTestConfig()` and `clearTestManifests()` behavior.

3. **Add global E2E-tap snapshot/restore** (`tests/e2e-tap/globalSetup.ts`, `vitest.config.ts`)
   - Add a Vitest `globalSetup` to the `e2e-tap` project that snapshots state once at suite start and restores it at suite end.
   - Existing per-describe `teardownTestContext()` still untaps and disposes its own tap.

4. **Harden E2E-tap tap disposal** (`tests/e2e-tap/helpers/tap.ts`)
   - Make `destroyDisposableTap()` more defensive: uninstall any packages still reported from the tap, then `brew untap --force`, then remove temp git dirs.
   - Add logging on cleanup failures so the user can see residue.

5. **Add E2E catalog snapshot/restore** (`tests/e2e/catalog.e2e.test.ts`)
   - Snapshot `~/.config/allbrew/` in `beforeAll`.
   - In `afterAll`: restore config/manifests, uninstall any catalog apps still installed, and remove the temp tap dir.

6. **Create manual local cleanup script** (`scripts/test-local-cleanup.sh`)
   - `--dry-run`: show current test residue and available snapshots without changing anything.
   - `--restore`: restore the latest `~/.config/allbrew/` snapshot.
   - `--force`: additionally untap/remove disposable `test/e2e-tap-*` taps and uninstall their packages.
   - Default to `--dry-run` output so it is safe to run accidentally.

7. **Update wrapper scripts & docs**
   - Update `scripts/test-e2e-tap.sh` to mention that cleanup is automatic and add a `--no-cleanup` debug escape hatch.
   - Create `scripts/test-e2e.sh` wrapper for the catalog tests.
   - Update `AGENTS.md` local testing section to describe the snapshot/rollback behavior and the cleanup script.

## Files to modify

- `tests/e2e-tap/helpers/config.ts` — fix backup/restore to snapshot whole `~/.config/allbrew/`
- `tests/e2e-tap/helpers/setup.ts` — integrate snapshot/restore into setup/teardown
- `tests/e2e-tap/helpers/tap.ts` — harden tap/package disposal
- `tests/e2e/catalog.e2e.test.ts` — snapshot before and restore/cleanup after
- `vitest.config.ts` — add `globalSetup` to e2e-tap project
- `scripts/test-e2e-tap.sh` — document auto-cleanup, add `--no-cleanup`
- `AGENTS.md` — document local cleanup/rollback

## Files to create

- `tests/helpers/local-state.ts` — shared snapshot/restore helpers
- `tests/e2e-tap/globalSetup.ts` — e2e-tap global setup/teardown
- `scripts/test-local-cleanup.sh` — manual cleanup/recovery script
- `scripts/test-e2e.sh` — E2E catalog wrapper

## Verification

- `bun run check` passes
- `bun run test` passes
- Run `E2E_TAP=1 bun run test:e2e-tap` and verify a run record appears in `tests/e2e-runs/local/<timestamp>/`
- Verify `~/.config/allbrew/` is restored to its pre-test contents
- Verify `scripts/test-local-cleanup.sh --dry-run` reports no residue after a successful run

## Risks / considerations

- Snapshot/restore copies the whole `~/.config/allbrew/` directory; this is small but adds a few seconds per run.
- If the test process is killed (`kill -9`), automatic restore cannot run; the manual cleanup script uses the preserved snapshot.
- The cleanup script will not aggressively uninstall unrelated user packages (conservative mode); it only touches test-created taps/packages and restores `~/.config/allbrew/`.
- Moving or importing shared helpers across test directories should avoid circular imports.
