import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import heavyCatalog from "./catalog-heavy.json";
import {
  snapshotLocalState,
  restoreLocalState,
  captureLocalReadout,
  type LocalStateSnapshot,
} from "../helpers/local-state.ts";
import {
  cleanupCurrentProcessRegistry,
  purgeOrphanedRegistries,
} from "../helpers/test-cleanup-registry.ts";
import { assertUninstallResiduals } from "../helpers/uninstall-residuals.ts";

/**
 * B2: Heavy real packages — one per major ecosystem.
 *
 * These tests install real, heavy packages to catch packaging failures
 * that small fixtures hide (native wheels, postinstall scripts, deep dep
 * trees, real GitHub release asset naming).
 *
 * Gated behind E2E_HEAVY=1 (separate from E2E=1 to avoid slow runs).
 * Run: E2E_HEAVY=1 bun test tests/e2e/heavy.e2e.test.ts --timeout 600000
 */

const E2E_HEAVY = !!process.env.E2E_HEAVY;
const DRY_RUN = process.env.DRY_RUN !== "false";
const TIMEOUT_MS = 600_000; // 10 min per entry

interface CatalogEntry {
  name: string;
  url: string;
  generator: string;
  allbrewArgs: string[];
  expectedBin: string;
  verifyCommand: string[];
  skip: boolean;
  notes: string;
}

let snapshot: LocalStateSnapshot | null = null;
let tapDir: string;

beforeAll(() => {
  if (!E2E_HEAVY) return;
  tapDir = mkdtempSync(join(tmpdir(), "allbrew-heavy-tap-"));
  mkdirSync(join(tapDir, "Formula"), { recursive: true });
  mkdirSync(join(tapDir, "Casks"), { recursive: true });
  snapshot = snapshotLocalState();
});

afterAll(() => {
  if (!E2E_HEAVY) return;
  try {
    captureLocalReadout(join("tests", "e2e-runs", "local", "latest"), "B2 heavy packages");
  } catch {}
  if (snapshot) restoreLocalState(snapshot);
  cleanupCurrentProcessRegistry();
  purgeOrphanedRegistries();
  if (tapDir) rmSync(tapDir, { recursive: true, force: true });
});

function runCommand(cmd: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(cmd[0], cmd.slice(1), {
    encoding: "utf-8",
    timeout: TIMEOUT_MS,
    env: { ...process.env },
  });
  return {
    code: result.status ?? -1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

describe.skipIf(!E2E_HEAVY)("B2: heavy real packages (one per ecosystem)", () => {
  for (const entry of heavyCatalog as CatalogEntry[]) {
    if (entry.skip) continue;

    const cask = entry.generator.startsWith("cask");
    const formulaFlag = cask ? "--cask" : "--formula";

    it(
      `${entry.name} (${entry.generator}): generate → install → verify → uninstall`,
      async () => {
        const formulaPath = cask
          ? join(tapDir, "Casks", `${entry.name}.rb`)
          : join(tapDir, "Formula", `${entry.name}.rb`);

        // Step 1: Generate
        const tapArgs = DRY_RUN ? ["--tap", tapDir] : [];
        const typeArgs = entry.generator ? ["--type", entry.generator] : [];
        const baseArgs = [
          entry.url,
          "--name",
          entry.name,
          ...typeArgs,
          ...tapArgs,
          ...entry.allbrewArgs,
          "--no-service",
        ];
        const gen = runCommand(["bun", "run", "bin/allbrew.ts", ...baseArgs]);
        expect(gen.code, `allbrew generate failed:\n${gen.stderr}`).toBe(0);
        expect(existsSync(formulaPath), `formula not written to ${formulaPath}`).toBe(true);

        // Step 2: Install
        const install = runCommand(["brew", "install", formulaFlag, entry.name]);
        expect(install.code, `brew install failed:\n${install.stderr}`).toBe(0);

        // Step 3: Verify
        if (entry.verifyCommand.length > 0) {
          const verify = runCommand(entry.verifyCommand);
          expect(
            verify.code,
            `verify command ${entry.verifyCommand.join(" ")} failed:\n${verify.stderr}`,
          ).toBe(0);
        }

        // Step 4: Uninstall
        const uninstall = runCommand(["brew", "uninstall", formulaFlag, entry.name]);
        expect(uninstall.code, `brew uninstall failed:\n${uninstall.stderr}`).toBe(0);

        // Step 5: Residual checks (A2)
        const residuals = await assertUninstallResiduals({
          name: entry.name,
          kind: cask ? "cask" : "formula",
          appName: cask ? entry.name : undefined,
        });
        expect(residuals.passed, `residual checks failed:\n${residuals.failures.join("\n")}`).toBe(true);
      },
      TIMEOUT_MS,
    );
  }
});

describe.skipIf(E2E_HEAVY)("B2: heavy packages (not enabled)", () => {
  it("skipped — set E2E_HEAVY=1 to run", () => {
    console.log("Run: E2E_HEAVY=1 bun test tests/e2e/heavy.e2e.test.ts --timeout 600000");
    expect(true).toBe(true);
  });
});
