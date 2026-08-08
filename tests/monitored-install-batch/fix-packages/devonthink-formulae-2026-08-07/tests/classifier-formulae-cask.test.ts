import { describe, expect, test } from "bun:test";
import { classify } from "../../../../../lib/classifier.ts";

describe("formulae.brew.sh official pages", () => {
  test("classifies cask pages as homebrew-cask", () => {
    const r = classify("https://formulae.brew.sh/cask/devonthink");
    expect(r.type).toBe("homebrew-cask");
    expect(r.name).toBe("devonthink");
  });

  test("classifies formula pages as homebrew-formula", () => {
    const r = classify("https://formulae.brew.sh/formula/wget");
    expect(r.type).toBe("homebrew-formula");
    expect(r.name).toBe("wget");
  });
});
