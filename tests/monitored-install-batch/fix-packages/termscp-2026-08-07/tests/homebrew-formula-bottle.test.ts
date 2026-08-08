import { describe, expect, test } from "bun:test";
import {
  formatBottleCellar,
  renderBottleBlock,
} from "../../lib/generators/homebrew-formula.ts";
import { classify } from "../../lib/classifier.ts";

describe("formatBottleCellar", () => {
  test("keeps leading colon from API symbol values", () => {
    expect(formatBottleCellar(":any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar(":any")).toBe(":any");
  });

  test("adds colon to bare symbol names", () => {
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
    expect(formatBottleCellar(":any")).not.toMatch(/^::/);
    expect(formatBottleCellar("/opt/homebrew/Cellar")).not.toMatch(/^:/);
  });
});

describe("renderBottleBlock (termscp-style :any bottles)", () => {
  test("renders termscp API cellar :any as valid Ruby", () => {
    const ruby = renderBottleBlock("  ", {
      rebuild: 0,
      root_url: "https://ghcr.io/v2/homebrew/core",
      files: {
        arm64_sonoma: {
          cellar: ":any",
          sha256: "f54a5b9bae4d01919976d807edd02105ee39a48e49ece8a249e84ae85ef1e647",
        },
        sonoma: {
          cellar: ":any",
          sha256: "3e1e60e1f3569e7ddfa67984c2a6a880769a330ed40eb1c7b6fcd65e35533155",
        },
      },
    });
    expect(ruby).toContain("sha256 cellar: :any, arm64_sonoma:");
    expect(ruby).not.toContain("::any");
  });
});

describe("termscp homebrew formula page", () => {
  test("classifies formulae.brew.sh formula/termscp", () => {
    const r = classify("https://formulae.brew.sh/formula/termscp");
    expect(r.type).toBe("homebrew-formula");
    expect(r.name).toBe("termscp");
  });
});
