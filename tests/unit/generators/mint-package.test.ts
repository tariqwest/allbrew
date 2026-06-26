import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectMintPackagePayload } from "../../../lib/generators/mint-package.ts";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("mocked_sha256_hash_64chars_padding_abcdef0123456789abcdef012345"),
  downloadAndHash: vi.fn().mockResolvedValue({ sha256: "mocked_sha256_hash" }),
}));

describe("collectMintPackagePayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const repoInfo = {
    name: "IBLinter",
    fullName: "IBDecodable/IBLinter",
    description: "A linter tool for Interface Builder",
    homepage: "",
    htmlUrl: "https://github.com/IBDecodable/IBLinter",
    license: "MIT",
    defaultBranch: "main",
  };

  const release = { tagName: "0.5.0" };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.template).toBe("mint_package");
  });

  it("derives name from repo name (lowercased)", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.name).toBe("iblinter");
  });

  it("derives className from name", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.className).toBe("Iblinter");
  });

  it("uses repo description", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("linter tool for Interface Builder");
  });

  it("preserves fullName", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.fullName).toBe("IBDecodable/IBLinter");
  });

  it("preserves defaultBranch", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.defaultBranch).toBe("main");
  });

  it("generates license line", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates urlLines when release is provided", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/IBDecodable/IBLinter/archive/refs/tags/0.5.0.tar.gz",
    );
    expect(payload.urlLines).toContain("sha256");
  });

  it("generates empty urlLines when release is null", async () => {
    const payload = await collectMintPackagePayload(repoInfo, null);
    expect(payload.urlLines).toBe("");
  });

  it("defaults binName to repoInfo.name", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.binName).toBe("IBLinter");
  });

  it("respects binName override", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release, {
      binName: "iblint",
    });
    expect(payload.binName).toBe("iblint");
  });

  it("respects name override", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release, {
      name: "my-linter",
    });
    expect(payload.name).toBe("my-linter");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.serviceBlock).toBe("");
  });
});

describe("collectMintPackagePayload — mockolo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const repoInfo = {
    name: "mockolo",
    fullName: "uber/mockolo",
    description: "Efficient Mock Generator for Swift",
    homepage: "",
    htmlUrl: "https://github.com/uber/mockolo",
    license: "Apache-2.0",
    defaultBranch: "master",
  };

  const release = { tagName: "2.1.1" };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.template).toBe("mint_package");
  });

  it("derives name from repo name", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.name).toBe("mockolo");
    expect(payload.className).toBe("Mockolo");
  });

  it("uses repo description", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("Mock Generator");
  });

  it("uses htmlUrl as homepage when homepage is empty", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.homepage).toContain("github.com/uber/mockolo");
  });

  it("generates Apache-2.0 license line", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("Apache-2.0");
  });

  it("includes fullName for mint install reference", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.fullName).toBe("uber/mockolo");
  });

  it("uses master as default branch", async () => {
    const payload = await collectMintPackagePayload(repoInfo, release);
    expect(payload.defaultBranch).toBe("master");
  });
});
