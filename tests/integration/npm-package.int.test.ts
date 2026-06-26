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

  it("vtop: generates valid formula (system monitor TUI)", async () => {
    const payload = await collectNpmPackagePayload("vtop");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("vtop");
    expect(ruby).toContain("class Vtop < Formula");
  });

  it("json-server: generates valid formula (mock REST API)", async () => {
    const payload = await collectNpmPackagePayload("json-server");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("json-server");
  });

  it("verdaccio: generates valid formula (private npm registry)", async () => {
    const payload = await collectNpmPackagePayload("verdaccio");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("verdaccio");
  });

  it("@hehehai/buke: generates valid formula for scoped npm package", async () => {
    const payload = await collectNpmPackagePayload("@hehehai/buke");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("hehehai-buke");
    expect(payload.className).toBe("HehehaiBuke");
    expect(payload.url).toContain("registry.npmjs.org/@hehehai/buke");
  });

  it("dirac-cli: payload fields are well-formed", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli");
    expect(payload.template).toBe("npm_package");
    expect(payload.name).toBe("dirac-cli");
    expect(payload.url).toMatch(/^https:\/\/registry\.npmjs\.org\/dirac-cli\/\-\/dirac-cli-.+\.tgz/);
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.livecheckBlock).toContain("registry.npmjs.org/dirac-cli/latest");
  });

  it("dirac-cli: generates structurally valid Ruby formula", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class DiracCli < Formula");
    expect(ruby).toContain('depends_on "node"');
    expect(ruby).toContain('system "npm", "install"');
    expect(ruby).toContain("bin.install_symlink");
  });

  it("dirac-cli: name override produces correct bin-named formula", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli", null, {
      name: "dirac",
    });
    expect(payload.name).toBe("dirac");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Dirac < Formula");
  });

  it("cline: payload fields are well-formed", async () => {
    const payload = await collectNpmPackagePayload("cline");
    expect(payload.template).toBe("npm_package");
    expect(payload.name).toBe("cline");
    expect(payload.url).toMatch(/^https:\/\/registry\.npmjs\.org\/cline\/-\/cline-.+\.tgz/);
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.livecheckBlock).toContain("registry.npmjs.org/cline/latest");
  });

  it("cline: generates structurally valid Ruby formula", async () => {
    const payload = await collectNpmPackagePayload("cline");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Cline < Formula");
    expect(ruby).toContain('depends_on "node"');
    expect(ruby).toContain('system "npm", "install"');
    expect(ruby).toContain("bin.install_symlink");
  });

  it("cline: homepage points to cline.bot", async () => {
    const payload = await collectNpmPackagePayload("cline");
    expect(payload.homepage).toBe("https://cline.bot");
  });

  it("nonexistent-pkg-xyz: throws on missing package", async () => {
    await expect(
      collectNpmPackagePayload("nonexistent-allbrew-test-xyz-999"),
    ).rejects.toThrow();
  });
});
