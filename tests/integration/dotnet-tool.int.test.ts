import { describe, it, expect } from "vitest";
import { collectDotnetToolPayload } from "../../lib/generators/dotnet-tool.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: fetches real NuGet package data, validates payload + Ruby output.
 * Run: bun run test:int
 */

describe.concurrent("dotnet-tool integration", () => {
  it("dotnet-serve: payload fields are well-formed", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve");
    expect(payload.template).toBe("dotnet_tool");
    expect(payload.name).toBe("dotnet-serve");
    expect(payload.className).toBe("DotnetServe");
    expect(payload.version).toMatch(/^\d+\.\d+/);
  });

  it("dotnet-serve: generates structurally valid Ruby formula", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class DotnetServe < Formula");
    expect(ruby).toContain("depends_on \"dotnet\"");
    expect(ruby).toContain("dotnet");
    expect(ruby).toContain("tool");
    expect(ruby).toContain("sha256");
  });

  it("csharprepl: generates valid formula", async () => {
    const payload = await collectDotnetToolPayload("csharprepl");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Csharprepl < Formula");
    expect(ruby).toContain("dotnet");
  });

  it("ilspycmd: generates valid formula", async () => {
    const payload = await collectDotnetToolPayload("ilspycmd");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Ilspycmd < Formula");
  });

  it("nonexistent-package-xyz: throws on 404", async () => {
    await expect(
      collectDotnetToolPayload("nonexistent-allbrew-test-xyz-999"),
    ).rejects.toThrow();
  });
});
