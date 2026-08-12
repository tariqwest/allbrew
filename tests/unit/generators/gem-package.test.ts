import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectGemPackagePayload } from "../../../lib/generators/gem-package.ts";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("mocked_sha256_hash_64chars_padding_abcdef0123456789abcdef012345"),
  downloadAndHash: mock().mockResolvedValue({ sha256: "mocked_sha256_hash" }),
}));

describe("collectGemPackagePayload", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock((url: string) => {
      if (url.includes("rubygems.org") && url.includes("/pry")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              version: "0.14.2",
              gem_uri: "https://rubygems.org/gems/pry-0.14.2.gem",
              info: "A runtime developer console",
              homepage_uri: "https://pry.github.io",
              licenses: ["MIT"],
            }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
      });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectGemPackagePayload("pry");
    expect(payload.template).toBe("gem_package");
  });

  it("extracts name from gem name", async () => {
    const payload = await collectGemPackagePayload("pry");
    expect(payload.name).toBe("pry");
  });

  it("derives className from name", async () => {
    const payload = await collectGemPackagePayload("pry");
    expect(payload.className).toBe("Pry");
  });

  it("uses gem info for description", async () => {
    const payload = await collectGemPackagePayload("pry");
    expect(payload.desc).toContain("runtime developer console");
  });

  it("uses homepage_uri from gem data", async () => {
    const payload = await collectGemPackagePayload("pry");
    expect(payload.homepage).toBe("https://pry.github.io");
  });

  it("wraps gemName as ruby string", async () => {
    const payload = await collectGemPackagePayload("pry");
    expect(payload.gemName).toContain("pry");
  });

  it("generates license line from gem data", async () => {
    const payload = await collectGemPackagePayload("pry");
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates RubyGems livecheck block", async () => {
    const payload = await collectGemPackagePayload("pry");
    expect(payload.livecheckBlock).toContain("rubygems.org");
    expect(payload.livecheckBlock).toContain("pry");
    expect(payload.livecheckBlock).toContain("livecheck do");
  });

  it("respects name override", async () => {
    const payload = await collectGemPackagePayload("pry", null, {
      name: "my-pry",
    });
    expect(payload.name).toBe("my-pry");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectGemPackagePayload("pry");
    expect(payload.serviceBlock).toBe("");
  });

  it("includes service block when configured", async () => {
    const payload = await collectGemPackagePayload("pry", null, {
      service: true,
      serviceCommand: "pry",
    });
    expect(payload.serviceBlock).toContain("service do");
  });

  it("throws when RubyGems returns non-OK", async () => {
    await expect(
      collectGemPackagePayload("nonexistent-gem-xyz"),
    ).rejects.toThrow("RubyGems lookup failed");
  });
});

describe("collectGemPackagePayload — license_finder", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock((url: string) => {
      if (url.includes("rubygems.org") && url.includes("/license_finder")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              version: "7.2.1",
              gem_uri: "https://rubygems.org/gems/license_finder-7.2.1.gem",
              info: "LicenseFinder works with your package managers to find dependencies, detect the licenses of the packages in them, compare those licenses against a user-defined list of permitted licenses, and give you an actionable exception report.",
              homepage_uri: "https://github.com/pivotal/LicenseFinder",
              licenses: ["MIT"],
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectGemPackagePayload("license_finder");
    expect(payload.template).toBe("gem_package");
  });

  it("derives name from gem name (underscores normalized to hyphens)", async () => {
    const payload = await collectGemPackagePayload("license_finder");
    expect(payload.name).toBe("license-finder");
  });

  it("uses gem description", async () => {
    const payload = await collectGemPackagePayload("license_finder");
    expect(payload.desc).toContain("LicenseFinder");
  });

  it("uses homepage from RubyGems", async () => {
    const payload = await collectGemPackagePayload("license_finder");
    expect(payload.homepage).toBe("https://github.com/pivotal/LicenseFinder");
  });

  it("uses gem URI as download URL", async () => {
    const payload = await collectGemPackagePayload("license_finder");
    expect(payload.urlLines).toContain("license_finder-7.2.1.gem");
  });

  it("generates MIT license line", async () => {
    const payload = await collectGemPackagePayload("license_finder");
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates RubyGems livecheck block", async () => {
    const payload = await collectGemPackagePayload("license_finder");
    expect(payload.livecheckBlock).toContain("rubygems.org");
    expect(payload.livecheckBlock).toContain("license_finder");
  });
});

import { parseGemspecExecutables } from "../../../lib/generators/gem-package.ts";

describe("parseGemspecExecutables", () => {
  it("parses empty inline array (library gem)", () => {
    expect(parseGemspecExecutables("name: geminabox\nexecutables: []\nbindir: bin\n")).toEqual([]);
  });

  it("parses inline list", () => {
    expect(parseGemspecExecutables("executables: [pry, pry-remote]\n")).toEqual([
      "pry",
      "pry-remote",
    ]);
  });

  it("parses block list", () => {
    const yaml = "executables:\n- license_finder\n- lf\nrequired_ruby_version: '>= 2.7'\n";
    expect(parseGemspecExecutables(yaml)).toEqual(["license_finder", "lf"]);
  });
});

describe("collectGemPackagePayload — library gem (no executables)", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock(async (url: string) => {
      const u = String(url);
      if (u.includes("rubygems.org") && u.includes("/gems/geminabox.json")) {
        return {
          ok: true,
          json: async () => ({
            version: "3.1.0",
            gem_uri: "https://rubygems.org/gems/geminabox-3.1.0.gem",
            info: "Really simple private RubyGems hosting",
            homepage_uri: "https://github.com/geminabox/geminabox",
            licenses: ["MIT"],
          }),
        };
      }
      if (u.includes("geminabox-3.1.0.gem")) {
        // Minimal fake .gem: tar containing metadata.gz with executables: []
        const zlib = await import("node:zlib");
        const { execSync } = await import("node:child_process");
        const fs = await import("node:fs");
        const os = await import("node:os");
        const path = await import("node:path");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-gem-"));
        const meta = "--- !ruby/object:Gem::Specification\nname: geminabox\nexecutables: []\nbindir: bin\n";
        fs.writeFileSync(path.join(dir, "metadata.gz"), zlib.gzipSync(meta));
        const gemPath = path.join(dir, "pkg.gem");
        execSync(`tar -czf ${JSON.stringify(gemPath)} -C ${JSON.stringify(dir)} metadata.gz`);
        const buf = fs.readFileSync(gemPath);
        fs.rmSync(dir, { recursive: true, force: true });
        return {
          ok: true,
          arrayBuffer: async () =>
            buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        };
      }
      return { ok: false, status: 404 };
    }) as any;
  });

  it("installs library version shim when gem has no executables", async () => {
    const payload = await collectGemPackagePayload("geminabox");
    expect(payload.template).toBe("gem_package");
    expect(payload.testBinName).toBe("geminabox");
    expect(payload.libraryShimBlock).toContain("Library gem");
    expect(payload.libraryShimBlock).toContain('require "geminabox"');
    expect(payload.libraryShimBlock).toContain('Gem.loaded_specs["geminabox"]');
  });
});
