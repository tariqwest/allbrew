import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectArchiveBuildPayload } from "../../../lib/generators/archive-build.ts";

vi.mock("../../../lib/analyzer.ts", () => ({
  detectBuildSystemFromArchive: vi.fn((files) => {
    if (files.includes("CMakeLists.txt"))
      return { method: "build", system: "cmake" };
    if (files.includes("meson.build"))
      return { method: "build", system: "meson" };
    if (files.includes("Makefile"))
      return { method: "build", system: "make" };
    return null;
  }),
}));

describe("collectArchiveBuildPayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const archiveInfo = {
    downloadUrl: "https://example.com/mylib-2.0.tar.gz",
    sha256: "srcarch_sha256_64chars_pad_abcdef0123456789abcdef0123456789abcdef",
    files: ["CMakeLists.txt", "src/main.c", "README.md"],
  };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo);
    expect(payload.template).toBe("archive_build");
  });

  it("derives name from download URL", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo);
    expect(payload.name).toBe("mylib");
  });

  it("generates description from base name", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo);
    expect(payload.desc).toContain("mylib");
    expect(payload.desc).toContain("source archive");
  });

  it("uses download URL as homepage", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo);
    expect(payload.homepage).toContain("example.com/mylib-2.0.tar.gz");
  });

  it("uses provided SHA256", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo);
    expect(payload.sha256).toContain("srcarch_sha256");
  });

  it("detects cmake build system and generates deps", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo);
    expect(payload.dependenciesLines).toContain("cmake");
    expect(payload.dependenciesLines).toContain(":build");
  });

  it("generates cmake install body", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo);
    expect(payload.installBody).toContain("cmake");
  });

  it("detects meson build system", async () => {
    const mesonArchive = {
      ...archiveInfo,
      files: ["meson.build", "src/main.c"],
    };
    const payload = await collectArchiveBuildPayload(mesonArchive);
    expect(payload.dependenciesLines).toContain("meson");
    expect(payload.dependenciesLines).toContain("ninja");
    expect(payload.installBody).toContain("meson");
  });

  it("generates livecheck block", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo);
    expect(payload.livecheckBlock).toContain("livecheck do");
  });

  it("omits allbrew dependency", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo);
    expect(payload.allbrewDependency).toBe("");
  });

  it("respects name override", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo, {
      name: "custom-lib",
    });
    expect(payload.name).toBe("custom-lib");
  });

  it("respects desc override", async () => {
    const payload = await collectArchiveBuildPayload(archiveInfo, {
      desc: "Custom description",
    });
    expect(payload.desc).toBe("Custom description");
  });

  it("uses forcedBuildSystem when provided", async () => {
    const forced = {
      ...archiveInfo,
      forcedBuildSystem: { method: "build", system: "meson" },
    };
    const payload = await collectArchiveBuildPayload(forced);
    expect(payload.installBody).toContain("meson");
  });
});
