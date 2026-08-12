import { it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { lifecycleDescribe, shouldRunLifecycleTests } from "../helpers/lifecycle-gate.ts";
import { assertUninstallResiduals } from "../helpers/uninstall-residuals.ts";

/**
 * Tier A — A1: Lume service personas.
 *
 * Exercises full `brew services` lifecycle for npm, pip, and go packages
 * inside the Lume VM with exclusive `/opt/homebrew`. Each persona:
 *   1. Generates a formula with `--service`
 *   2. `brew install --formula <file>`
 *   3. `brew services start`
 *   4. TCP readiness probe on the service's port
 *   5. `brew services list` shows the service running
 *   6. `brew services stop`
 *   7. `brew uninstall` and residual checks (no LaunchAgent, bin gone)
 *
 * Gated by lifecycle-gate: runs on Lume (TH_IN_VM=1 or ALLBREW_LUME=1) or with
 * explicit local opt-in (ALLBREW_LIFECYCLE_LOCAL=1).
 */

const TIMEOUT_MS = 900_000; // 15 min per command; pypiserver has many deps to fetch/build
const TEST_TIMEOUT_MS = 1_200_000; // 20 min per persona

type ServicePersona = {
  id: string;
  name: string;
  url: string;
  type: string;
  package?: string;
  goModule?: string;
  bin: string;
  port: number;
  serviceCommand?: string;
};

const PERSONAS: ServicePersona[] = [
  {
    id: "npm-maildev",
    name: "maildev",
    url: "https://www.npmjs.com/package/maildev",
    type: "npm-package",
    package: "maildev",
    bin: "maildev",
    port: 1080,
    serviceCommand: "maildev",
  },
  {
    id: "pip-pypiserver",
    name: "pypiserver",
    url: "https://pypi.org/project/pypiserver/",
    type: "pip-package",
    package: "pypiserver",
    bin: "pypi-server",
    port: 8080,
    // Use the opt-prefixed bin path because the formula name (pypiserver) does
    // not match the command name (pypi-server); Homebrew's service generator
    // emits the literal string in the plist, and launchd needs an absolute path
    // to the Cellar binary. The /opt/homebrew/bin symlink is not always usable.
    serviceCommand: "/opt/homebrew/opt/pypiserver/bin/pypi-server run -p 8080 -i 127.0.0.1 /tmp",
  },
  {
    id: "go-gotty",
    name: "gotty",
    url: "https://github.com/sorenisanerd/gotty",
    type: "go-package",
    goModule: "github.com/sorenisanerd/gotty",
    bin: "gotty",
    port: 8081,
    serviceCommand: "gotty --port 8081 --address 127.0.0.1 /bin/sh",
  },
];

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

function waitForPort(port: number, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const result = spawnSync("nc", ["-z", "-G", "1", "127.0.0.1", String(port)], {
        encoding: "utf-8",
        timeout: 5_000,
      });
      if (result.status === 0) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`TCP probe failed after ${timeoutMs}ms`));
        return;
      }
      setTimeout(tryConnect, 1_000);
    };
    tryConnect();
  });
}

function uniqueName(base: string): string {
  return base;
}

function createTempTap(): string {
  const dir = mkdtempSync(join(tmpdir(), "allbrew-lume-tap-"));
  mkdirSync(join(dir, "Formula"), { recursive: true });
  return dir;
}

