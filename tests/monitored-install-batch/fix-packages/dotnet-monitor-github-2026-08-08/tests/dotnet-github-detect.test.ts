import { describe, expect, it } from "bun:test";
import {
  detectBuildSystemFromFiles,
  detectInstallMethod,
  hasDotnetProjectMarkers,
} from "../../lib/analyzer.ts";

describe("dotnet github repo detection", () => {
  it("detects dotnet tool install -g from README", () => {
    const readme = "Install with:\n\n```\ndotnet tool install -g dotnet-monitor\n```\n";
    const method = detectInstallMethod(readme, "dotnet-monitor");
    expect(method?.method).toBe("dotnet");
    expect(method?.package).toBe("dotnet-monitor");
  });

  it("hasDotnetProjectMarkers for sln + global.json + cmake", () => {
    const files = [
      "CMakeLists.txt",
      "dotnet-monitor.sln",
      "global.json",
      "NuGet.config",
      "README.md",
    ];
    expect(hasDotnetProjectMarkers(files)).toBe(true);
    const system = detectBuildSystemFromFiles(files);
    expect(system?.method).toBe("dotnet");
  });

  it("still returns cmake when no .NET markers", () => {
    const system = detectBuildSystemFromFiles(["CMakeLists.txt", "README.md"]);
    expect(system?.method).toBe("build");
    expect(system?.system).toBe("cmake");
  });
});
