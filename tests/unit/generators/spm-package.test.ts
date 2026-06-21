import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectSpmPackagePayload } from "../../../lib/generators/spm-package.ts";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("mocked_sha256_hash_64chars_padding_abcdef0123456789abcdef012345"),
  downloadAndHash: vi.fn().mockResolvedValue({ sha256: "mocked_sha256_hash" }),
}));

describe("collectSpmPackagePayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const repoInfo = {
    name: "Rugby",
    fullName: "swiftyfinch/Rugby",
    description: "Cache CocoaPods for faster rebuild and indexing",
    homepage: "",
    htmlUrl: "https://github.com/swiftyfinch/Rugby",
    license: "MIT",
    defaultBranch: "main",
  };

  const release = { tagName: "v2.3.1" };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.template).toBe("spm_package");
  });

  it("derives name from repo name (lowercased)", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.name).toBe("rugby");
  });

  it("derives className from name", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.className).toBe("Rugby");
  });

  it("strips v prefix from version", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain("v2.3.1.tar.gz");
    expect(payload.urlLines).not.toContain("version");
  });

  it("uses repo description", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("Cache CocoaPods");
  });

  it("preserves fullName", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.fullName).toBe("swiftyfinch/Rugby");
  });

  it("generates urlLines with release tarball URL and sha256", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/swiftyfinch/Rugby/archive/refs/tags/v2.3.1.tar.gz",
    );
    expect(payload.urlLines).toContain("sha256");
  });

  it("generates empty urlLines when release is null", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, null);
    expect(payload.urlLines).toBe("");
  });

  it("includes binInstallPaths with .build/release path", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.binInstallPaths).toContain(".build/release/Rugby");
  });

  it("changes binInstallPaths when binName is overridden", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release, {
      binName: "rugby-cli",
    });
    expect(payload.binInstallPaths).toContain(".build/release/rugby-cli");
  });

  it("respects name override", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release, {
      name: "my-rugby",
    });
    expect(payload.name).toBe("my-rugby");
  });

  it("generates license line", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("MIT");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.serviceBlock).toBe("");
  });
});
