import { describe, it, expect } from "bun:test";
import renderDotnetPackage from "../../../lib/templates/formula/dotnet-package.ts";

describe("dotnet-package template layout", () => {
  it("installs tool into libexec and wraps bin with write_env_script", () => {
    const ruby = renderDotnetPackage({
      template: "dotnet_package",
      name: "dotnet-monitor",
      className: "DotnetMonitor",
      desc: "diag",
      homepage: "https://www.nuget.org/packages/dotnet-monitor/",
      packageName: '"dotnet-monitor"',
      version: "10.0.3",
      licenseLine: "",
      urlLines:
        '  url "https://www.nuget.org/api/v2/package/dotnet-monitor/10.0.3"\n' +
        '  sha256 "abc"\n' +
        '  version "10.0.3"\n',
      livecheckBlock: "",
      allbrewDependency: "",
      testBinName: "dotnet-monitor",
      serviceBlock: "",
    });
    expect(ruby).toContain('"--tool-path", libexec');
    expect(ruby).toContain("write_env_script");
    expect(ruby).toContain('nupkg_dir/"#{package_id}.#{version}.nupkg"');
    // Must not install to bin then env_script_all_files (splits .store from apphost)
    expect(ruby).not.toMatch(/"--tool-path",\s*"#\{bin\}"/);
    expect(ruby).not.toMatch(/bin\.env_script_all_files/);
  });
});
