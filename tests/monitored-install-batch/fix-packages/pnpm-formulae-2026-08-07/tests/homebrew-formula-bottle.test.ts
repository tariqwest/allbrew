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

  test("never emits double-colon", () => {
    expect(formatBottleCellar(":any_skip_relocation")).not.toMatch(/^::/);
    expect(formatBottleCellar(":any")).not.toMatch(/^::/);
  });
});

describe("renderBottleBlock (pnpm-style API cellar)", () => {
  test("renders :any without double colon", () => {
    const ruby = renderBottleBlock("  ", {
      rebuild: 0,
      root_url: "https://ghcr.io/v2/homebrew/core",
      files: {
        arm64_sonoma: {
          cellar: ":any",
          sha256: "97dcb3f4ac0fb551f4e4837643803f3604b4923509c35056a4c821e628ee5142",
        },
        x86_64_linux: {
          cellar: ":any_skip_relocation",
          sha256: "6ab411a30f226280cd88296002be1c3c8df24a2fa0a0c8162f244fb11f463358",
        },
      },
    });
    expect(ruby).toContain("sha256 cellar: :any, arm64_sonoma:");
    expect(ruby).toContain("sha256 cellar: :any_skip_relocation, x86_64_linux:");
    expect(ruby).not.toContain("::any");
  });
});
