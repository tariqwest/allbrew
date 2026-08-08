import { describe, expect, test } from "bun:test";
import { classify } from "../../lib/classifier.ts";
import {
  formatBottleCellar,
  generateHomebrewFormula,
} from "../../lib/generators/homebrew-formula.ts";

describe("homebrew-formula nix / missing core token", () => {
  test("classifies formulae.brew.sh formula/nix", () => {
    const r = classify("https://formulae.brew.sh/formula/nix");
    expect(r.type).toBe("homebrew-formula");
    expect((r as { name?: string }).name).toBe("nix");
  });

  test("formatBottleCellar does not double-colon API symbols", () => {
    expect(formatBottleCellar(":any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar("any")).toBe(":any");
    expect(formatBottleCellar("/opt/homebrew/Cellar")).toBe(
      '"/opt/homebrew/Cellar"',
    );
  });

  test("generateHomebrewFormula explains missing core formula nix", async () => {
    await expect(
      generateHomebrewFormula("nix", { tapPath: "/tmp/allbrew-nix-test-tap" }),
    ).rejects.toThrow(/Homebrew core has no formula "nix"/);
  });
});
