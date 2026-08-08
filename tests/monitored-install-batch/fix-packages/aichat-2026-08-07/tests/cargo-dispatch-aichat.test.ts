import { describe, expect, it } from "bun:test";
import { classify } from "../../../lib/classifier.ts";

describe("aichat crates.io classify", () => {
  it("classifies crates.io/aichat as cargo-package with crateName", () => {
    const r = classify("https://crates.io/crates/aichat") as any;
    expect(r.type).toBe("cargo-package");
    expect(r.crateName).toBe("aichat");
  });
});
