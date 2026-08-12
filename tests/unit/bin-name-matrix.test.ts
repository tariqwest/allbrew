import { describe, it, expect, mock, beforeEach } from "bun:test";
import { extractNpmBinName } from "../../lib/generators/npm-package.ts";
import { collectNpmPackagePayload } from "../../lib/generators/npm-package.ts";
import { collectPipPackagePayload } from "../../lib/generators/pip-package.ts";

// ─── B1: Bin-name matrix ────────────────────────────────────────────────
// Tests that generators correctly link the binary name from package
// metadata (or via --bin-name override) instead of always using the
// formula/package name.

// Known bin-name mismatches from research (allbrew-test-cases.md):
// | Package | Formula name | Expected bin | Source |
// |---------|-------------|-------------|--------|
// | taskbook | taskbook | tb | npm bin object |
// | toolong | toolong | tl | npm bin object |
// | elia-chat | elia-chat | elia | npm bin object (pip pkg is elia-chat) |
// | orange3 | orange3 | orange-canvas | pip entry_points (needs --bin-name) |

describe("extractNpmBinName", () => {
  it("returns null when bin field is absent", () => {
    expect(extractNpmBinName({ name: "foo" }, "foo")).toBeNull();
    expect(extractNpmBinName({}, "foo")).toBeNull();
    expect(extractNpmBinName(null, "foo")).toBeNull();
  });

  it("returns package last segment when bin is a string", () => {
    // When bin is a string, the binary is named after the package
    expect(extractNpmBinName({ bin: "cli.js" }, "foo")).toBe("foo");
    expect(extractNpmBinName({ bin: "index.js" }, "@org/bar")).toBe("bar");
  });

  it("extracts bin name from object with single key (taskbook → tb)", () => {
    const versionData = { bin: { tb: "taskbook.js" } };
    expect(extractNpmBinName(versionData, "taskbook")).toBe("tb");
  });

  it("extracts bin name from object with single key (toolong → tl)", () => {
    const versionData = { bin: { tl: "toolong.py" } };
    expect(extractNpmBinName(versionData, "toolong")).toBe("tl");
  });

  it("extracts bin name from object with single key (elia-chat → elia)", () => {
    const versionData = { bin: { elia: "elia/cli.py" } };
    expect(extractNpmBinName(versionData, "elia-chat")).toBe("elia");
  });

  it("prefers key matching package name when multiple keys exist", () => {
    const versionData = { bin: { foo: "foo.js", bar: "bar.js" } };
    expect(extractNpmBinName(versionData, "foo")).toBe("foo");
  });

  it("prefers key matching package last segment for scoped packages", () => {
    const versionData = { bin: { bar: "bar.js", baz: "baz.js" } };
    expect(extractNpmBinName(versionData, "@org/bar")).toBe("bar");
  });

  it("returns first key when no key matches package name", () => {
    const versionData = { bin: { alpha: "a.js", beta: "b.js" } };
    expect(extractNpmBinName(versionData, "gamma")).toBe("alpha");
  });

  it("returns null for empty bin object", () => {
    expect(extractNpmBinName({ bin: {} }, "foo")).toBeNull();
  });

  it("returns null for array bin (invalid format)", () => {
    expect(extractNpmBinName({ bin: ["foo.js"] }, "foo")).toBeNull();
  });
});

