import { describe, it, expect } from "vitest";
import { collectPipPackagePayload } from "../../lib/generators/pip-package.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: calls real PyPI API, validates generated Ruby structure.
 * Run: bun run test:int
 */

describe.concurrent("pip-package integration", () => {
  it("marimo: payload fields are well-formed", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.template).toBe("pip_package");
    expect(payload.name).toBe("marimo");
    expect(payload.url).toMatch(/^https:\/\/files\.pythonhosted\.org\/.+\.tar\.gz/);
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.homepage).toBeTruthy();
    expect(payload.livecheckBlock).toContain("pypi.org/pypi/marimo/json");
    expect(payload.allbrewDependency).toContain("allbrew");
  });

  it("marimo: generates structurally valid Ruby formula", async () => {
    const payload = await collectPipPackagePayload("marimo");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("include Language::Python::Virtualenv");
    expect(ruby).toContain('depends_on "python@3.13"');
    expect(ruby).toContain("virtualenv_install_with_resources");
  });

  it("marimo: has transitive resource blocks", async () => {
    const payload = await collectPipPackagePayload("marimo");
    // marimo has many deps — resources block should be non-empty
    expect(payload.resourcesBlock.length).toBeGreaterThan(0);
    expect(payload.resourcesBlock).toMatch(/resource ".+" do/);
    expect(payload.resourcesBlock).toMatch(/sha256 "[a-f0-9]{64}"/);
  });

  it("s-tui: handles hyphen in package name", async () => {
    const payload = await collectPipPackagePayload("s-tui");
    expect(payload.name).toBe("s-tui");
    expect(payload.className).toBe("STui");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
  });

  it("browsr: generates valid formula", async () => {
    const payload = await collectPipPackagePayload("browsr");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Browsr < Formula");
  });

  it("nonexistent-package-xyz: throws on 404", async () => {
    await expect(
      collectPipPackagePayload("nonexistent-allbrew-test-xyz-999"),
    ).rejects.toThrow();
  });
});
