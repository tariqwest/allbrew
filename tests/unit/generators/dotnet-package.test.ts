import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { collectDotnetPackagePayload } from "../../../lib/generators/dotnet-package.ts";

const MOCK_SHA256 =
  "mocked_sha256_hash_64chars_padding_abcdef0123456789abcdef012345";

let nupkgPath: string;
let tempDir: string;

async function makeNupkg(contents: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "allbrew-dotnet-test-"));
  for (const [name, data] of Object.entries(contents)) {
    const filePath = join(dir, name);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }
  if (Object.keys(contents).length === 0) {
    await writeFile(join(dir, ".keep"), "");
  }
  const nupkg = join(dir, "test.nupkg");
  execFileSync("zip", ["-q", "-r", nupkg, "."], { cwd: dir, timeout: 30_000 });
  return nupkg;
}

function dotNetToolSettingsXml(commandName: string, rids: string[] = []): string {
  let ridXml = "";
  if (rids.length) {
    ridXml = "  <RuntimeIdentifierPackages>\n" +
      rids.map((rid) => `    <RuntimeIdentifierPackage RuntimeIdentifier="${rid}" Id="X.${rid}" />`).join("\n") +
      "\n  </RuntimeIdentifierPackages>\n";
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<DotNetCliTool Version="1">
  <Commands>
    <Command Name="${commandName}" EntryPoint="${commandName}.dll" Runner="dotnet" />
  </Commands>
${ridXml}</DotNetCliTool>`;
}

function nuspecXml(
  id: string,
  version: string,
  opts: { tool?: boolean; repoUrl?: string } = {},
): string {
  const toolTypes = opts.tool
    ? "    <packageTypes>\n      <packageType name=\"DotnetTool\" />\n    </packageTypes>\n"
    : "";
  const repo = opts.repoUrl
    ? `    <repository type="git" url="${opts.repoUrl}" />\n`
    : "";
  return `<?xml version="1.0"?>
<package>
  <metadata>
    <id>${id}</id>
    <version>${version}</version>
    <description>${id}</description>
${toolTypes}${repo}  </metadata>
</package>`;
}

function mockFetch(
  packageId: string,
  versions: string[],
  nuspec: string,
) {
  global.fetch = mock((url: string) => {
    const u = String(url);
    if (u.includes("/index.json") && u.includes(packageId.toLowerCase())) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ versions }),
      });
    }
    if (u.endsWith(".nuspec") && u.includes(packageId.toLowerCase())) {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(nuspec),
      });
    }
    return Promise.resolve({ ok: false, status: 404 });
  }) as any;
}

function mockDownloadToTemp(nupkg: string) {
  mock.module("../../../lib/sha256.ts", () => ({
    downloadToTemp: mock().mockResolvedValue({
      sha256: MOCK_SHA256,
      path: nupkg,
      cleanup: async () => {},
    }),
    downloadAndHash: mock().mockResolvedValue({ sha256: MOCK_SHA256 }),
    hashUrl: mock().mockResolvedValue(MOCK_SHA256),
  }));
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  mock.restore();
});

describe("collectDotnetPackagePayload", () => {
  beforeEach(() => {
    mock.restore();
    nupkgPath = "";
    tempDir = "";
  });

  it("returns payload with correct template identifier", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0", "1.1.0", "2.0.0"], nuspecXml(
      "dotnet-serve",
      "2.0.0",
      { tool: true },
    ));
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.template).toBe("dotnet_package");
  });

  it("extracts name from package name", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0", "1.1.0", "2.0.0"], nuspecXml(
      "dotnet-serve",
      "2.0.0",
      { tool: true },
    ));
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.name).toBe("dotnet-serve");
  });

  it("derives className from name", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0", "1.1.0", "2.0.0"], nuspecXml(
      "dotnet-serve",
      "2.0.0",
      { tool: true },
    ));
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.className).toBe("DotnetServe");
  });

  it("uses repoInfo description", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0", "1.1.0", "2.0.0"], nuspecXml(
      "dotnet-serve",
      "2.0.0",
      { tool: true },
    ));
    const payload = await collectDotnetPackagePayload("dotnet-serve", {
      description: "A simple command-line HTTP server",
    });
    expect(payload.desc).toContain("simple command-line HTTP server");
  });

  it("uses repoInfo homepage", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0", "1.1.0", "2.0.0"], nuspecXml(
      "dotnet-serve",
      "2.0.0",
      { tool: true },
    ));
    const payload = await collectDotnetPackagePayload("dotnet-serve", {
      homepage: "https://github.com/natemcmaster/dotnet-serve",
      htmlUrl: "https://github.com/natemcmaster/dotnet-serve",
    });
    expect(payload.homepage).toBe("https://github.com/natemcmaster/dotnet-serve");
  });

  it("falls back to NuGet URL for homepage when no repoInfo", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0", "1.1.0", "2.0.0"], nuspecXml(
      "dotnet-serve",
      "2.0.0",
      { tool: true },
    ));
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.homepage).toContain("nuget.org/packages/dotnet-serve");
  });

  it("uses latest stable version from versions array", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch(
      "dotnet-serve",
      ["1.0.0", "1.1.0", "2.0.0-preview.1", "2.0.0"],
      nuspecXml("dotnet-serve", "2.0.0", { tool: true }),
    );
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.version).toBe("2.0.0");
  });

  it("prefers stable version and skips pre-releases", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "smtp4dev",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch(
      "rnwood.smtp4dev",
      ["3.0.0", "3.1.0-beta", "3.1.0"],
      nuspecXml("Rnwood.Smtp4dev", "3.1.0", { tool: true }),
    );
    const payload = await collectDotnetPackagePayload("Rnwood.Smtp4dev");
    expect(payload.version).toBe("3.1.0");
  });

  it("generates NuGet livecheck block", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0", "1.1.0", "2.0.0"], nuspecXml(
      "dotnet-serve",
      "2.0.0",
      { tool: true },
    ));
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.livecheckBlock).toContain("nuget.org");
    expect(payload.livecheckBlock).toContain("dotnet-serve");
    expect(payload.livecheckBlock).toContain("livecheck do");
  });

  it("respects name override", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0", "1.1.0", "2.0.0"], nuspecXml(
      "dotnet-serve",
      "2.0.0",
      { tool: true },
    ));
    const payload = await collectDotnetPackagePayload("dotnet-serve", null, {
      name: "my-serve",
    });
    expect(payload.name).toBe("my-serve");
  });

  it("includes empty service block by default", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0", "1.1.0", "2.0.0"], nuspecXml(
      "dotnet-serve",
      "2.0.0",
      { tool: true },
    ));
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.serviceBlock).toBe("");
  });

  it("includes service block when configured", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0", "1.1.0", "2.0.0"], nuspecXml(
      "dotnet-serve",
      "2.0.0",
      { tool: true },
    ));
    const payload = await collectDotnetPackagePayload("dotnet-serve", null, {
      service: true,
      serviceCommand: "dotnet-serve",
    });
    expect(payload.serviceBlock).toContain("service do");
  });

  it("throws when NuGet registry returns non-OK", async () => {
    mockDownloadToTemp(await makeNupkg({}));
    global.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 404 })
    ) as any;
    await expect(
      collectDotnetPackagePayload("nonexistent-pkg-xyz"),
    ).rejects.toThrow("NuGet lookup failed");
  });

  it("throws when package is not a DotnetTool (library nuspec)", async () => {
    nupkgPath = await makeNupkg({});
    mockDownloadToTemp(nupkgPath);
    mockFetch(
      "depotdownloader",
      ["2.7.5"],
      nuspecXml("DepotDownloader", "2.7.5", {
        tool: false,
        repoUrl: "https://github.com/SteamRE/DepotDownloader",
      }),
    );
    await expect(
      collectDotnetPackagePayload("DepotDownloader"),
    ).rejects.toThrow(/not a \.NET global tool|missing packageType DotnetTool/);
  });

  it("hints GitHub release URL for non-tool packages with repository", async () => {
    nupkgPath = await makeNupkg({});
    mockDownloadToTemp(nupkgPath);
    mockFetch(
      "depotdownloader",
      ["2.7.5"],
      nuspecXml("DepotDownloader", "2.7.5", {
        tool: false,
        repoUrl: "https://github.com/SteamRE/DepotDownloader",
      }),
    );
    await expect(
      collectDotnetPackagePayload("DepotDownloader"),
    ).rejects.toThrow("https://github.com/SteamRE/DepotDownloader");
  });

  it("throws when nuspec lookup fails", async () => {
    nupkgPath = await makeNupkg({});
    mockDownloadToTemp(nupkgPath);
    global.fetch = mock((url: string) => {
      const u = String(url);
      if (u.endsWith("/index.json") && u.includes("dotnet-serve")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ versions: ["2.0.0"] }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as any;
    await expect(collectDotnetPackagePayload("dotnet-serve")).rejects.toThrow(
      "NuGet nuspec lookup failed",
    );
  });

  it("extracts tool command from DotnetToolSettings.xml", async () => {
    nupkgPath = await makeNupkg({
      "tools/net10.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "smtp4dev",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch(
      "rnwood.smtp4dev",
      ["3.0.0", "3.1.0"],
      nuspecXml("Rnwood.Smtp4dev", "3.1.0", { tool: true }),
    );
    const payload = await collectDotnetPackagePayload("Rnwood.Smtp4dev");
    expect(payload.toolCommand).toBe('"smtp4dev"');
    expect(payload.testBinName).toBe("rnwood-smtp4dev");
  });

  it("rejects packages with no macOS runtime identifier support", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "winonlytool",
        ["win-x64", "win-arm64"],
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("winonlytool", ["1.0.0"], nuspecXml("WinOnlyTool", "1.0.0", {
      tool: true,
    }));
    await expect(
      collectDotnetPackagePayload("WinOnlyTool"),
    ).rejects.toThrow("does not provide a macOS runtime identifier");
  });

  it("accepts packages that only list the 'any' runtime identifier", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "smtp4dev",
        ["any"],
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("rnwood.smtp4dev", ["3.0.0"], nuspecXml("Rnwood.Smtp4dev", "3.0.0", {
      tool: true,
    }));
    const payload = await collectDotnetPackagePayload("Rnwood.Smtp4dev");
    expect(payload.toolCommand).toBe('"smtp4dev"');
  });

  it("includes DOTNET_ROLL_FORWARD in the rollForward field", async () => {
    nupkgPath = await makeNupkg({
      "tools/net8.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "dotnet-serve",
      ),
    });
    mockDownloadToTemp(nupkgPath);
    mockFetch("dotnet-serve", ["1.0.0"], nuspecXml("dotnet-serve", "1.0.0", {
      tool: true,
    }));
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.rollForward).toBe("LatestMajor");
  });
});

describe("collectDotnetPackagePayload — CSharpRepl", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("returns payload with correct template identifier", async () => {
    const nupkg = await makeNupkg({
      "tools/net10.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "csharprepl",
        ["any", "osx-x64", "osx-arm64"],
      ),
    });
    mockDownloadToTemp(nupkg);
    mockFetch(
      "csharprepl",
      ["0.5.0", "0.6.0", "0.7.0"],
      nuspecXml("CSharpRepl", "0.7.0", { tool: true }),
    );
    const payload = await collectDotnetPackagePayload("CSharpRepl");
    expect(payload.template).toBe("dotnet_package");
  });

  it("derives name from package name", async () => {
    const nupkg = await makeNupkg({
      "tools/net10.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "csharprepl",
        ["any", "osx-x64", "osx-arm64"],
      ),
    });
    mockDownloadToTemp(nupkg);
    mockFetch(
      "csharprepl",
      ["0.5.0", "0.6.0", "0.7.0"],
      nuspecXml("CSharpRepl", "0.7.0", { tool: true }),
    );
    const payload = await collectDotnetPackagePayload("CSharpRepl");
    expect(payload.name).toBe("csharprepl");
  });

  it("generates NuGet livecheck block", async () => {
    const nupkg = await makeNupkg({
      "tools/net10.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "csharprepl",
        ["any", "osx-x64", "osx-arm64"],
      ),
    });
    mockDownloadToTemp(nupkg);
    mockFetch(
      "csharprepl",
      ["0.5.0", "0.6.0", "0.7.0"],
      nuspecXml("CSharpRepl", "0.7.0", { tool: true }),
    );
    const payload = await collectDotnetPackagePayload("CSharpRepl");
    expect(payload.livecheckBlock).toContain("nuget.org");
    expect(payload.livecheckBlock).toContain("csharprepl");
  });

  it("uses latest version from NuGet versions array", async () => {
    const nupkg = await makeNupkg({
      "tools/net10.0/any/DotnetToolSettings.xml": dotNetToolSettingsXml(
        "csharprepl",
        ["any", "osx-x64", "osx-arm64"],
      ),
    });
    mockDownloadToTemp(nupkg);
    mockFetch(
      "csharprepl",
      ["0.5.0", "0.6.0", "0.7.0"],
      nuspecXml("CSharpRepl", "0.7.0", { tool: true }),
    );
    const payload = await collectDotnetPackagePayload("CSharpRepl");
    expect(payload.version).toBe("0.7.0");
  });
});
