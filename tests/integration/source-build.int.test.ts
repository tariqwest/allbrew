import { describe, it, expect } from "vitest";
import { collectSourceBuildPayload } from "../../lib/generators/source-build.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: downloads real GitHub source tarballs, validates SHA + Ruby output.
 * Run: bun run test:int
 */

const slidesRepoInfo = {
  name: "slides",
  fullName: "maaslalani/slides",
  description: "Terminal based presentation tool",
  homepage: "https://github.com/maaslalani/slides",
  htmlUrl: "https://github.com/maaslalani/slides",
  license: "MIT",
  defaultBranch: "main",
};

const slidesRelease = {
  tagName: "v0.9.0",
  tarballUrl: "https://github.com/maaslalani/slides/archive/refs/tags/v0.9.0.tar.gz",
};

describe.concurrent("source-build integration", () => {
  it("slides: payload fields are well-formed", async () => {
    const payload = await collectSourceBuildPayload(
      slidesRepoInfo,
      slidesRelease,
      { system: "go" },
    );
    expect(payload.template).toBe("source_build");
    expect(payload.name).toBe("slides");
    expect(payload.className).toBe("Slides");
    expect(payload.urlLines).toContain("github.com/maaslalani/slides/archive/refs/tags/v0.9.0.tar.gz");
    expect(payload.urlLines).toMatch(/sha256 "[a-f0-9]{64}"/);
  });

  it("slides: generates structurally valid Ruby formula", async () => {
    const payload = await collectSourceBuildPayload(
      slidesRepoInfo,
      slidesRelease,
      { system: "go" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Slides < Formula");
    expect(ruby).toContain('depends_on "go" => :build');
    expect(ruby).toContain('system "go", "build"');
  });

  it("slides: cmake build system emits cmake deps", async () => {
    const payload = await collectSourceBuildPayload(
      slidesRepoInfo,
      slidesRelease,
      { system: "cmake" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain('depends_on "cmake" => :build');
    expect(ruby).toContain('system "cmake"');
  });

  it("slides: HEAD release omits url and uses head stanza", async () => {
    const payload = await collectSourceBuildPayload(
      slidesRepoInfo,
      null,
      { system: "go" },
    );
    expect(payload.urlLines).toBe("");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain('head "https://github.com/maaslalani/slides.git"');
  });
});
