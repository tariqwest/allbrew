#!/usr/bin/env bun
/**
 * Local E2E-tap runner: snapshots ~/.config/allbrew, runs `bun test` for the
 * e2e-tap tier, captures a post-test readout, then restores the snapshot.
 *
 * This replaces the Vitest globalSetup that previously handled snapshot/restore
 * around the e2e-tap project. Run via `bun run test:e2e-tap` or directly:
 *
 *   E2E_TAP=1 bun run scripts/e2e-tap-local-runner.ts [bun-test-args...]
 *
 * Set ALLBREW_SKIP_GLOBAL_SETUP=1 to skip snapshot/restore (debugging only).
 */
import { join } from "node:path";
import { openSync, closeSync, writeSync, statSync } from "node:fs";
import {
  snapshotLocalState,
  restoreLocalState,
  captureLocalReadout,
  type LocalStateSnapshot,
} from "../tests/helpers/local-state.ts";

const SKIP = process.env.ALLBREW_SKIP_GLOBAL_SETUP === "1";
const TEST_TIMEOUT = "600000";
const extraArgs = process.argv.slice(2);

function teeStream(
  src: ReadableStream<Uint8Array> | null,
  fd: number,
  logFd: number,
): Promise<void> {
  if (!src) return Promise.resolve();
  const reader = src.getReader();
  return (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      writeSync(fd, value);
      if (logFd >= 0) writeSync(logFd, value);
    }
  })();
}

async function main(): Promise<number> {
  let snapshot: LocalStateSnapshot | null = null;

  if (!SKIP) {
    snapshot = await snapshotLocalState();
    console.log(
      `[e2e-tap runner] Snapshot saved to ${snapshot.runDir}` +
        (snapshot.empty ? " (no existing ~/.config/allbrew)" : ""),
    );
  }

  // Write test output to <runDir>/test-output.log AND inherit to console.
  const logPath = snapshot
    ? join(snapshot.runDir, "test-output.log")
    : null;
  const logFd = logPath ? openSync(logPath, "w") : -1;

  const testCmd = [
    "bun",
    "test",
    "tests/e2e-tap/",
    "--timeout",
    TEST_TIMEOUT,
    ...extraArgs,
  ];

  const proc = Bun.spawn({
    cmd: testCmd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ALLBREW_TEST_LOG: logPath ?? process.env.ALLBREW_TEST_LOG },
  });

  const stdoutP = teeStream(proc.stdout, 1, logFd);
  const stderrP = teeStream(proc.stderr, 2, logFd);
  await Promise.all([stdoutP, stderrP]);
  const exitCode = await proc.exited;

  if (logFd >= 0) closeSync(logFd);

  if (snapshot) {
    try {
      await captureLocalReadout(snapshot, logPath ?? undefined);
      console.log(`[e2e-tap runner] Readout saved to ${snapshot.runDir}/readout.txt`);
    } catch (err: any) {
      console.error(`[e2e-tap runner] Readout capture failed: ${err?.message || err}`);
    }
    try {
      await restoreLocalState(snapshot);
      console.log(`[e2e-tap runner] Restored ~/.config/allbrew from ${snapshot.runDir}`);
    } catch (err: any) {
      console.error(`[e2e-tap runner] Restore failed: ${err?.message || err}`);
      console.error(`  Manual recovery: scripts/test-local-cleanup.sh --restore`);
    }
  }

  return exitCode;
}

const code = await main();
process.exit(code);
