import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  registerFixtureProcess,
  unregisterFixtureProcess,
  registerService,
  unregisterService,
  isProcessAlive,
  killOrphanedFixtures,
  stopRegisteredServices,
  cleanupCurrentProcessRegistry,
  purgeOrphanedRegistries,
  summarizeRegistries,
  registryDir,
  _setRegistryDirForTesting,
  type RegistryFile,
} from "../helpers/test-cleanup-registry.ts";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "allbrew-registry-test-"));
  _setRegistryDirForTesting(testDir);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true }).catch(() => {});
});

describe("test-cleanup-registry: fixture process registration", () => {
  it("registerFixtureProcess writes a registry file with the fixture record", async () => {
    await registerFixtureProcess({ pid: 12345, port: 9999, label: "fixture-server" });
    const regPath = join(testDir, `registry-${process.pid}.json`);
    expect(existsSync(regPath)).toBe(true);
    const data = JSON.parse(await readFile(regPath, "utf-8")) as RegistryFile;
    expect(data.testPid).toBe(process.pid);
    expect(data.fixtures).toHaveLength(1);
    expect(data.fixtures[0]).toMatchObject({
      pid: 12345,
      port: 9999,
      label: "fixture-server",
    });
    expect(typeof data.fixtures[0].startedAt).toBe("string");
  });

  it("unregisterFixtureProcess removes the fixture from the registry", async () => {
    await registerFixtureProcess({ pid: 111, port: 1, label: "a" });
    await registerFixtureProcess({ pid: 222, port: 2, label: "b" });
    await unregisterFixtureProcess(111);
    const regPath = join(testDir, `registry-${process.pid}.json`);
    const data = JSON.parse(await readFile(regPath, "utf-8")) as RegistryFile;
    expect(data.fixtures).toHaveLength(1);
    expect(data.fixtures[0].pid).toBe(222);
  });

  it("registering the same pid twice does not create a duplicate", async () => {
    await registerFixtureProcess({ pid: 333, port: 10, label: "first" });
    await registerFixtureProcess({ pid: 333, port: 20, label: "second" });
    const regPath = join(testDir, `registry-${process.pid}.json`);
    const data = JSON.parse(await readFile(regPath, "utf-8")) as RegistryFile;
    expect(data.fixtures).toHaveLength(1);
    expect(data.fixtures[0].port).toBe(20);
    expect(data.fixtures[0].label).toBe("second");
  });
});

describe("test-cleanup-registry: service registration", () => {
  it("registerService writes a service record", async () => {
    await registerService({
      formulaName: "test/e2e-tap-1/fake-maildev",
      plistLabel: "homebrew.mxcl.fake-maildev",
      tap: "test/e2e-tap-1",
    });
    const regPath = join(testDir, `registry-${process.pid}.json`);
    const data = JSON.parse(await readFile(regPath, "utf-8")) as RegistryFile;
    expect(data.services).toHaveLength(1);
    expect(data.services[0].formulaName).toBe("test/e2e-tap-1/fake-maildev");
  });

  it("unregisterService removes the service by formulaName", async () => {
    await registerService({
      formulaName: "test/e2e-tap-1/a",
      plistLabel: "homebrew.mxcl.a",
      tap: "test/e2e-tap-1",
    });
    await registerService({
      formulaName: "test/e2e-tap-1/b",
      plistLabel: "homebrew.mxcl.b",
      tap: "test/e2e-tap-1",
    });
    await unregisterService("test/e2e-tap-1/a");
    const regPath = join(testDir, `registry-${process.pid}.json`);
    const data = JSON.parse(await readFile(regPath, "utf-8")) as RegistryFile;
    expect(data.services).toHaveLength(1);
    expect(data.services[0].formulaName).toBe("test/e2e-tap-1/b");
  });
});

describe("test-cleanup-registry: isProcessAlive", () => {
  it("returns true for the current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for a pid that does not exist", () => {
    // PID 999999 is extremely unlikely to exist.
    expect(isProcessAlive(999999)).toBe(false);
  });

  it("returns false for an invalid pid", () => {
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(0)).toBe(false);
  });
});

