/**
 * Tier 0 (T0.2) — Test cleanup registry.
 *
 * Tracks fixture process PIDs and Homebrew service agents started during a test
 * run so they can be cleaned up even if the test process is killed (Ctrl-C /
 * crash) and Vitest teardown does not run. Each test process writes a JSON
 * registry file under `${tmpdir}/allbrew-test-registries/registry-<pid>.json`,
 * which `scripts/test-local-cleanup.sh --force` reads to kill orphans and stop
 * services.
 *
 * Usage in test helpers:
 *   import { registerFixtureProcess, unregisterFixtureProcess } from "../helpers/test-cleanup-registry.ts";
 *   registerFixtureProcess({ pid: child.pid!, port, label: "fixture-server" });
 *   // on clean stop:
 *   unregisterFixtureProcess(child.pid!);
 *   // in suite teardown:
 *   await stopRegisteredServices();
 *   await cleanupCurrentProcessRegistry();
 */
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DEFAULT_REGISTRY_DIR = join(tmpdir(), "allbrew-test-registries");
const TEST_PID = process.pid;

// Test-injection seam: tests override this to use an isolated tmp directory so
// they do not pollute the real registry. Production code leaves it as the default.
let _registryDir = DEFAULT_REGISTRY_DIR;

/** @internal Test-only: override the registry directory. */
export function _setRegistryDirForTesting(dir: string): void {
  _registryDir = dir;
}

export type FixtureProcessRecord = {
  pid: number;
  port: number;
  startedAt: string;
  label: string;
};

export type ServiceRecord = {
  /** Full formula/cask name including tap, e.g. `test/e2e-tap-123-1/fake-maildev`. */
  formulaName: string;
  /** launchd label, e.g. `homebrew.mxcl.fake-maildev`. */
  plistLabel: string;
  /** Tap the formula was installed from. */
  tap: string;
  startedAt: string;
};

export type RegistryFile = {
  testPid: number;
  startedAt: string;
  fixtures: FixtureProcessRecord[];
  services: ServiceRecord[];
};

function registryPath(testPid: number): string {
  return join(_registryDir, `registry-${testPid}.json`);
}

async function ensureRegistryDir(): Promise<void> {
  await mkdir(_registryDir, { recursive: true });
}

/**
 * Read this process's registry file, or return an empty one if it does not
 * exist yet.
 */
async function readRegistry(): Promise<RegistryFile> {
  try {
    const data = await readFile(registryPath(TEST_PID), "utf-8");
    return JSON.parse(data) as RegistryFile;
  } catch {
    return { testPid: TEST_PID, startedAt: new Date().toISOString(), fixtures: [], services: [] };
  }
}

async function writeRegistry(reg: RegistryFile): Promise<void> {
  await ensureRegistryDir();
  await writeFile(registryPath(TEST_PID), JSON.stringify(reg, null, 2) + "\n", "utf-8");
}

/** Register a fixture process (e.g. the e2e-tap fixture HTTP server). */
export async function registerFixtureProcess(
  record: Omit<FixtureProcessRecord, "startedAt">,
): Promise<void> {
  const reg = await readRegistry();
  const full: FixtureProcessRecord = { ...record, startedAt: new Date().toISOString() };
  // Avoid duplicate entries for the same pid.
  reg.fixtures = reg.fixtures.filter((f) => f.pid !== full.pid);
  reg.fixtures.push(full);
  await writeRegistry(reg);
}

/** Remove a fixture process from the registry (call on clean stop). */
export async function unregisterFixtureProcess(pid: number): Promise<void> {
  const reg = await readRegistry();
  reg.fixtures = reg.fixtures.filter((f) => f.pid !== pid);
  await writeRegistry(reg);
}

/** Register a Homebrew service agent started during a test (for A1 lifecycle tests). */
export async function registerService(
  record: Omit<ServiceRecord, "startedAt">,
): Promise<void> {
  const reg = await readRegistry();
  const full: ServiceRecord = { ...record, startedAt: new Date().toISOString() };
  reg.services = reg.services.filter((s) => s.formulaName !== full.formulaName);
  reg.services.push(full);
  await writeRegistry(reg);
}

/** Remove a service from the registry (call after `brew services stop` succeeds). */
export async function unregisterService(formulaName: string): Promise<void> {
  const reg = await readRegistry();
  reg.services = reg.services.filter((s) => s.formulaName !== formulaName);
  await writeRegistry(reg);
}

