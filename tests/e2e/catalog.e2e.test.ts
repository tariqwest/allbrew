import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import catalog from "./catalog.json";
import {
  snapshotLocalState,
  restoreLocalState,
  captureLocalReadout,
  type LocalStateSnapshot,
} from "../helpers/local-state.ts";
import {
  stopRegisteredServices,
  killOrphanedFixtures,
  cleanupCurrentProcessRegistry,
  purgeOrphanedRegistries,
} from "../helpers/test-cleanup-registry.ts";
import { assertUninstallResiduals } from "../helpers/uninstall-residuals.ts";
import {
  E2EProgress,
  runPhase,
  type E2EPhase,
} from "./helpers/progress.ts";

/**
 * Tier 3 — E2E: generate formula → brew install → verify binary runs.
 *
 * Requirements:
 *   - macOS with Homebrew installed
 *   - allbrew available (bun link or bun run bin/allbrew.ts)
 *   - Set E2E=1 to enable: `E2E=1 bun run test:e2e`
 *
 * Tap mode (controlled by DRY_RUN env var):
 *   - DRY_RUN unset or DRY_RUN=true  → local temp tap (default, no remote push)
 *   - DRY_RUN=false                  → use the tap path from ~/.config/allbrew/config.json
 *                                      allbrew's normal push-to-remote behaviour applies
 *
 * Each catalog entry:
 *   1. Calls `allbrew <url> [args] [--tap <tap>]` to generate the formula/cask
 *   2. Runs `brew install --formula|--cask <file>` to install
 *   3. Runs `verifyCommand` and asserts exit code 0
 *   4. Runs `brew uninstall` to clean up
 *
 * Progress: emits structured `[E2E] [i/N] …` lines per entry/phase and writes
 * incremental `e2e-results.json` when ALLBREW_TEST_LOG / ALLBREW_E2E_RESULTS is set.
 */

const E2E = !!process.env.E2E;
// DRY_RUN defaults to true; set DRY_RUN=false to use the real configured tap
const DRY_RUN = process.env.DRY_RUN !== "false";
const TIMEOUT_MS = 300_000; // 5 min per entry
const VERBOSE = process.env.E2E_VERBOSE === "1";

const ACTIVE_ENTRIES = catalog.filter((e) => !e.skip);
const SKIPPED_COUNT = catalog.length - ACTIVE_ENTRIES.length;

/** Read tapPath from ~/.config/allbrew/config.json, or null if not configured. */
function readConfiguredTapPath(): string | null {
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), ".config", "allbrew", "config.json"), "utf-8"),
    );
    return cfg.tapPath ?? null;
  } catch {
    return null;
  }
}

function isCaskGenerator(generator: string): boolean {
  return (
    generator === "cask-app" ||
    generator === "cask-app-release" ||
    generator === "cask-app-mas" ||
    generator === "cask-app-setapp"
  );
}

