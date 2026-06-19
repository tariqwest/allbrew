import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectBuildFromSourcePayload } from "../../../lib/generators/build-from-source.ts";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("bfs_sha256_mock_64chars_padding_abcdef0123456789abcdef01234567"),
  downloadAndHash: vi.fn().mockResolvedValue({ sha256: "mocked_sha256" }),
}));

describe("collectBuildFromSourcePayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const repoInfo = {
    name: "myproject",
    fullName: "user/myproject",
    description: "A build-from-source project",
    homepage: "https://myproject.dev",
    htmlUrl: "https://github.com/user/myproject",
    license: "MIT",
    defaultBranch: "main",
  };

  const release = {
    tagName: "v1.5.0",
    tarballUrl: null,
  };

  const buildSystem = { system: "cmake" };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectBuildFromSourcePayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.template).toBe("build_from_source");
  });

  it("derives name from repo name", async () => {
    const payload = await collectBuildFromSourcePayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.name).toBe("myproject");
    expect(payload.className).toBe("Myproject");
  });

  it("generates source URL from release tag", async () => {
    const payload = await collectBuildFromSourcePayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.urlLines).toContain(
      "https://github.com/user/myproject/archive/refs/tags/v1.5.0.tar.gz",
    );
  });

  it("generates cmake install body for cmake build system", async () => {
    const payload = await collectBuildFromSourcePayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.installBody).toContain("cmake");
  });

  it("generates empty urlLines when no release", async () => {
    const payload = await collectBuildFromSourcePayload(
      repoInfo,
      null,
      buildSystem,
    );
    expect(payload.urlLines).toBe("");
  });

  it("uses repo description", async () => {
    const payload = await collectBuildFromSourcePayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.desc).toBe("A build-from-source project");
  });

  it("includes license line", async () => {
    const payload = await collectBuildFromSourcePayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.licenseLine).toContain("MIT");
  });

  it("includes head reference", async () => {
    const payload = await collectBuildFromSourcePayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.fullName).toBe("user/myproject");
    expect(payload.defaultBranch).toBe("main");
  });

  it("respects name override", async () => {
    const payload = await collectBuildFromSourcePayload(
      repoInfo,
      release,
      buildSystem,
      { name: "custom-name" },
    );
    expect(payload.name).toBe("custom-name");
  });
});
