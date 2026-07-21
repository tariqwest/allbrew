/**
 * Vitest globalSetup for the e2e-tap project.
 *
 * Snapshots ~/.config/allbrew/ once before the suite runs and restores it
 * once after all tests complete. This is the safety net that prevents local
 * E2E-tap runs from polluting the user's real allbrew config/manifests.
 *
 * Per-describe setup/teardown (tests/e2e-tap/helpers/setup.ts) still handles
 * disposable tap creation/disposal and lightweight config.json backup/restore
 * for isolation between describe blocks.
 *
 * If the suite is killed (SIGINT/SIGTERM), the snapshot is preserved under
 * tests/e2e-runs/local/<timestamp>/ and can be restored manually with
 * scripts/test-local-cleanup.sh --restore.
 */
import {
  snapshotLocalState,
  restoreLocalState,
  captureLocalReadout,
  type LocalStateSnapshot,
} from "../helpers/local-state.ts";

let snapshot: LocalStateSnapshot | null = null;

export async function setup(): Promise<LocalStateSnapshot | void> {
  if (process.env.ALLBREW_SKIP_GLOBAL_SETUP === "1") {
    console.log(
      "[e2e-tap globalSetup] ALLBREW_SKIP_GLOBAL_SETUP=1 — skipping snapshot",
    );
    return;
  }
  snapshot = await snapshotLocalState();
  console.log(
    `[e2e-tap globalSetup] Snapshot saved to ${snapshot.runDir}` +
      (snapshot.empty ? " (no existing ~/.config/allbrew)" : ""),
  );
  return snapshot;
}

export async function teardown(
  _snapshotFromSetup?: LocalStateSnapshot | void,
): Promise<void> {
  if (process.env.ALLBREW_SKIP_GLOBAL_SETUP === "1") {
    return;
  }
  const s = snapshot || (_snapshotFromSetup as LocalStateSnapshot | undefined);
  if (!s) {
    console.warn(
      "[e2e-tap globalTeardown] No snapshot available — skipping restore",
    );
    return;
  }

  // Capture readout BEFORE restore so it reflects the post-test, pre-restore
  // state (i.e. shows any test residue the user might want to inspect).
  const testLog = process.env.ALLBREW_TEST_LOG || undefined;
  try {
    await captureLocalReadout(s, testLog);
    console.log(
      `[e2e-tap globalTeardown] Readout saved to ${s.runDir}/readout.txt`,
    );
  } catch (err: any) {
    console.error(
      `[e2e-tap globalTeardown] Readout capture failed: ${err?.message || err}`,
    );
  }

  try {
    await restoreLocalState(s);
    console.log(
      `[e2e-tap globalTeardown] Restored ~/.config/allbrew from ${s.runDir}`,
    );
  } catch (err: any) {
    console.error(
      `[e2e-tap globalTeardown] Restore failed: ${err?.message || err}`,
    );
    console.error(
      `  Manual recovery: scripts/test-local-cleanup.sh --restore`,
    );
  }
}
