import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectDotnetPackagePayload } from "../../../lib/generators/dotnet-package.ts";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("mocked_sha256_hash_64chars_padding_abcdef0123456789abcdef012345"),
  downloadAndHash: mock().mockResolvedValue({ sha256: "mocked_sha256_hash" }),
}));

describe("collectDotnetPackagePayload", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock((url: string) => {
      if (url.includes("nuget.org") && url.includes("dotnet-serve")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ versions: ["1.0.0", "1.1.0", "2.0.0"] }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
      });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.template).toBe("dotnet_package");
  });

  it("extracts name from package name", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.name).toBe("dotnet-serve");
  });

  it("derives className from name", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.className).toBe("DotnetServe");
  });

  it("uses repoInfo description", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve", {
      description: "A simple command-line HTTP server",
    });
    expect(payload.desc).toContain("simple command-line HTTP server");
  });

  it("uses repoInfo homepage", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve", {
      homepage: "https://github.com/natemcmaster/dotnet-serve",
      htmlUrl: "https://github.com/natemcmaster/dotnet-serve",
    });
    expect(payload.homepage).toBe("https://github.com/natemcmaster/dotnet-serve");
  });

  it("falls back to NuGet URL for homepage when no repoInfo", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.homepage).toContain("nuget.org/packages/dotnet-serve");
  });

  it("uses last version from versions array", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.version).toBe("2.0.0");
  });

  it("generates NuGet livecheck block", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.livecheckBlock).toContain("nuget.org");
    expect(payload.livecheckBlock).toContain("dotnet-serve");
    expect(payload.livecheckBlock).toContain("livecheck do");
  });

  it("respects name override", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve", null, {
      name: "my-serve",
    });
    expect(payload.name).toBe("my-serve");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve");
    expect(payload.serviceBlock).toBe("");
  });

  it("includes service block when configured", async () => {
    const payload = await collectDotnetPackagePayload("dotnet-serve", null, {
      service: true,
      serviceCommand: "dotnet-serve",
    });
    expect(payload.serviceBlock).toContain("service do");
  });

  it("throws when NuGet registry returns non-OK", async () => {
    await expect(
      collectDotnetPackagePayload("nonexistent-pkg-xyz"),
    ).rejects.toThrow("NuGet lookup failed");
  });
});

describe("collectDotnetPackagePayload — CSharpRepl", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock((url: string) => {
      if (url.includes("nuget.org") && url.includes("csharprepl")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ versions: ["0.5.0", "0.6.0", "0.7.0"] }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectDotnetPackagePayload("CSharpRepl");
    expect(payload.template).toBe("dotnet_package");
  });

  it("derives name from package name", async () => {
    const payload = await collectDotnetPackagePayload("CSharpRepl");
    expect(payload.name).toBe("csharprepl");
  });

  it("generates NuGet livecheck block", async () => {
    const payload = await collectDotnetPackagePayload("CSharpRepl");
    expect(payload.livecheckBlock).toContain("nuget.org");
    expect(payload.livecheckBlock).toContain("csharprepl");
  });

  it("uses latest version from NuGet versions array", async () => {
    const payload = await collectDotnetPackagePayload("CSharpRepl");
    expect(payload.version).toBe("0.7.0");
  });
});