/** Returns true if a process with the given PID is currently alive. */
export function isProcessAlive(pid: number): boolean {
  // Guard against special kill(2) semantics: negative pids signal process
  // groups and pid 0 signals the caller's group, both of which succeed.
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill fixture processes from ALL registry files whose owning test process is
 * no longer alive. Returns the PIDs that were killed.
 *
 * @param excludeCurrentProcess  If true (default), do not kill fixtures owned
 *   by this process — only orphans from dead test processes.
 */
export async function killOrphanedFixtures(
  excludeCurrentProcess = true,
): Promise<number[]> {
  const killed: number[] = [];
  const files = await listRegistryFiles();
  for (const file of files) {
    const reg = await readRegistryFile(file.path);
    if (!reg) continue;
    if (excludeCurrentProcess && reg.testPid === TEST_PID) continue;
    // If the owning test process is still alive, its fixtures are not orphans.
    if (isProcessAlive(reg.testPid)) continue;
    for (const fixture of reg.fixtures) {
      if (!isProcessAlive(fixture.pid)) continue;
      try {
        process.kill(fixture.pid, "SIGTERM");
        killed.push(fixture.pid);
      } catch {
        // Process may have died between the check and the kill.
      }
    }
  }
  return killed;
}

/** Injectable command runner for unit tests (avoids invoking real brew/launchctl). */
export type StopCommandRunner = (cmd: string, args: string[], timeoutMs: number) => void;

function defaultStopCommandRunner(cmd: string, args: string[], timeoutMs: number): void {
  spawnSync(cmd, args, { encoding: "utf-8", timeout: timeoutMs, stdio: "ignore" });
}

/**
 * Stop all Homebrew service agents registered by THIS test process via
 * `brew services stop` and `launchctl unload`. Used in suite teardown.
 * Returns the service names that were stopped.
 */
export async function stopRegisteredServices(
  runCommand: StopCommandRunner = defaultStopCommandRunner,
): Promise<string[]> {
  const reg = await readRegistry();
  const stopped: string[] = [];
  for (const svc of reg.services) {
    const name = svc.formulaName.includes("/")
      ? svc.formulaName.split("/").slice(1).join("/")
      : svc.formulaName;
    try {
      runCommand("brew", ["services", "stop", name], 30_000);
    } catch {}
    // Best-effort launchctl unload in case brew services stop did not clear it.
    if (svc.plistLabel) {
      try {
        runCommand("launchctl", ["unload", svc.plistLabel], 10_000);
      } catch {}
    }
    stopped.push(svc.formulaName);
  }
  reg.services = [];
  await writeRegistry(reg);
  return stopped;
}

/**
 * Stop services from ALL registry files whose owning test process is dead
 * (orphaned services). Used by the manual cleanup script path.
 */
export async function stopOrphanedServices(): Promise<string[]> {
  const stopped: string[] = [];
  const files = await listRegistryFiles();
  for (const file of files) {
    const reg = await readRegistryFile(file.path);
    if (!reg) continue;
    if (isProcessAlive(reg.testPid)) continue;
    for (const svc of reg.services) {
      const name = svc.formulaName.includes("/")
        ? svc.formulaName.split("/").slice(1).join("/")
        : svc.formulaName;
      try {
        spawnSync("brew", ["services", "stop", name], {
          encoding: "utf-8",
          timeout: 30_000,
          stdio: "ignore",
        });
      } catch {}
      if (svc.plistLabel) {
        try {
          spawnSync("launchctl", ["unload", svc.plistLabel], {
            encoding: "utf-8",
            timeout: 10_000,
            stdio: "ignore",
          });
        } catch {}
      }
      stopped.push(svc.formulaName);
    }
  }
  return stopped;
}

/** Remove this process's registry file (call on clean teardown). */
export async function cleanupCurrentProcessRegistry(): Promise<void> {
  await rm(registryPath(TEST_PID), { force: true }).catch(() => {});
}

/**
 * Remove registry files whose owning test process is no longer alive.
 * Returns the test PIDs whose files were removed.
 */
export async function purgeOrphanedRegistries(): Promise<number[]> {
  const purged: number[] = [];
  const files = await listRegistryFiles();
  for (const file of files) {
    const reg = await readRegistryFile(file.path);
    if (!reg) {
      // Corrupt or unreadable — remove it.
      await rm(file.path, { force: true }).catch(() => {});
      continue;
    }
    if (!isProcessAlive(reg.testPid)) {
      await rm(file.path, { force: true }).catch(() => {});
      purged.push(reg.testPid);
    }
  }
  return purged;
}

export type RegistryFileEntry = { path: string; testPid: number };

async function listRegistryFiles(): Promise<RegistryFileEntry[]> {
  if (!existsSync(_registryDir)) return [];
  const entries = await readdir(_registryDir);
  const out: RegistryFileEntry[] = [];
  for (const name of entries) {
    const match = name.match(/^registry-(\d+)\.json$/);
    if (!match) continue;
    out.push({ path: join(_registryDir, name), testPid: parseInt(match[1], 10) });
  }
  return out;
}

async function readRegistryFile(path: string): Promise<RegistryFile | null> {
  try {
    const data = await readFile(path, "utf-8");
    return JSON.parse(data) as RegistryFile;
  } catch {
    return null;
  }
}

/** Path to the registry directory (exposed for the cleanup script / dry-run reporting). */
export function registryDir(): string {
  return _registryDir;
}

/** List all registry files with a summary, for dry-run reporting. */
export async function summarizeRegistries(): Promise<
  { testPid: number; alive: boolean; fixtures: number; services: number; path: string }[]
> {
  const files = await listRegistryFiles();
  const out: { testPid: number; alive: boolean; fixtures: number; services: number; path: string }[] = [];
  for (const file of files) {
    const reg = await readRegistryFile(file.path);
    out.push({
      testPid: file.testPid,
      alive: isProcessAlive(file.testPid),
      fixtures: reg?.fixtures.length ?? 0,
      services: reg?.services.length ?? 0,
      path: file.path,
    });
  }
  return out;
}
