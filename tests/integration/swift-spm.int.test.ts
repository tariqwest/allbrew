import { describe, it, expect } from "vitest";
import { collectSwiftSpmPayload } from "../../lib/generators/swift-spm.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: fetches real GitHub repo data, validates payload + Ruby output.
 * Run: bun run test:int
 */

const rugbyRepoInfo = {
  name: "rugby",
  fullName: "swiftyfinch/Rugby",
  description: "Cache CocoaPods for faster rebuild and Xcode indexing",
  homepage: "https://github.com/swiftyfinch/Rugby",
  htmlUrl: "https://github.com/swiftyfinch/Rugby",
  license: "MIT",
  defaultBranch: "main",
};

const rugbyRelease = {
  tagName: "2.5.0",
  tarballUrl:
    "https://github.com/swiftyfinch/Rugby/archive/refs/tags/2.5.0.tar.gz",
};

const doeditRepoInfo = {
  name: "doedit",
  fullName: "wendyliga/doedit",
  description: "A delightful CLI tool to batch edit text files",
  homepage: "https://github.com/wendyliga/doedit",
  htmlUrl: "https://github.com/wendyliga/doedit",
  license: "MIT",
  defaultBranch: "main",
};

const swiftpolyglotRepoInfo = {
  name: "swiftpolyglot",
  fullName: "fwcd/SwiftPolyglot",
  description: "A CLI tool to generate Swift localization code",
  homepage: "https://github.com/fwcd/SwiftPolyglot",
  htmlUrl: "https://github.com/fwcd/SwiftPolyglot",
  license: "MIT",
  defaultBranch: "main",
};

describe.concurrent("swift-spm integration", () => {
  it("rugby: payload fields are well-formed (with release)", async () => {
    const payload = await collectSwiftSpmPayload(rugbyRepoInfo, rugbyRelease);
    expect(payload.template).toBe("swift_spm");
    expect(payload.name).toBe("rugby");
    expect(payload.className).toBe("Rugby");
    expect(payload.binInstallPaths).toContain("rugby");
  });

  it("rugby: generates structurally valid Ruby formula", async () => {
    const payload = await collectSwiftSpmPayload(rugbyRepoInfo, rugbyRelease);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Rugby < Formula");
    expect(ruby).toContain("depends_on \"swift\" => :build");
    expect(ruby).toContain("swift");
    expect(ruby).toContain("sha256");
  });

  it("rugby: head-only mode (no release)", async () => {
    const payload = await collectSwiftSpmPayload(rugbyRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("head \"https://github.com/swiftyfinch/Rugby.git");
  });

  it("doedit: generates valid formula (head-only)", async () => {
    const payload = await collectSwiftSpmPayload(doeditRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Doedit < Formula");
    expect(ruby).toContain("depends_on \"swift\" => :build");
  });

  it("swiftpolyglot: generates valid formula (head-only)", async () => {
    const payload = await collectSwiftSpmPayload(swiftpolyglotRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Swiftpolyglot < Formula");
  });
});
