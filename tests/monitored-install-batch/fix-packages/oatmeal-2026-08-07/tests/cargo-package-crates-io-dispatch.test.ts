import { describe, it, expect } from "bun:test";
import { classify } from "../../../lib/classifier.ts";
import { collectCargoPackagePayload } from "../../../lib/generators/cargo-package.ts";

describe("oatmeal crates.io path", () => {
  it("classifies crates.io/crates/oatmeal as cargo-package with crateName", () => {
    const r = classify("https://crates.io/crates/oatmeal");
    expect(r.type).toBe("cargo-package");
    expect(r.crateName).toBe("oatmeal");
  });

  it("builds payload from cratesMeta without GitHub repoInfo", async () => {
    const cratesMeta = {
      crateName: "oatmeal",
      version: "0.13.0",
      description: "Terminal UI to chat with large language models",
      homepage: "https://github.com/dustinblackman/oatmeal",
      repository: "https://github.com/dustinblackman/oatmeal",
      license: "MIT",
      checksum: "3b4dfda72057036f86a64dc715aec7c2a681c9feac7d416099c9ac73adabb77d",
      crateUrl: "https://static.crates.io/crates/oatmeal/oatmeal-0.13.0.crate",
      binNames: ["oatmeal"],
    };
    const payload = await collectCargoPackagePayload(null, null, {
      crateName: "oatmeal",
      cratesMeta,
      fromCratesIo: true,
    });
    expect(payload.template).toBe("cargo_package");
    expect(payload.name).toBe("oatmeal");
    expect(payload.urlLines).toContain("static.crates.io/crates/oatmeal");
    expect(payload.urlLines).toContain('version "0.13.0"');
    expect(payload.serviceBlock).toBe("");
    expect(payload.fullName).toBe("dustinblackman/oatmeal");
  });
});
