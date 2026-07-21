import { describe, it, expect } from "bun:test";
import { collectNpmPackagePayload } from "../../lib/generators/npm-package.ts";
import { collectPipPackagePayload } from "../../lib/generators/pip-package.ts";
import { collectGemPackagePayload } from "../../lib/generators/gem-package.ts";
import { collectDotnetPackagePayload } from "../../lib/generators/dotnet-package.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";
import { LIVE_SMOKE_PACKAGES } from "./helpers/quarantine.ts";

/**
 * B6: Live smoke set — a small subset of integration tests that hit each
 * major registry once. Allowed to fail separately from the CI gate.
 *
 * Run: bun run test:live-smoke
 *
 * This set is intentionally small (one package per registry) to keep it
 * fast. It validates that each registry endpoint is reachable and returns
 * the expected payload structure. Failures here indicate registry issues,
 * not product bugs.
 */

describe("B6: live smoke — one package per registry", () => {
  describe("npm registry", () => {
    it("maildev: payload + Ruby are well-formed", async () => {
      const payload = await collectNpmPackagePayload("maildev");
      expect(payload.template).toBe("npm_package");
      expect(payload.name).toBe("maildev");
      expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
      const ruby = renderFormula(payload);
      assertValidFormula(ruby);
    });
  });

  describe("PyPI registry", () => {
    it("marimo: payload + Ruby are well-formed", async () => {
      const payload = await collectPipPackagePayload("marimo");
      expect(payload.template).toBe("pip_package");
      expect(payload.name).toBe("marimo");
      expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
      const ruby = renderFormula(payload);
      assertValidFormula(ruby);
    });
  });

  describe("RubyGems registry", () => {
    it("pry: payload + Ruby are well-formed", async () => {
      const payload = await collectGemPackagePayload("pry");
      expect(payload.template).toBe("gem_package");
      expect(payload.name).toBe("pry");
      expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
      const ruby = renderFormula(payload);
      assertValidFormula(ruby);
    });
  });

  describe("NuGet registry", () => {
    it("dotnet-serve: payload + Ruby are well-formed", async () => {
      const payload = await collectDotnetPackagePayload("dotnet-serve");
      expect(payload.template).toBe("dotnet_package");
      expect(payload.name).toBe("dotnet-serve");
      const ruby = renderFormula(payload);
      assertValidFormula(ruby);
    });
  });

  describe("quarantine list is stable", () => {
    it("LIVE_SMOKE_PACKAGES contains exactly the smoke set", () => {
      expect(LIVE_SMOKE_PACKAGES.size).toBeGreaterThanOrEqual(4);
      expect(LIVE_SMOKE_PACKAGES.has("maildev")).toBe(true);
      expect(LIVE_SMOKE_PACKAGES.has("marimo")).toBe(true);
      expect(LIVE_SMOKE_PACKAGES.has("pry")).toBe(true);
      expect(LIVE_SMOKE_PACKAGES.has("dotnet-serve")).toBe(true);
    });
  });
});
