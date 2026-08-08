import { describe, expect, test } from "bun:test";
import { classify } from "../../lib/classifier.ts";

describe("formulae.brew.sh cask URL that is actually a formula (nvm)", () => {
  test("classifies as homebrew-cask token nvm", () => {
    const r = classify("https://formulae.brew.sh/cask/nvm");
    expect(r.type).toBe("homebrew-cask");
    expect(r.name).toBe("nvm");
  });
});