describe("test-cleanup-registry: killOrphanedFixtures", () => {
  it("kills fixture processes from a dead test process registry", async () => {
    // Spawn a real long-lived child process to act as an "orphaned fixture".
    const child = spawn("sleep", ["300"], { stdio: "ignore" });
    await new Promise((resolve) => child.once("spawn", resolve));
    const childPid = child.pid!;

    // Write a registry file for a dead test pid (999999) referencing the child.
    const orphanRegPath = join(testDir, "registry-999999.json");
    const orphanReg: RegistryFile = {
      testPid: 999999,
      startedAt: new Date().toISOString(),
      fixtures: [{ pid: childPid, port: 12345, startedAt: new Date().toISOString(), label: "orphan" }],
      services: [],
    };
    await writeFile(orphanRegPath, JSON.stringify(orphanReg, null, 2) + "\n", "utf-8");

    expect(isProcessAlive(childPid)).toBe(true);
    const killed = await killOrphanedFixtures();
    expect(killed).toContain(childPid);
    // Give it a moment to exit after SIGTERM.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(isProcessAlive(childPid)).toBe(false);
    child.kill("SIGKILL"); // cleanup just in case
  });

  it("does not kill fixtures from the current (alive) test process", async () => {
    // Register a fixture pid that is the current process itself (alive).
    // killOrphanedFixtures(excludeCurrentProcess=true) should skip it.
    await registerFixtureProcess({ pid: process.pid, port: 0, label: "self" });
    const killed = await killOrphanedFixtures();
    expect(killed).not.toContain(process.pid);
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});

describe("test-cleanup-registry: stopRegisteredServices", () => {
  it("clears the services list after stopping (no real brew invoked if empty)", async () => {
    // Register a fake service. stopRegisteredServices will attempt `brew
    // services stop` which may fail (brew not installed or formula absent),
    // but the registry should be cleared regardless.
    await registerService({
      formulaName: "test/e2e-tap-1/fake-noop",
      plistLabel: "homebrew.mxcl.fake-noop",
      tap: "test/e2e-tap-1",
    });
    const stopped = await stopRegisteredServices();
    expect(stopped).toContain("test/e2e-tap-1/fake-noop");
    const regPath = join(testDir, `registry-${process.pid}.json`);
    const data = JSON.parse(await readFile(regPath, "utf-8")) as RegistryFile;
    expect(data.services).toHaveLength(0);
  });
});

describe("test-cleanup-registry: cleanupCurrentProcessRegistry", () => {
  it("removes the current process's registry file", async () => {
    await registerFixtureProcess({ pid: 555, port: 5, label: "x" });
    const regPath = join(testDir, `registry-${process.pid}.json`);
    expect(existsSync(regPath)).toBe(true);
    await cleanupCurrentProcessRegistry();
    expect(existsSync(regPath)).toBe(false);
  });
});

describe("test-cleanup-registry: purgeOrphanedRegistries", () => {
  it("removes registry files whose test process is dead", async () => {
    const deadPath = join(testDir, "registry-888888.json");
    await writeFile(
      deadPath,
      JSON.stringify({
        testPid: 888888,
        startedAt: new Date().toISOString(),
        fixtures: [],
        services: [],
      } satisfies RegistryFile) + "\n",
      "utf-8",
    );
    // Also create the current-process registry (alive) — should NOT be purged.
    await registerFixtureProcess({ pid: 777, port: 7, label: "alive" });
    const alivePath = join(testDir, `registry-${process.pid}.json`);

    const purged = await purgeOrphanedRegistries();
    expect(purged).toContain(888888);
    expect(existsSync(deadPath)).toBe(false);
    expect(existsSync(alivePath)).toBe(true);
  });
});

describe("test-cleanup-registry: summarizeRegistries", () => {
  it("summarizes registry files with alive/fixture/service counts", async () => {
    await registerFixtureProcess({ pid: 100, port: 1, label: "f1" });
    await registerService({
      formulaName: "test/t/fake",
      plistLabel: "homebrew.mxcl.fake",
      tap: "test/t",
    });
    // Dead test process registry
    await writeFile(
      join(testDir, "registry-777777.json"),
      JSON.stringify({
        testPid: 777777,
        startedAt: new Date().toISOString(),
        fixtures: [{ pid: 200, port: 2, startedAt: "", label: "f2" }],
        services: [],
      } satisfies RegistryFile) + "\n",
      "utf-8",
    );

    const summary = await summarizeRegistries();
    expect(summary).toHaveLength(2);
    const current = summary.find((s) => s.testPid === process.pid)!;
    expect(current.alive).toBe(true);
    expect(current.fixtures).toBe(1);
    expect(current.services).toBe(1);
    const dead = summary.find((s) => s.testPid === 777777)!;
    expect(dead.alive).toBe(false);
    expect(dead.fixtures).toBe(1);
    expect(dead.services).toBe(0);
  });
});

describe("test-cleanup-registry: registryDir", () => {
  it("returns the current (possibly overridden) registry directory", () => {
    expect(registryDir()).toBe(testDir);
  });
});
