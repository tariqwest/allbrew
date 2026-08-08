import { describe, expect, test } from "bun:test";
import { classify } from "../../../lib/classifier.ts";

describe("formulae.brew.sh/cask/balenaetcher (Case C)", () => {
  test("classifies as homebrew-cask token balenaetcher", () => {
    const r = classify("https://formulae.brew.sh/cask/balenaetcher");
    expect(r.type).toBe("homebrew-cask");
    expect(r.name).toBe("balenaetcher");
  });
});
