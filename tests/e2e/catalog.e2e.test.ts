import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { readFileSync } from "node:fs";
import catalog from "./catalog.json";

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
 */

const E2E = !!process.env.E2E;
// DRY_RUN defaults to true; set DRY_RUN=false to use the real configured tap
const DRY_RUN = process.env.DRY_RUN !== "false";
const TIMEOUT_MS = 300_000; // 5 min per entry

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
  return generator === "cask-app" || generator === "github-release-cask" || generator === "mas-app";
}

function runCommand(args: string[], opts: { cwd?: string } = {}): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf-8",
    cwd: opts.cwd,
    timeout: TIMEOUT_MS,
    env: { ...process.env },
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

describe.skipIf(!E2E)("E2E catalog tests", () => {
  let tapDir = "";
  let isTmpTap = false;

  beforeAll(() => {
    if (!brewAvailable()) throw new Error("brew is not installed or not in PATH");

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

  afterAll(() => {
    // Only clean up the temp dir; never delete the user's real tap
    if (isTmpTap && tapDir && existsSync(tapDir)) {
      rmSync(tapDir, { recursive: true, force: true });
    }
  });

  for (const entry of catalog) {
    if (entry.skip) continue;

    const cask = isCaskGenerator(entry.generator);
    const formulaFlag = cask ? "--cask" : "--formula";

    it(
      `${entry.name} (${entry.generator}): generate → install → verify`,
      async () => {
        const installTarget = cask
          ? join(tapDir, "Casks", `${entry.name}.rb`)
          : join(tapDir, "Formula", `${entry.name}.rb`);

        // Step 1: Generate
        // DRY_RUN=true: pass --tap explicitly so allbrew writes to the temp dir
        // DRY_RUN=false: omit --tap so allbrew uses its configured tap (and may push)
        const tapArgs = DRY_RUN ? ["--tap", tapDir] : [];
        const baseArgs = [entry.url, "--name", entry.name, ...tapArgs, ...entry.allbrewArgs];
        const allbrewCmd = allbrewAvailable()
          ? ["allbrew", ...baseArgs]
          : ["bun", "run", "bin/allbrew.ts", ...baseArgs];

        const gen = runCommand(allbrewCmd);
        expect(gen.code, `allbrew generation failed:\n${gen.stderr}`).toBe(0);
        expect(
          existsSync(installTarget),
          `Formula file not found: ${installTarget}`,
        ).toBe(true);

        // Step 2: Install
        const install = runCommand([
          "brew", "install", formulaFlag, installTarget,
        ]);
        expect(
          install.code,
          `brew install failed:\n${install.stdout}\n${install.stderr}`,
        ).toBe(0);

        // Step 3: Verify binary/app runs
        if (entry.verifyCommand.length > 0) {
          const verify = runCommand(entry.verifyCommand);
          expect(
            verify.code,
            `verify command ${entry.verifyCommand.join(" ")} failed:\n${verify.stderr}`,
          ).toBe(0);
        }

        // Step 4: Uninstall
        const uninstall = runCommand([
          "brew", "uninstall", formulaFlag, entry.name,
        ]);
        expect(
          uninstall.code,
          `brew uninstall failed:\n${uninstall.stderr}`,
        ).toBe(0);
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
