import { describe, expect, test } from "bun:test";
import { classify } from "../../../../../lib/classifier.ts";

describe("localsend formulae.brew.sh cask page (Case C)", () => {
  test("classifies as homebrew-cask with token localsend", () => {
    const r = classify("https://formulae.brew.sh/cask/localsend");
    expect(r.type).toBe("homebrew-cask");
    expect(r.name).toBe("localsend");
  });
});
