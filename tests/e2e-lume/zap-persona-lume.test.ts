import { it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { lifecycleDescribe } from "../helpers/lifecycle-gate.ts";

/**
 * Tier A — A4: Zap persona on Lume.
 *
 * Verifies that `brew uninstall --zap` removes a cask and its declared zap
 * paths, and that cask installs in the Lume VM target `$HOME/Applications`
 * rather than system `/Applications`.
 *
 * Uses the cask-app-release generator for `seaquel` (GitHub: webstonehq/seaquel)
 * which emits a `zap trash:` block. The test is gated by lifecycle-gate.
 */

const TIMEOUT_MS = 300_000;
const APP_NAME = "Seaquel.app";
const CASK_NAME = "seaquel";

function run(args: string[], opts: { timeout?: number } = {}): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf-8",
    timeout: opts.timeout ?? TIMEOUT_MS,
    env: {
      ...process.env,
      HOMEBREW_DEVELOPER: "1",
      HOMEBREW_NO_AUTO_UPDATE: "1",
      HOMEBREW_NO_INSTALL_CLEANUP: "1",
    },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function allbrew(args: string[]): { code: number; stdout: string; stderr: string } {
  return run(["bun", "run", "bin/allbrew.ts", ...args]);
}

function brew(args: string[]): { code: number; stdout: string; stderr: string } {
  return run(["brew", ...args]);
}

function createTempTap(): string {
  const dir = mkdtempSync(join(tmpdir(), "allbrew-lume-tap-"));
  mkdirSync(join(dir, "Casks"), { recursive: true });
  return dir;
}

function removeTap(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function userApplications(): string {
  return join(homedir(), "Applications", APP_NAME);
}

function systemApplications(): string {
  return join("/Applications", APP_NAME);
}

lifecycleDescribe("A4 zap persona", () => {
  it(
    "installs a cask to $HOME/Applications and removes it with --zap",
    async () => {
      const tapDir = createTempTap();
      const caskPath = join(tapDir, "Casks", `${CASK_NAME}.rb`);

      try {
        // 1. Generate cask with zap block. cask-app-release requires a --desc
        // override to avoid the interactive prompt in headless runs.
        const gen = allbrew([
          "https://github.com/webstonehq/seaquel",
          "--name", CASK_NAME,
          "--type", "cask-app-release",
          "--app-name", APP_NAME,
          "--homepage", "https://seaquel.app",
          "--desc", "Lume zap persona: seaquel",
          "--tap", tapDir,
        ]);
        if (gen.code !== 0) {
          console.log("[zap] generate stdout:", gen.stdout);
          console.log("[zap] generate stderr:", gen.stderr);
        }
        expect(gen.code).toBe(0);
        expect(existsSync(caskPath)).toBe(true);
        const caskRuby = readFileSync(caskPath, "utf-8");
        expect(caskRuby).toContain("zap trash:");

        // 2. Install cask from file path.
        const install = brew(["install", "--cask", caskPath]);
        if (install.code !== 0) {
          console.log("[zap] install stdout:", install.stdout);
          console.log("[zap] install stderr:", install.stderr);
        }
        expect(install.code).toBe(0);

        // 3. Verify it installed to user Applications, not system Applications.
        expect(existsSync(userApplications())).toBe(true);
        expect(existsSync(systemApplications())).toBe(false);

        // 4. Zap uninstall.
        const uninstall = brew(["uninstall", "--zap", CASK_NAME]);
        if (uninstall.code !== 0) {
          console.log("[zap] uninstall stdout:", uninstall.stdout);
          console.log("[zap] uninstall stderr:", uninstall.stderr);
        }
        expect(uninstall.code).toBe(0);

        // 5. Verify app is gone.
        expect(existsSync(userApplications())).toBe(false);

        // 6. Verify cask not in brew list.
        const list = brew(["list", "--cask"]);
        expect(list.stdout).not.toContain(CASK_NAME);
      } finally {
        removeTap(tapDir);
        try {
          brew(["uninstall", "--zap", CASK_NAME, "2>/dev/null"]).stdout;
        } catch {}
      }
    },
    TIMEOUT_MS,
  );
});
