import { describe, expect, test } from "bun:test";
import { classify } from "../../../lib/classifier.ts";
import { generateHomebrewCask } from "../../../lib/generators/homebrew-cask.ts";

describe("classifier formulae.brew.sh/cask/hermes", () => {
  test("classifies as homebrew-cask", () => {
    const r = classify("https://formulae.brew.sh/cask/hermes");
    expect(r.type).toBe("homebrew-cask");
    expect((r as { name?: string }).name).toBe("hermes");
  });
});

describe("generateHomebrewCask missing token", () => {
  test("rejects removed hermes with clear 404", async () => {
    await expect(generateHomebrewCask("hermes", { tapPath: "/tmp/no-tap" })).rejects.toThrow(
      /no token "hermes"|API 404|HTTP 404/,
    );
  });
});
