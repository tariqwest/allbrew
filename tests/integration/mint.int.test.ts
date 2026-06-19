import { describe, it, expect } from "vitest";
import { collectMintPayload } from "../../lib/generators/mint.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: fetches real GitHub repo data, validates payload + Ruby output.
 * Run: bun run test:int
 */

const iblinterRepoInfo = {
  name: "iblinter",
  fullName: "IBDecodable/IBLinter",
  description: "A tool to lint XIB and Storyboard files",
  homepage: "https://github.com/IBDecodable/IBLinter",
  htmlUrl: "https://github.com/IBDecodable/IBLinter",
  license: "MIT",
  defaultBranch: "main",
};

const iblinterRelease = {
  tagName: "0.5.0",
  tarballUrl:
    "https://github.com/IBDecodable/IBLinter/archive/refs/tags/0.5.0.tar.gz",
};

const mockoloRepoInfo = {
  name: "mockolo",
  fullName: "uber/mockolo",
  description: "A Swift mock generator for Swift code generation",
  homepage: "https://github.com/uber/mockolo",
  htmlUrl: "https://github.com/uber/mockolo",
  license: "MIT",
  defaultBranch: "main",
};

const swiftOutdatedRepoInfo = {
  name: "swift-outdated",
  fullName: "kiliankoe/swift-outdated",
  description: "Check for outdated Swift Package Manager dependencies",
  homepage: "https://github.com/kiliankoe/swift-outdated",
  htmlUrl: "https://github.com/kiliankoe/swift-outdated",
  license: "MIT",
  defaultBranch: "main",
};

const licensePlistRepoInfo = {
  name: "licenseplist",
  fullName: "mono0926/LicensePlist",
  description: "A license list generator for iOS apps",
  homepage: "https://github.com/mono0926/LicensePlist",
  htmlUrl: "https://github.com/mono0926/LicensePlist",
  license: "MIT",
  defaultBranch: "main",
};

const bartyCrouchRepoInfo = {
  name: "bartycrouch",
  fullName: "FlineDev/BartyCrouch",
  description: "Incrementally update/translate your Strings files from code and interfaces",
  homepage: "https://github.com/FlineDev/BartyCrouch",
  htmlUrl: "https://github.com/FlineDev/BartyCrouch",
  license: "MIT",
  defaultBranch: "main",
};

describe.concurrent("mint integration", () => {
  it("iblinter: payload fields are well-formed (with release)", async () => {
    const payload = await collectMintPayload(iblinterRepoInfo, iblinterRelease);
    expect(payload.template).toBe("mint");
    expect(payload.name).toBe("iblinter");
    expect(payload.className).toBe("Iblinter");
    expect(payload.fullName).toBe("IBDecodable/IBLinter");
    expect(payload.binName).toBe("iblinter");
  });

  it("iblinter: generates structurally valid Ruby formula", async () => {
    const payload = await collectMintPayload(iblinterRepoInfo, iblinterRelease);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Iblinter < Formula");
    expect(ruby).toContain('depends_on "mint"');
    expect(ruby).toContain("mint");
    expect(ruby).toContain("IBDecodable/IBLinter@");
    expect(ruby).toContain("MINT_PATH");
    expect(ruby).toContain("sha256");
  });

  it("iblinter: head-only mode (no release)", async () => {
    const payload = await collectMintPayload(iblinterRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("head \"https://github.com/IBDecodable/IBLinter.git");
  });

  it("mockolo: generates valid formula (head-only)", async () => {
    const payload = await collectMintPayload(mockoloRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Mockolo < Formula");
    expect(ruby).toContain('depends_on "mint"');
  });

  it("swift-outdated: generates valid formula (head-only)", async () => {
    const payload = await collectMintPayload(swiftOutdatedRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class SwiftOutdated < Formula");
  });

  it("licenseplist: generates valid formula (head-only)", async () => {
    const payload = await collectMintPayload(licensePlistRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Licenseplist < Formula");
  });

  it("bartycrouch: generates valid formula (head-only)", async () => {
    const payload = await collectMintPayload(bartyCrouchRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Bartycrouch < Formula");
  });
});
