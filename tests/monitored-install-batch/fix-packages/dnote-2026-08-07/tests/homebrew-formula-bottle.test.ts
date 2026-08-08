import { describe, expect, test } from "bun:test";
import {
  formatBottleCellar,
  renderBottleBlock,
} from "../../lib/generators/homebrew-formula.ts";

describe("formatBottleCellar", () => {
  test("keeps leading colon from API symbol values", () => {
    expect(formatBottleCellar(":any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar(":any")).toBe(":any");
  });

  test("adds colon to bare symbol names", () => {
    expect(formatBottleCellar("any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar("any")).toBe(":any");
  });

  test("quotes absolute Cellar paths as Ruby strings", () => {
    expect(formatBottleCellar("/opt/homebrew/Cellar")).toBe(
      '"/opt/homebrew/Cellar"',
    );
  });

  test("defaults empty to :any", () => {
    expect(formatBottleCellar(null)).toBe(":any");
    expect(formatBottleCellar("")).toBe(":any");
  });

  test("never emits double-colon or symbolized paths", () => {
    expect(formatBottleCellar(":any_skip_relocation")).not.toMatch(/^::/);
    expect(formatBottleCellar("/opt/homebrew/Cellar")).not.toMatch(/^:/);
  });
});

describe("renderBottleBlock (dnote-style :any_skip_relocation bottles)", () => {
  test("renders dnote API cellar values as valid Ruby", () => {
    const ruby = renderBottleBlock("  ", {
      rebuild: 0,
      root_url: "https://ghcr.io/v2/homebrew/core",
      files: {
        arm64_sonoma: {
          cellar: ":any_skip_relocation",
          sha256: "46f67f0f6bed3576a601c8de799a14c46a239b43971ddac113fab02fc3f05b88",
        },
        sonoma: {
          cellar: ":any_skip_relocation",
          sha256: "55ef785d358763e6266ad5d5d806cd7bd115b25841b5d161537881babc60f91b",
        },
      },
    });
    expect(ruby).toContain(
      "sha256 cellar: :any_skip_relocation, arm64_sonoma:",
    );
    expect(ruby).not.toContain("::any_skip_relocation");
    expect(ruby).not.toContain("::any");
  });
});

import { classify } from "../../lib/classifier.ts";

describe("dnote homebrew formula page", () => {
  test("classifies formulae.brew.sh formula/dnote", () => {
    const r = classify("https://formulae.brew.sh/formula/dnote");
    expect(r.type).toBe("homebrew-formula");
    expect(r.name).toBe("dnote");
  });
});
