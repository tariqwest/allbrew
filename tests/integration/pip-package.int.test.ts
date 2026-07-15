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
    expect(payload.allbrewDependency).toBe("");
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

  it("toolong: generates valid formula (log viewer)", async () => {
    const payload = await collectPipPackagePayload("toolong");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("toolong");
    expect(ruby).toContain("class Toolong < Formula");
  });

  it("castero: generates valid formula (podcast client)", async () => {
    const payload = await collectPipPackagePayload("castero");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("castero");
  });

  it("frogmouth: generates valid formula (markdown browser)", async () => {
    const payload = await collectPipPackagePayload("frogmouth");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("frogmouth");
  });

  it("napari: generates valid formula (heavy Qt/sci image viewer)", async () => {
    const payload = await collectPipPackagePayload("napari");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("napari");
  });

  it("orange3: generates valid formula (data mining GUI)", async () => {
    const payload = await collectPipPackagePayload("orange3");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("orange3");
  });

  it("bleachbit: generates valid formula (system cleaner GUI)", async () => {
    const payload = await collectPipPackagePayload("bleachbit");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("bleachbit");
  });

  it("gridplayer: generates valid formula (multi-video player)", async () => {
    const payload = await collectPipPackagePayload("gridplayer");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("gridplayer");
  });

  it("friture: generates valid formula (real-time audio analyzer)", async () => {
    const payload = await collectPipPackagePayload("friture");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("friture");
  });

  it("mlflow: generates valid formula (ML experiment tracking)", async () => {
    const payload = await collectPipPackagePayload("mlflow");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("mlflow");
  });

  it("label-studio: generates valid formula (data labeling)", async () => {
    const payload = await collectPipPackagePayload("label-studio");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("label-studio");
    expect(payload.className).toBe("LabelStudio");
  });

  it("streamlit: generates valid formula (interactive web apps)", async () => {
    const payload = await collectPipPackagePayload("streamlit");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("streamlit");
  });

  it("gradio: generates valid formula (ML demo UI)", async () => {
    const payload = await collectPipPackagePayload("gradio");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("gradio");
  });

  it("flower: generates valid formula (Celery monitor)", async () => {
    const payload = await collectPipPackagePayload("flower");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("flower");
  });

  it("nonexistent-package-xyz: throws on 404", async () => {
    await expect(
      collectPipPackagePayload("nonexistent-allbrew-test-xyz-999"),
    ).rejects.toThrow();
  });
});
