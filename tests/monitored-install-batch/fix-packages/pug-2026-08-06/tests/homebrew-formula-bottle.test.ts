import { describe, expect, test } from "bun:test";
import {
  formatBottleCellar,
  renderBottleBlock,
} from "../../lib/generators/homebrew-formula.ts";

describe("formatBottleCellar", () => {
  test("keeps API symbol strings", () => {
    expect(formatBottleCellar(":any_skip_relocation")).toBe(":any_skip_relocation");
    expect(formatBottleCellar(":any")).toBe(":any");
  });
  test("adds single colon to bare names", () => {
    expect(formatBottleCellar("any_skip_relocation")).toBe(":any_skip_relocation");
  });
  test("quotes absolute paths", () => {
    expect(formatBottleCellar("/opt/homebrew/Cellar")).toBe('"/opt/homebrew/Cellar"');
  });
  test("defaults empty to :any", () => {
    expect(formatBottleCellar(null)).toBe(":any");
    expect(formatBottleCellar("")).toBe(":any");
  });
  test("never double-colon", () => {
    expect(formatBottleCellar(":any_skip_relocation")).not.toMatch(/^::/);
  });
});

describe("renderBottleBlock", () => {
  test("emits valid cellar symbols", () => {
    const block = renderBottleBlock("  ", {
      rebuild: 0,
      root_url: "https://ghcr.io/v2/homebrew/core",
      files: {
        arm64_sonoma: {
          cellar: ":any_skip_relocation",
          sha256: "abc",
        },
        sonoma: {
          cellar: "any_skip_relocation",
          sha256: "def",
        },
      },
    });
    expect(block).toContain("sha256 cellar: :any_skip_relocation, arm64_sonoma: \"abc\"");
    expect(block).toContain("sha256 cellar: :any_skip_relocation, sonoma: \"def\"");
    expect(block).not.toMatch(/::any/);
  });
});
