import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectDotnetToolPayload } from "../../../lib/generators/dotnet-tool.ts";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("mocked_sha256_hash_64chars_padding_abcdef0123456789abcdef012345"),
  downloadAndHash: vi.fn().mockResolvedValue({ sha256: "mocked_sha256_hash" }),
}));

describe("collectDotnetToolPayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn((url: string) => {
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
    const payload = await collectDotnetToolPayload("dotnet-serve");
    expect(payload.template).toBe("dotnet_tool");
  });

  it("extracts name from package name", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve");
    expect(payload.name).toBe("dotnet-serve");
  });

  it("derives className from name", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve");
    expect(payload.className).toBe("DotnetServe");
  });

  it("uses repoInfo description", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve", {
      description: "A simple command-line HTTP server",
    });
    expect(payload.desc).toContain("simple command-line HTTP server");
  });

  it("uses repoInfo homepage", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve", {
      homepage: "https://github.com/natemcmaster/dotnet-serve",
      htmlUrl: "https://github.com/natemcmaster/dotnet-serve",
    });
    expect(payload.homepage).toBe("https://github.com/natemcmaster/dotnet-serve");
  });

  it("falls back to NuGet URL for homepage when no repoInfo", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve");
    expect(payload.homepage).toContain("nuget.org/packages/dotnet-serve");
  });

  it("uses last version from versions array", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve");
    expect(payload.version).toBe("2.0.0");
  });

  it("generates NuGet livecheck block", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve");
    expect(payload.livecheckBlock).toContain("nuget.org");
    expect(payload.livecheckBlock).toContain("dotnet-serve");
    expect(payload.livecheckBlock).toContain("livecheck do");
  });

  it("respects name override", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve", null, {
      name: "my-serve",
    });
    expect(payload.name).toBe("my-serve");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve");
    expect(payload.serviceBlock).toBe("");
  });

  it("includes service block when configured", async () => {
    const payload = await collectDotnetToolPayload("dotnet-serve", null, {
      service: true,
      serviceCommand: "dotnet-serve",
    });
    expect(payload.serviceBlock).toContain("service do");
  });

  it("throws when NuGet registry returns non-OK", async () => {
    await expect(
      collectDotnetToolPayload("nonexistent-pkg-xyz"),
    ).rejects.toThrow("NuGet lookup failed");
  });
});
