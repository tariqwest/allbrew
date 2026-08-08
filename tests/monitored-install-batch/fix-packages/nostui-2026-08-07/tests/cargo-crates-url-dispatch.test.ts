import { describe, expect, it } from "bun:test";
import { classify } from "../../../lib/classifier.ts";

describe("crates.io URL dispatch (nostui)", () => {
  it("classifies crates.io/crates/nostui as cargo-package with crateName", () => {
    const r = classify("https://crates.io/crates/nostui");
    expect(r.type).toBe("cargo-package");
    expect((r as any).crateName).toBe("nostui");
  });
});