// Integration: verify the npm generator uses the extracted bin name in the payload
describe("npm generator bin-name integration", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("uses extracted bin name (tb) for taskbook package", async () => {
    const mockPackument = {
      "dist-tags": { latest: "1.0.0" },
      versions: {
        "1.0.0": {
          version: "1.0.0",
          description: "Tasks, boards & notes",
          license: "MIT",
          bin: { tb: "taskbook.js" },
          dist: { tarball: "https://registry.npmjs.org/taskbook/-/taskbook-1.0.0.tgz" },
        },
      },
    };

    global.fetch = mock((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPackument),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("fake-tarball"));
            controller.close();
          },
        }),
      }),
    ) as any;

    const payload = await collectNpmPackagePayload("taskbook", null, {});
    expect(payload.testBinName).toBe("tb");
  });

  it("uses --bin-name override when provided", async () => {
    const mockPackument = {
      "dist-tags": { latest: "1.0.0" },
      versions: {
        "1.0.0": {
          version: "1.0.0",
          description: "Test package",
          license: "MIT",
          bin: { wrong: "wrong.js" },
          dist: { tarball: "https://registry.npmjs.org/test/-/test-1.0.0.tgz" },
        },
      },
    };

    global.fetch = mock((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPackument),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("fake-tarball"));
            controller.close();
          },
        }),
      }),
    ) as any;

    const payload = await collectNpmPackagePayload("test", null, { binName: "custom-bin" });
    expect(payload.testBinName).toBe("custom-bin");
  });

  it("falls back to formula name when bin is absent", async () => {
    const mockPackument = {
      "dist-tags": { latest: "1.0.0" },
      versions: {
        "1.0.0": {
          version: "1.0.0",
          description: "No bin field",
          license: "MIT",
          dist: { tarball: "https://registry.npmjs.org/nobin/-/nobin-1.0.0.tgz" },
        },
      },
    };

    global.fetch = mock((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPackument),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("fake-tarball"));
            controller.close();
          },
        }),
      }),
    ) as any;

    const payload = await collectNpmPackagePayload("nobin", null, {});
    expect(payload.testBinName).toBe("nobin");
  });
});

// Integration: verify the pip generator uses --bin-name override
describe("pip generator bin-name override", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("uses --bin-name override for orange3 (orange-canvas)", async () => {
    const mockPypiData = {
      info: {
        version: "3.0.0",
        summary: "Orange data mining toolbox",
        home_page: "https://orangedatamining.com",
        license: "GPL-3.0",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "sdist",
          url: "https://pypi.org/packages/Orange3-3.0.0.tar.gz",
          digests: { sha256: "abc123" },
        },
      ],
    };

    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPypiData),
      }),
    ) as any;

    const payload = await collectPipPackagePayload("Orange3", null, {
      binName: "orange-canvas",
    });
    expect(payload.testBinName).toBe("orange-canvas");
  });

  it("falls back to formula name when --bin-name is not provided", async () => {
    const mockPypiData = {
      info: {
        version: "1.0.0",
        summary: "Test package",
        home_page: "https://example.com",
        license: "MIT",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "sdist",
          url: "https://pypi.org/packages/test-1.0.0.tar.gz",
          digests: { sha256: "abc123" },
        },
      ],
    };

    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPypiData),
      }),
    ) as any;

    const payload = await collectPipPackagePayload("test-pkg", null, {});
    expect(payload.testBinName).toBe("test-pkg");
  });
});

// Bin-name mismatch documentation table
describe("bin-name mismatch documentation", () => {
  // This test documents the known bin-name mismatches from research.
  // It serves as a living reference for the B1 bin-name matrix.
  it("documents known bin-name mismatches", () => {
    const mismatches = [
      { package: "taskbook", formula: "taskbook", expectedBin: "tb", source: "npm", extraction: "auto" },
      { package: "toolong", formula: "toolong", expectedBin: "tl", source: "npm", extraction: "auto" },
      { package: "elia-chat", formula: "elia-chat", expectedBin: "elia", source: "npm", extraction: "auto" },
      { package: "Orange3", formula: "orange3", expectedBin: "orange-canvas", source: "pip", extraction: "manual (--bin-name)" },
    ];

    for (const { package: pkg, expectedBin, source, extraction } of mismatches) {
      expect(pkg).toBeTruthy();
      expect(expectedBin).toBeTruthy();
      expect(source).toMatch(/^(npm|pip|cargo|go|gem|dotnet)$/);
      expect(extraction).toMatch(/^(auto|manual.*)$/);
    }
  });
});
