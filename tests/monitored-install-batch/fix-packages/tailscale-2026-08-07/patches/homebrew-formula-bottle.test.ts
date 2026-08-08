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

  test("never emits double-colon", () => {
    expect(formatBottleCellar(":any_skip_relocation")).not.toMatch(/^::/);
  });
});

describe("renderBottleBlock", () => {
  test("renders API-style :any_skip_relocation without double colon", () => {
    const ruby = renderBottleBlock("  ", {
      rebuild: 0,
      root_url: "https://ghcr.io/v2/homebrew/core",
      files: {
        arm64_sonoma: {
          cellar: ":any_skip_relocation",
          sha256: "abc",
        },
        x86_64_linux: {
          cellar: ":any",
          sha256: "def",
        },
      },
    });
    expect(ruby).toContain(
      "sha256 cellar: :any_skip_relocation, arm64_sonoma: \"abc\"",
    );
    expect(ruby).toContain('sha256 cellar: :any, x86_64_linux: "def"');
    expect(ruby).not.toContain("::any");
  });
});
