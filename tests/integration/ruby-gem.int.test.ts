import { describe, it, expect } from "vitest";
import { collectRubyGemPayload } from "../../lib/generators/ruby-gem.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: fetches real RubyGems data, validates payload + Ruby output.
 * Run: bun run test:int
 */

describe.concurrent("ruby-gem integration", () => {
  it("pry: payload fields are well-formed", async () => {
    const payload = await collectRubyGemPayload("pry");
    expect(payload.template).toBe("ruby_gem");
    expect(payload.name).toBe("pry");
    expect(payload.className).toBe("Pry");
    expect(payload.version).toMatch(/^\d+\.\d+/);
  });

  it("pry: generates structurally valid Ruby formula", async () => {
    const payload = await collectRubyGemPayload("pry");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Pry < Formula");
    expect(ruby).toContain("depends_on \"ruby\"");
    expect(ruby).toContain("gem");
    expect(ruby).toContain("sha256");
  });

  it("license_finder: generates valid formula", async () => {
    const payload = await collectRubyGemPayload("license_finder");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class LicenseFinder < Formula");
  });

  it("geminabox: generates valid formula", async () => {
    const payload = await collectRubyGemPayload("geminabox");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Geminabox < Formula");
  });

  it("rubio-radio: generates valid formula", async () => {
    const payload = await collectRubyGemPayload("rubio-radio");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class RubioRadio < Formula");
  });

  it("nonexistent-gem-xyz: throws on 404", async () => {
    await expect(
      collectRubyGemPayload("nonexistent-allbrew-test-xyz-999"),
    ).rejects.toThrow();
  });
});
