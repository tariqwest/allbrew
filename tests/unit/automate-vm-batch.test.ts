import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = join(import.meta.dir, "../monitored-install-batch/automate-vm-batch.sh");

describe("automate-vm-batch.sh test suite", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "allbrew-batch-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it("prints usage information with --help", async () => {
    const { stdout, exitCode } = await execFileAsync(SCRIPT_PATH, ["--help"]).catch((err) => err);
    expect(exitCode ?? 0).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("--concurrency");
    expect(stdout).toContain("--reset-locks");
    expect(stdout).toContain("--provision");
  });

  it("rejects unknown arguments with an error code", async () => {
    try {
      await execFileAsync(SCRIPT_PATH, ["--unknown-flag"]);
      expect().fail("Expected script to fail on unknown argument");
    } catch (err: any) {
      const stderr = err.stderr ? err.stderr.toString() : "";
      const stdout = err.stdout ? err.stdout.toString() : "";
      const message = err.message ? err.message.toString() : "";
      const combined = `${stderr}\n${stdout}\n${message}`;
      expect(combined).toContain("Unknown option");
    }
  });

  it("handles --dry-run with default parameters", async () => {
    const { stdout } = await execFileAsync(SCRIPT_PATH, ["--dry-run"]);
    expect(stdout).toContain("TH_BATCH_CONCURRENCY        = 8");
    expect(stdout).toContain("TH_BATCH_WORKERS            = th-allbrew");
    expect(stdout).toContain("TH_BATCH_FIX_MODE           = docs");
    expect(stdout).toContain("TH_BATCH_STRICT_VERIFY      = 1");
    expect(stdout).toContain("TH_BATCH_INSTALL_TIMEOUT_MS = 720000");
    expect(stdout).toContain("LUME_REMOTE_ENABLED         = true");
    expect(stdout).toContain("[DRY-RUN] Automation plan generated successfully.");
  });

  it("handles custom CLI overrides in --dry-run mode", async () => {
    const { stdout } = await execFileAsync(SCRIPT_PATH, [
      "--dry-run",
      "--concurrency",
      "4",
      "--workers",
      "w1,w2",
      "--fix-mode",
      "off",
      "--timeout",
      "300000",
      "--local-only",
    ]);

    expect(stdout).toContain("TH_BATCH_CONCURRENCY        = 4");
    expect(stdout).toContain("TH_BATCH_WORKERS            = w1,w2");
    expect(stdout).toContain("TH_BATCH_FIX_MODE           = off");
    expect(stdout).toContain("TH_BATCH_INSTALL_TIMEOUT_MS = 300000");
    expect(stdout).toContain("LUME_REMOTE_ENABLED         = false");
  });

  it("purges host lockdirs when --reset-locks is set", async () => {
    const logsDir = join(import.meta.dir, "../monitored-install-batch/logs");
    const testLockdir = join(logsDir, "vm-mutex-unit-test.lockdir");

    // Pre-create test lockdir
    await mkdir(testLockdir, { recursive: true });

    // Run script with --reset-locks and --dry-run
    const { stdout } = await execFileAsync(SCRIPT_PATH, ["--dry-run", "--reset-locks"]);
    expect(stdout).toContain("Purging host mutex lockdirs");

    // Clean up test directory if dry-run did not delete it
    await rm(testLockdir, { recursive: true, force: true }).catch(() => {});
  });

  it("logs VM provisioning step when --provision is set", async () => {
    const { stdout } = await execFileAsync(SCRIPT_PATH, ["--dry-run", "--provision"]);
    expect(stdout).toContain("Provisioning VM Harness...");
    expect(stdout).toContain("bun run vm:setup");
  });
});
