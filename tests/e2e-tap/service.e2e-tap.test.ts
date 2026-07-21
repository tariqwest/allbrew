import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  E2E_TAP,
  setupTestContext,
  teardownTestContext,
  generateFormulaWithService,
  installFromTap,
  uninstallFromTap,
  canInstallApp,
  getFixtureApp,
  type TestContext,
} from "./helpers/setup.ts";
import { formulaPath, remoteFileContent } from "./helpers/tap.ts";
import {
  registerService,
  unregisterService,
} from "../helpers/test-cleanup-registry.ts";

// ─── A1: e2e-tap service stanza + direct-launch tests ───────────────────
// Uses the `fake-service` fixture app (binary-release with a service binary
// that starts an HTTP server on a configurable port). Tests:
//   1. `allbrew --service` generates a formula with a `service do ... end` block
//   2. The service block contains `run ...`, `keep_alive true`
//   3. brew install succeeds and the binary is on PATH
//   4. Direct launch of the binary (not via brew services) starts an HTTP
//      server that responds with 200 "ok"
//   5. brew services start/stop works (launchd round-trip)
//   6. Cleanup: brew services stop + brew uninstall leaves no residue

describe.skipIf(!E2E_TAP)("service: binary-release with --service", () => {
  let ctx: TestContext;
  const app = getFixtureApp("fake-service");
  const SERVICE_PORT = 18080;
  const SERVICE_URL = `http://127.0.0.1:${SERVICE_PORT}`;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownTestContext(ctx);
  });

  describe("generate with --service", () => {
    it("should generate a formula containing a service block", () => {
      const gen = generateFormulaWithService(ctx, app, app.name);
      expect(gen.code, `allbrew --service generation failed:\n${gen.stderr}`).toBe(0);

      const fpath = formulaPath(ctx.tap, app.name);
      expect(existsSync(fpath), `Formula file not found: ${fpath}`).toBe(true);

      const content = readFileSync(fpath, "utf-8");
      expect(content).toContain("service do");
      expect(content).toContain("run ");
      expect(content).toContain("keep_alive true");
      expect(content).toContain("end");
    });

    it("should push the formula to the remote tap", () => {
      const content = remoteFileContent(ctx.tap, `Formula/${app.name}.rb`);
      expect(content).toContain("service do");
      expect(content).toContain("keep_alive true");
    });
  });

  describe("install and direct launch", () => {
    it("should install the formula from the tap", () => {
      if (!canInstallApp(app)) {
        console.log("[skip] brew install — toolchain not available");
        return;
      }

      const install = installFromTap(ctx, app);
      expect(install.code, `brew install failed:\n${install.stdout}\n${install.stderr}`).toBe(0);
    });

    it("should have the binary on PATH", () => {
      if (!canInstallApp(app)) return;

      const brewPrefix = execFileSync("brew", ["--prefix"], { encoding: "utf-8" }).trim();
      const binPath = join(brewPrefix, "bin", app.name);
      expect(existsSync(binPath), `Binary not found at ${binPath}`).toBe(true);
    });

    it("should start an HTTP server when launched directly", async () => {
      if (!canInstallApp(app)) return;

      const brewPrefix = execFileSync("brew", ["--prefix"], { encoding: "utf-8" }).trim();
      const binPath = join(brewPrefix, "bin", app.name);

      // Launch the service binary on the test port as a background process
      const child = spawn(binPath, [String(SERVICE_PORT)], {
        stdio: "ignore",
        detached: true,
        env: ctx.env,
      });
      child.unref();

      try {
        // Wait for the server to be ready (poll up to 10s)
        let ready = false;
        const startTime = Date.now();
        while (Date.now() - startTime < 10_000) {
          try {
            const resp = await fetch(SERVICE_URL);
            if (resp.ok) {
              ready = true;
              break;
            }
          } catch {
            // not ready yet
          }
          await new Promise((r) => setTimeout(r, 200));
        }

        expect(ready, "Service did not become ready within 10s").toBe(true);

        // Verify the response body
        const resp = await fetch(SERVICE_URL);
        expect(resp.status).toBe(200);
        const body = await resp.text();
        expect(body).toBe("ok");
      } finally {
        // Kill the background process
        try {
          process.kill(child.pid!, "SIGTERM");
        } catch {
          // already dead
        }
      }
    }, 30_000);
  });

  describe("brew services round-trip", () => {
    it("should start the service via brew services", async () => {
      if (!canInstallApp(app)) {
        console.log("[skip] brew services — toolchain not available");
        return;
      }

      execFileSync(
        "brew",
        ["services", "start", `${ctx.tap.tapName}/${app.name}`],
        { encoding: "utf-8", env: ctx.env, timeout: 30_000, stdio: "pipe" },
      );

      // Register for cleanup
      registerService({
        formulaName: `${ctx.tap.tapName}/${app.name}`,
        plistLabel: `homebrew.mxcl.${app.name}`,
        tap: ctx.tap.tapName,
      });

      // Poll for the service to be ready (up to 15s)
      let ready = false;
      const startTime = Date.now();
      while (Date.now() - startTime < 15_000) {
        try {
          const resp = await fetch(SERVICE_URL);
          if (resp.ok) {
            ready = true;
            break;
          }
        } catch {
          // not ready yet
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      expect(ready, "brew services did not start the HTTP server within 15s").toBe(true);
    }, 60_000);

    it("should stop the service via brew services", async () => {
      if (!canInstallApp(app)) return;

      execFileSync(
        "brew",
        ["services", "stop", `${ctx.tap.tapName}/${app.name}`],
        { encoding: "utf-8", env: ctx.env, timeout: 30_000, stdio: "pipe" },
      );

      // Unregister from cleanup registry
      unregisterService(`${ctx.tap.tapName}/${app.name}`);

      // Verify the server is no longer responding
      let stillUp = false;
      const startTime = Date.now();
      while (Date.now() - startTime < 5_000) {
        try {
          const resp = await fetch(SERVICE_URL);
          if (resp.ok) {
            stillUp = true;
            break;
          }
        } catch {
          // down — good
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      expect(stillUp, "Service should be down after brew services stop").toBe(false);
    }, 30_000);
  });

  describe("cleanup", () => {
    it("should uninstall cleanly", () => {
      if (!canInstallApp(app)) return;

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code, `brew uninstall failed:\n${uninstall.stderr}`).toBe(0);
    });
  });
});
