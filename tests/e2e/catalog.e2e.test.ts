import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import catalog from "./catalog.json";

/**
 * Tier 3 — E2E: generate formula → brew install → verify binary runs.
 *
 * Requirements:
 *   - macOS with Homebrew installed
 *   - allbrew available (bun link or bun run bin/allbrew.ts)
 *   - Set E2E=1 to enable: `E2E=1 bun run test:e2e`
 *
 * Each catalog entry:
 *   1. Calls `allbrew <url> [args] --tap <tmpTap>` to generate the formula/cask
 *   2. Runs `brew install --formula|--cask <tmpTap>/...` to install
 *   3. Runs `verifyCommand` and asserts exit code 0
 *   4. Runs `brew uninstall` to clean up
 */

const E2E = !!process.env.E2E;
const TIMEOUT_MS = 300_000; // 5 min per entry

function resolveTap(tapPath: string, name: string, isCask: boolean): string {
  const subdir = isCask ? "Casks" : "Formula";
  return join(tapPath, subdir, `${name}.rb`);
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
  let tmpTap = "";

  beforeAll(() => {
    if (!brewAvailable()) throw new Error("brew is not installed or not in PATH");
    tmpTap = mkdtempSync(join(tmpdir(), "allbrew-e2e-tap-"));
  });

  afterAll(() => {
    if (tmpTap && existsSync(tmpTap)) {
      rmSync(tmpTap, { recursive: true, force: true });
    }
  });

  for (const entry of catalog) {
    if (entry.skip) continue;

    const cask = isCaskGenerator(entry.generator);
    const formulaFlag = cask ? "--cask" : "--formula";
    const installTarget = cask
      ? `${tmpTap}/Casks/${entry.name}.rb`
      : `${tmpTap}/Formula/${entry.name}.rb`;

    it(
      `${entry.name} (${entry.generator}): generate → install → verify`,
      async () => {
        // Step 1: Generate
        const allbrewCmd = allbrewAvailable()
          ? ["allbrew", entry.url, "--name", entry.name, "--tap", tmpTap, ...entry.allbrewArgs]
          : ["bun", "run", "bin/allbrew.ts", entry.url, "--name", entry.name, "--tap", tmpTap, ...entry.allbrewArgs];

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