function runCommand(
  args: string[],
  opts: { cwd?: string } = {},
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf-8",
    cwd: opts.cwd,
    timeout: TIMEOUT_MS,
    env: {
      ...process.env,
      HOMEBREW_DEVELOPER: "1",
      HOMEBREW_NO_AUTO_UPDATE: "1",
    },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function brewAvailable(): boolean {
  try {
    execSync("which brew", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function allbrewAvailable(): boolean {
  try {
    execSync("which allbrew", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function phaseOf(err: unknown): E2EPhase | undefined {
  if (err && typeof err === "object" && "e2ePhase" in err) {
    return (err as { e2ePhase?: E2EPhase }).e2ePhase;
  }
  return undefined;
}

describe.skipIf(!E2E)("E2E catalog tests", () => {
  let tapDir = "";
  let isTmpTap = false;
  let stateSnapshot: LocalStateSnapshot | null = null;
  let progress: E2EProgress | null = null;

  beforeAll(async () => {
    if (!brewAvailable()) throw new Error("brew is not installed or not in PATH");

    progress = new E2EProgress({
      suite: "catalog",
      active: ACTIVE_ENTRIES.length,
      skipped: SKIPPED_COUNT,
    });

    // Snapshot ~/.config/allbrew/ so we can restore after the suite.
    stateSnapshot = await snapshotLocalState();
    console.log(`[E2E] State snapshot: ${stateSnapshot.runDir}`);

    if (DRY_RUN) {
      tapDir = mkdtempSync(join(tmpdir(), "allbrew-e2e-tap-"));
      mkdirSync(join(tapDir, "Formula"), { recursive: true });
      mkdirSync(join(tapDir, "Casks"), { recursive: true });
      isTmpTap = true;
      console.log(`[E2E] DRY_RUN mode — temp tap: ${tapDir}`);
    } else {
      const configured = readConfiguredTapPath();
      if (!configured) {
        throw new Error(
          "DRY_RUN=false but no tap path found in ~/.config/allbrew/config.json. Run: allbrew init",
        );
      }
      tapDir = configured;
      isTmpTap = false;
      console.log(`[E2E] LIVE mode — using configured tap: ${tapDir}`);
    }
  });

  afterAll(async () => {
    // Uninstall any catalog apps that are still installed (e.g. a test
    // failed after install but before its uninstall step).
    for (const entry of catalog) {
      if (entry.skip) continue;
      try {
        const cask = isCaskGenerator(entry.generator);
        const flag = cask ? "--cask" : "--formula";
        spawnSync("brew", ["uninstall", flag, entry.name], {
          encoding: "utf-8",
          timeout: 60_000,
          stdio: "ignore",
        });
      } catch {}
    }

    // Only clean up the temp dir; never delete the user's real tap
    if (isTmpTap && tapDir && existsSync(tapDir)) {
      rmSync(tapDir, { recursive: true, force: true });
    }

    // Capture readout BEFORE restore so it reflects the post-test state.
    if (stateSnapshot) {
      // T0.2: stop any service agents started during the run and kill
      // orphaned fixture processes before capturing the readout.
      try {
        const stopped = await stopRegisteredServices();
        if (stopped.length > 0) {
          console.log(`[E2E] Stopped ${stopped.length} service(s): ${stopped.join(", ")}`);
        }
      } catch (err: any) {
        console.error(`[E2E] stopRegisteredServices failed: ${err?.message || err}`);
      }
      try {
        const killed = await killOrphanedFixtures();
        if (killed.length > 0) {
          console.log(
            `[E2E] Killed ${killed.length} orphaned fixture process(es): ${killed.join(", ")}`,
          );
        }
      } catch (err: any) {
        console.error(`[E2E] killOrphanedFixtures failed: ${err?.message || err}`);
      }
      const testLog = process.env.ALLBREW_TEST_LOG || undefined;
      try {
        await captureLocalReadout(stateSnapshot, testLog);
        console.log(`[E2E] Readout saved to ${stateSnapshot.runDir}/readout.txt`);
      } catch (err: any) {
        console.error(`[E2E] Readout capture failed: ${err?.message || err}`);
      }
    }

    // Restore ~/.config/allbrew/ from the snapshot.
    if (stateSnapshot) {
      try {
        await restoreLocalState(stateSnapshot);
        console.log(`[E2E] Restored state from ${stateSnapshot.runDir}`);
      } catch (err: any) {
        console.error(`[E2E] State restore failed: ${err?.message || err}`);
        console.error(`  Manual recovery: scripts/test-local-cleanup.sh --restore`);
      }
    }

    // T0.2: remove this process's registry file and purge orphaned ones.
    try {
      await cleanupCurrentProcessRegistry();
      await purgeOrphanedRegistries();
    } catch {}

    progress?.finish();
  });

  let entryIndex = 0;
  for (const entry of ACTIVE_ENTRIES) {
    entryIndex += 1;
    const index = entryIndex;
    const cask = isCaskGenerator(entry.generator);
    const formulaFlag = cask ? "--cask" : "--formula";

    it(
      `${entry.name} (${entry.generator}): generate → install → verify`,
      async () => {
        const p = progress!;
        const startedAtMs = Date.now();
        p.begin(index, entry.name, entry.generator);

        try {
          const installTarget = cask
            ? join(tapDir, "Casks", `${entry.name}.rb`)
            : join(tapDir, "Formula", `${entry.name}.rb`);

          // Step 1: Generate
          // DRY_RUN=true: pass --tap explicitly so allbrew writes to the temp dir
          // DRY_RUN=false: omit --tap so allbrew uses its configured tap (and may push)
          const tapArgs = DRY_RUN ? ["--tap", tapDir] : [];
          const typeArgs = entry.generator ? ["--type", entry.generator] : [];
          const descArgs = entry.notes ? ["--desc", entry.notes] : [];
          const baseArgs = [
            entry.url,
            "--name",
            entry.name,
            ...typeArgs,
            ...descArgs,
            "--no-service",
            ...tapArgs,
            ...entry.allbrewArgs,
          ];
          const allbrewCmd = allbrewAvailable()
            ? ["allbrew", ...baseArgs]
            : ["bun", "run", "bin/allbrew.ts", ...baseArgs];

          await runPhase(p, index, entry.name, "generate", () => {
            const gen = runCommand(allbrewCmd);
            if (VERBOSE || gen.code !== 0) {
              console.log(`[E2E] generate cmd: ${allbrewCmd.join(" ")}`);
              console.log(`[E2E] generate code=${gen.code}`);
              if (gen.stdout) console.log(`[E2E] generate stdout: ${gen.stdout.slice(0, 500)}`);
              if (gen.stderr) console.log(`[E2E] generate stderr: ${gen.stderr.slice(0, 500)}`);
            }
            expect(gen.code, `allbrew generation failed:\n${gen.stderr}`).toBe(0);
            expect(
              existsSync(installTarget),
              `Formula file not found: ${installTarget}`,
            ).toBe(true);
          });

          // Step 2: Install
          await runPhase(p, index, entry.name, "install", () => {
            const install = runCommand(["brew", "install", formulaFlag, installTarget]);
            expect(
              install.code,
              `brew install failed:\n${install.stdout}\n${install.stderr}`,
            ).toBe(0);
          });

          // Step 3: Verify binary/app runs
          if (entry.verifyCommand.length > 0) {
            await runPhase(p, index, entry.name, "verify", () => {
              const verify = runCommand(entry.verifyCommand);
              expect(
                verify.code,
                `verify command ${entry.verifyCommand.join(" ")} failed:\n${verify.stderr}`,
              ).toBe(0);
            });
          }

          // Step 4: Uninstall
          await runPhase(p, index, entry.name, "uninstall", () => {
            const uninstall = runCommand(["brew", "uninstall", formulaFlag, entry.name]);
            expect(
              uninstall.code,
              `brew uninstall failed:\n${uninstall.stderr}`,
            ).toBe(0);
          });

          // A2: assert uninstall residuals (manifest persists per product decision)
          await runPhase(p, index, entry.name, "residuals", async () => {
            const residuals = await assertUninstallResiduals({
              name: entry.name,
              kind: cask ? "cask" : "formula",
              appName: cask ? entry.name : undefined,
            });
            expect(
              residuals.passed,
              `residual checks failed:\n${residuals.failures.join("\n")}`,
            ).toBe(true);
          });

          p.end({
            name: entry.name,
            generator: entry.generator,
            index,
            total: ACTIVE_ENTRIES.length,
            status: "pass",
            durationMs: Date.now() - startedAtMs,
            startedAtMs,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          p.end({
            name: entry.name,
            generator: entry.generator,
            index,
            total: ACTIVE_ENTRIES.length,
            status: "fail",
            durationMs: Date.now() - startedAtMs,
            failedPhase: phaseOf(err),
            error: message,
            startedAtMs,
          });
          throw err;
        }
      },
      TIMEOUT_MS,
    );
  }
});

describe.skipIf(E2E)("E2E (not enabled)", () => {
  it("skipped — set E2E=1 to run E2E tests", () => {
    console.log("Run: E2E=1 bun run test:e2e");
    expect(true).toBe(true);
  });
});
