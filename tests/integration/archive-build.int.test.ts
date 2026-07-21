import { describe, it, expect } from "bun:test";
import { collectArchiveBuildPayload } from "../../lib/generators/archive-build.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { hashUrl } from "../../lib/sha256.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: downloads a real source archive, validates SHA + auto-detected build system.
 * Run: bun run test:int
 */

const slidesArchiveUrl =
  "https://github.com/maaslalani/slides/archive/refs/tags/v0.9.0.tar.gz";

async function slidesArchiveInfo(overrides: any = {}) {
  const sha256 = await hashUrl(slidesArchiveUrl);
  return {
    downloadUrl: slidesArchiveUrl,
    sha256,
    files: ["go.mod", "main.go", "README.md", "Makefile"],
    forcedBuildSystem: { system: "go", method: "go" },
    ...overrides,
  };
}

describe.concurrent("archive-build integration", () => {
  it("slides: payload fields are well-formed", async () => {
    const payload = await collectArchiveBuildPayload(
      await slidesArchiveInfo(),
      { name: "slides" },
    );
    expect(payload.template).toBe("archive_build");
    expect(payload.name).toBe("slides");
    expect(payload.className).toBe("Slides");
    expect(payload.url).toContain("slides/archive/refs/tags/v0.9.0.tar.gz");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("slides: generates structurally valid Ruby formula", async () => {
    const payload = await collectArchiveBuildPayload(
      await slidesArchiveInfo(),
      { name: "slides" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Slides < Formula");
    expect(ruby).toContain('depends_on "go" => :build');
    expect(ruby).toContain('system "go", "build"');
  });

  it("slides: cmake build system detected from files", async () => {
    const payload = await collectArchiveBuildPayload(
      await slidesArchiveInfo({
        files: ["CMakeLists.txt", "src/main.cpp", "README.md"],
        forcedBuildSystem: undefined,
      }),
      { name: "slides-cmake" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain('depends_on "cmake" => :build');
  });
});
