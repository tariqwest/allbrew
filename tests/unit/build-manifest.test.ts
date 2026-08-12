import { describe, expect, it } from "bun:test";
import { buildManifest } from "../../lib/build-manifest.ts";
import type { GeneratorName } from "../../lib/manifest.ts";

const repoInfo = {
  name: "ExampleTool",
  fullName: "owner/example-tool",
  defaultBranch: "main",
};

const release = {
  tagName: "v1.2.3",
};

function manifestFor(generatorName: GeneratorName, params = {}) {
  return buildManifest({
    generatorName,
    params: { repoInfo, release, ...params },
    opts: { tapPath: "/tmp/tap" },
    result: { name: "example-tool", type: "formula" },
  });
}

describe("buildManifest", () => {
  it("persists source data for SPM packages", () => {
    const manifest = manifestFor("spm-package");
    expect(manifest.source).toEqual({
      fullName: "owner/example-tool",
      defaultBranch: "main",
      releaseTag: "v1.2.3",
    });
    expect(manifest.recordedVersion).toBe("1.2.3");
  });

  it("persists source data for dotnet packages", () => {
    const manifest = manifestFor("dotnet-package", {
      packageName: "example.tool",
    });
    expect(manifest.source).toEqual({
      packageName: "example.tool",
      fullName: "owner/example-tool",
    });
  });

  it("persists source data for gem packages", () => {
    const manifest = manifestFor("gem-package", {
      gemName: "example_tool",
    });
    expect(manifest.source).toEqual({
      gemName: "example_tool",
      fullName: "owner/example-tool",
    });
  });

  it("persists source data for mint packages", () => {
    const manifest = manifestFor("mint-package");
    expect(manifest.source).toEqual({
      fullName: "owner/example-tool",
      defaultBranch: "main",
      releaseTag: "v1.2.3",
    });
    expect(manifest.recordedVersion).toBe("1.2.3");
  });

  it("persists source data for Setapp casks", () => {
    const manifest = buildManifest({
      generatorName: "cask-app-setapp",
      params: {
        url: "https://setapp.com/apps/bartender",
        version: "6.5.2",
        appName: "Bartender Pro",
      },
      opts: { tapPath: "/tmp/tap" },
      result: { name: "bartender", type: "cask", recordedVersion: "6.5.2" },
    });
    expect(manifest.source).toEqual({
      setappUrl: "https://setapp.com/apps/bartender",
      appName: "Bartender Pro",
    });
    expect(manifest.recordedVersion).toBe("6.5.2");
    expect(manifest.kind).toBe("cask");
    expect(manifest.generator).toBe("cask-app-setapp");
  });
});
