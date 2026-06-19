import { describe, it, expect } from "vitest";
import { collectNpmPackagePayload } from "../../lib/generators/npm-package.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: calls real npm registry, validates generated Ruby structure.
 * Run: bun run test:int
 */

describe.concurrent("npm-package integration", () => {
  it("maildev: payload fields are well-formed", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.template).toBe("npm_package");
    expect(payload.name).toBe("maildev");
    expect(payload.url).toMatch(/^https:\/\/registry\.npmjs\.org\/maildev\/-\/maildev-.+\.tgz/);
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.livecheckBlock).toContain("registry.npmjs.org/maildev/latest");
  });

  it("maildev: generates structurally valid Ruby formula", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain('depends_on "node"');
    expect(ruby).toContain('system "npm", "install"');
    expect(ruby).toContain("bin.install_symlink");
  });

  it("taskbook: generates valid formula", async () => {
    const payload = await collectNpmPackagePayload("taskbook");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Taskbook < Formula");
  });

  it("npkill: generates valid formula", async () => {
    const payload = await collectNpmPackagePayload("npkill");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("npkill");
  });

  it("nonexistent-pkg-xyz: throws on missing package", async () => {
    await expect(
      collectNpmPackagePayload("nonexistent-allbrew-test-xyz-999"),
    ).rejects.toThrow();
  });
});
