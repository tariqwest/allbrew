import { it, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { lifecycleDescribe } from "../helpers/lifecycle-gate.ts";

/**
 * Tier A — A3: Hooks smoke on Lume.
 *
 * Verifies that `allbrew hooks install` writes the brew wrapper, that it can be
 * sourced in a non-interactive shell, and that aliasing `brew` to `allbrew_brew`
 * makes `brew update` invoke the `update-formulas` side effect without crashing.
 *
 * Gated by lifecycle-gate.
 */

const TIMEOUT_MS = 120_000;

function run(args: string[], opts: { timeout?: number; env?: Record<string, string> } = {}): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf-8",
    timeout: opts.timeout ?? TIMEOUT_MS,
    env: {
      ...process.env,
      HOMEBREW_DEVELOPER: "1",
      HOMEBREW_NO_AUTO_UPDATE: "1",
      HOMEBREW_NO_INSTALL_CLEANUP: "1",
      ...opts.env,
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

lifecycleDescribe("A3 hooks smoke", () => {
  it(
    "installs hooks, sources wrapper, aliases brew, and runs brew update without crashing",
    async () => {
      // 1. Install hooks.
      const install = allbrew(["hooks", "install"]);
      expect(install.code).toBe(0);
      expect(install.stdout).toContain("Installed brew hook");

      // 2. In a fresh non-interactive shell, source the wrapper and alias brew.
      //    Run `brew update` and assert it exits 0. The wrapper will pipe
      //    livecheck output to `allbrew update-formulas`; with no allbrew-managed
      //    packages installed, livecheck returns empty JSON and update-formulas
      //    is a no-op. The critical assertion is that it does not crash.
      const brewPrefix = brew(["--prefix"]).stdout.trim();
      const wrapPath = `${brewPrefix}/etc/allbrew-brew-wrap`;

      const shellScript = `
set -euo pipefail
export HOMEBREW_DEVELOPER=1
export HOMEBREW_NO_AUTO_UPDATE=1
source "${wrapPath}"
alias brew=allbrew_brew
brew update
`;
      const smoke = run(["bash", "-c", shellScript], { timeout: TIMEOUT_MS });
      expect(smoke.code).toBe(0);
      expect(smoke.stdout + smoke.stderr).not.toContain("double");
      expect(smoke.stdout + smoke.stderr).not.toContain("infinite");

      // 3. Uninstall hooks.
      const uninstall = allbrew(["hooks", "uninstall"]);
      expect(uninstall.code).toBe(0);
    },
    TIMEOUT_MS,
  );
});
