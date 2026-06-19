import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectCargoPackagePayload } from "../../../lib/generators/cargo-package.ts";
import managarrFixture from "../../fixtures/github/managarr.json";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("cargo_mocked_sha256_64chars_padding_abcdef0123456789abcdef0123"),
  downloadAndHash: vi.fn().mockResolvedValue({ sha256: "mocked_sha256" }),
}));

describe("collectCargoPackagePayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const repoInfo = managarrFixture.repo;
  const release = managarrFixture.release;

  it("returns payload with correct template identifier", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.template).toBe("cargo_package");
  });

  it("derives name from repo name", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.name).toBe("managarr");
    expect(payload.className).toBe("Managarr");
  });

  it("uses repo description", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("Servarr");
  });

  it("uses repo homepage or htmlUrl", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.homepage).toContain("github.com/Dark-Viper/managarr");
  });

  it("generates source archive URL from release tag", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/Dark-Viper/managarr/archive/refs/tags/v0.5.0.tar.gz",
    );
  });

  it("computes SHA256 for source archive", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain("sha256");
  });

  it("generates license line", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates crates.io livecheck block", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.livecheckBlock).toContain("crates.io/api/v1/crates/managarr");
  });

  it("uses crateName from options when provided", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release, {
      crateName: "managarr-cli",
    });
    expect(payload.livecheckBlock).toContain("managarr-cli");
  });

  it("includes head reference to default branch", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.defaultBranch).toBe("main");
    expect(payload.fullName).toBe("Dark-Viper/managarr");
  });

  it("handles null release (no urlLines)", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, null);
    expect(payload.urlLines).toBe("");
  });

  it("respects name override", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release, {
      name: "custom-managarr",
    });
    expect(payload.name).toBe("custom-managarr");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.serviceBlock).toBe("");
  });
});
