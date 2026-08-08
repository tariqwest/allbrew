import { describe, expect, test } from "bun:test";
import { formatBottleCellar } from "../../lib/generators/homebrew-formula.ts";

describe("formatBottleCellar", () => {
  test("keeps leading colon from API values", () => {
    expect(formatBottleCellar(":any_skip_relocation")).toBe(":any_skip_relocation");
    expect(formatBottleCellar(":any")).toBe(":any");
  });
  test("adds colon to bare names", () => {
    expect(formatBottleCellar("any_skip_relocation")).toBe(":any_skip_relocation");
  });
  test("defaults empty to :any", () => {
    expect(formatBottleCellar(null)).toBe(":any");
    expect(formatBottleCellar("")).toBe(":any");
  });
});