function removeTap(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function isInstalled(name: string): boolean {
  const list = brew(["list", "--full-name", "-1"]);
  if (list.code !== 0) return false;
  return list.stdout.split("\n").some((line) => {
    const trimmed = line.trim();
    return trimmed === name || trimmed.endsWith(`/${name}`);
  });
}

function cleanupStaleArtifacts(persona: ServicePersona, formulaName: string): void {
  // Remove leftover launchd plists from earlier (failed) runs so the residual
  // assertion at the end is not polluted by unrelated formula names.
  const launchAgentsDir = join(homedir(), "Library/LaunchAgents");
  try {
    if (existsSync(launchAgentsDir)) {
      for (const file of readdirSync(launchAgentsDir)) {
        if (file.includes(`homebrew.mxcl.${persona.name}`) && !file.includes(formulaName)) {
          rmSync(join(launchAgentsDir, file), { force: true });
        }
      }
    }
  } catch {
    // best effort
  }

  // Uninstall any existing package with the same base name so install doesn't
  // fail on a duplicate or stale keg.
  try {
    const list = brew(["list", "--full-name", "-1"]);
    if (list.code === 0) {
      for (const line of list.stdout.split("\n")) {
        const trimmed = line.trim();
        const base = trimmed.split("/").pop() || trimmed;
        if (base.startsWith(persona.name)) {
          brew(["services", "stop", trimmed, "2>/dev/null"]);
          brew(["uninstall", "--force", trimmed, "2>/dev/null"]);
        }
      }
    }
  } catch {
    // best effort
  }
}

async function runServicePersona(persona: ServicePersona) {
  const formulaName = uniqueName(persona.name);
  cleanupStaleArtifacts(persona, formulaName);

  const tapDir = createTempTap();
  const formulaFile = join(tapDir, "Formula", `${formulaName}.rb`);

  try {
    // 1. Generate formula with service block. allbrew also attempts a brew install;
    // we ignore that result and install from the file path ourselves so we can
    // capture output and fail the test on install errors.
    const genArgs = [
      persona.url,
      "--name", formulaName,
      "--type", persona.type,
      "--desc", `Lume service persona: ${persona.id}`,
      "--service",
      "--tap", tapDir,
    ];
    if (persona.package) {
      genArgs.push("--package", persona.package);
    }
    if (persona.goModule) {
      genArgs.push("--go-module", persona.goModule);
    }
    if (persona.serviceCommand) {
      genArgs.push("--service-command", persona.serviceCommand);
    }
    if (persona.bin !== formulaName) {
      genArgs.push("--bin-name", persona.bin);
    }
    const gen = allbrew(genArgs);
    if (gen.code !== 0) {
      console.log(`[${persona.id}] generate stdout:`, gen.stdout);
      console.log(`[${persona.id}] generate stderr:`, gen.stderr);
    }
    expect(gen.code).toBe(0);
    expect(existsSync(formulaFile)).toBe(true);

    // 2. Install from file path if allbrew's auto-install didn't already do it.
    if (!isInstalled(formulaName)) {
      const install = brew(["install", "--formula", formulaFile]);
      if (install.code !== 0) {
        console.log(`[${persona.id}] install stdout:`, install.stdout);
        console.log(`[${persona.id}] install stderr:`, install.stderr);
      }
      expect(install.code).toBe(0);
    }
    expect(isInstalled(formulaName)).toBe(true);

    // 3. Start service.
    const start = brew(["services", "start", formulaName]);
    if (start.code !== 0) {
      console.log(`[${persona.id}] services start stdout:`, start.stdout);
      console.log(`[${persona.id}] services start stderr:`, start.stderr);
    }
    expect(start.code).toBe(0);

    // 4. TCP readiness probe.
    try {
      await waitForPort(persona.port);
    } catch (err) {
      const list = brew(["services", "list"]);
      console.log(`[${persona.id}] services list (on probe fail):`, list.stdout, list.stderr);
      throw err;
    }

    // 5. brew services list shows it as started.
    const list = brew(["services", "list"]);
    expect(list.code).toBe(0);
    expect(list.stdout).toContain(formulaName);
    expect(list.stdout).toContain("started");

    // 6. Stop service.
    const stop = brew(["services", "stop", formulaName]);
    if (stop.code !== 0) {
      console.log(`[${persona.id}] services stop stdout:`, stop.stdout);
      console.log(`[${persona.id}] services stop stderr:`, stop.stderr);
    }
    expect(stop.code).toBe(0);

    // 7. Uninstall.
    const uninstall = brew(["uninstall", formulaName]);
    if (uninstall.code !== 0) {
      console.log(`[${persona.id}] uninstall stdout:`, uninstall.stdout);
      console.log(`[${persona.id}] uninstall stderr:`, uninstall.stderr);
    }
    expect(uninstall.code).toBe(0);

    // 8. Residual checks.
    await assertUninstallResiduals({ name: formulaName, kind: "formula", binName: persona.bin });

    // 9. No LaunchAgent remains for this formula.
    const agents = run(["ls", join(homedir(), "Library/LaunchAgents")]);
    expect(agents.stdout).not.toContain(`homebrew.mxcl.${formulaName}.plist`);
  } finally {
    // Best-effort cleanup even on assertion failure.
    try {
      brew(["services", "stop", formulaName, "2>/dev/null"]).stdout;
    } catch {}
    try {
      brew(["uninstall", formulaName, "2>/dev/null"]).stdout;
    } catch {}
    removeTap(tapDir);
  }
}

lifecycleDescribe("A1 Lume service personas", () => {
  it.each(PERSONAS)(
    "$id: full brew services lifecycle + TCP probe + residual checks",
    async (persona) => {
      await runServicePersona(persona);
    },
    TEST_TIMEOUT_MS,
  );
});

it("lifecycle gate: service personas skip outside Lume", () => {
  if (shouldRunLifecycleTests()) {
    expect(process.env.TH_IN_VM === "1" || process.env.ALLBREW_LUME === "1" || process.env.ALLBREW_LIFECYCLE_LOCAL === "1").toBe(true);
  } else {
    expect(shouldRunLifecycleTests()).toBe(false);
  }
});
