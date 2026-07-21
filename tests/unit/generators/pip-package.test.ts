import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectPipPackagePayload } from "../../../lib/generators/pip-package.ts";
import marimoFixture from "../../fixtures/pypi/marimo.json";
import clickFixture from "../../fixtures/pypi/click.json";
import stuiFixture from "../../fixtures/pypi/s-tui.json";
import browsrFixture from "../../fixtures/pypi/browsr.json";
import toolongFixture from "../../fixtures/pypi/toolong.json";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("mocked_sha256_hash"),
  downloadAndHash: mock().mockResolvedValue({ sha256: "mocked_sha256_hash" }),
}));

describe("collectPipPackagePayload", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock((url: string) => {
      if (url.includes("/marimo/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(marimoFixture),
        });
      }
      if (url.includes("/click/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(clickFixture),
        });
      }
      if (url.includes("/s-tui/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(stuiFixture),
        });
      }
      if (url.includes("/browsr/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(browsrFixture),
        });
      }
      if (url.includes("/toolong/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(toolongFixture),
        });
      }
      // Default: return a package with no deps
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            info: {
              name: "unknown",
              version: "1.0.0",
              summary: "Unknown",
              requires_dist: [],
            },
            urls: [],
          }),
      });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.template).toBe("pip_package");
  });

  it("extracts name from package name", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.name).toBe("marimo");
    expect(payload.className).toBe("Marimo");
  });

  it("uses PyPI summary as description", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.desc).toBe("A reactive notebook for Python");
  });

  it("uses homepage from PyPI info", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.homepage).toBe("https://github.com/marimo-team/marimo");
  });

  it("selects sdist URL and SHA256", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.url).toContain("marimo-0.13.0.tar.gz");
    expect(payload.sha256).toBe(
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    );
  });

  it("generates license line from PyPI data", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.licenseLine).toContain("Apache-2.0");
  });

  it("generates PyPI livecheck block", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.livecheckBlock).toContain("pypi.org/pypi/marimo/json");
  });

  it("resolves transitive dependencies as resources", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.resourcesBlock).toContain('resource "click"');
    expect(payload.resourcesBlock).toContain("click-8.1.7.tar.gz");
  });

  it("skips extras-only dependencies", async () => {
    const payload = await collectPipPackagePayload("marimo");
    // ruff is marked with extra == "dev" so should not appear
    expect(payload.resourcesBlock).not.toContain("ruff");
  });

  it("respects name override in options", async () => {
    const payload = await collectPipPackagePayload("marimo", null, {
      name: "my-marimo",
    });
    expect(payload.name).toBe("my-marimo");
    expect(payload.className).toBe("MyMarimo");
  });

  it("respects desc override in options", async () => {
    const payload = await collectPipPackagePayload("marimo", null, {
      desc: "Custom description",
    });
    expect(payload.desc).toBe("Custom description");
  });

  it("includes allbrew dependency", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.allbrewDependency).toBe("");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.serviceBlock).toBe("");
  });

  it("includes service block when options specify service", async () => {
    const payload = await collectPipPackagePayload("marimo", null, {
      service: true,
      serviceCommand: "marimo edit",
    });
    expect(payload.serviceBlock).toContain("service do");
  });

  it("throws when PyPI returns non-OK", async () => {
    global.fetch = mock().mockResolvedValue({
      ok: false,
      status: 404,
    }) as any;
    await expect(
      collectPipPackagePayload("nonexistent-package-xyz"),
    ).rejects.toThrow("PyPI lookup failed");
  });
});

describe("collectPipPackagePayload — s-tui", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock((url: string) => {
      if (url.includes("/s-tui/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(stuiFixture),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            info: { name: "unknown", version: "1.0.0", summary: "Unknown", requires_dist: [] },
            urls: [],
          }),
      });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectPipPackagePayload("s-tui");
    expect(payload.template).toBe("pip_package");
  });

  it("derives name and className from package name", async () => {
    const payload = await collectPipPackagePayload("s-tui");
    expect(payload.name).toBe("s-tui");
    expect(payload.className).toBe("STui");
  });

  it("uses PyPI summary as description", async () => {
    const payload = await collectPipPackagePayload("s-tui");
    expect(payload.desc).toContain("CPU temperature");
  });

  it("uses homepage from PyPI info", async () => {
    const payload = await collectPipPackagePayload("s-tui");
    expect(payload.homepage).toBe("https://github.com/amanusk/s-tui");
  });

  it("selects sdist URL and SHA256", async () => {
    const payload = await collectPipPackagePayload("s-tui");
    expect(payload.url).toContain("s-tui-1.1.6.tar.gz");
    expect(payload.sha256).toBe(
      "e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2",
    );
  });

  it("generates GPL-2.0 license line", async () => {
    const payload = await collectPipPackagePayload("s-tui");
    expect(payload.licenseLine).toContain("GPL-2.0");
  });

  it("generates PyPI livecheck block", async () => {
    const payload = await collectPipPackagePayload("s-tui");
    expect(payload.livecheckBlock).toContain("pypi.org/pypi/s-tui/json");
  });
});

describe("collectPipPackagePayload — browsr", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock((url: string) => {
      if (url.includes("/browsr/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(browsrFixture),
        });
      }
      if (url.includes("/click/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(clickFixture),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            info: { name: "unknown", version: "1.0.0", summary: "Unknown", requires_dist: [] },
            urls: [],
          }),
      });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectPipPackagePayload("browsr");
    expect(payload.template).toBe("pip_package");
  });

  it("derives name and className", async () => {
    const payload = await collectPipPackagePayload("browsr");
    expect(payload.name).toBe("browsr");
    expect(payload.className).toBe("Browsr");
  });

  it("uses PyPI summary as description", async () => {
    const payload = await collectPipPackagePayload("browsr");
    expect(payload.desc).toBe("TUI File Browser App");
  });

  it("uses homepage from PyPI info", async () => {
    const payload = await collectPipPackagePayload("browsr");
    expect(payload.homepage).toBe("https://github.com/juftin/browsr");
  });

  it("generates MIT license line", async () => {
    const payload = await collectPipPackagePayload("browsr");
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates PyPI livecheck block", async () => {
    const payload = await collectPipPackagePayload("browsr");
    expect(payload.livecheckBlock).toContain("pypi.org/pypi/browsr/json");
  });
});

describe("collectPipPackagePayload — toolong", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock((url: string) => {
      if (url.includes("/toolong/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(toolongFixture),
        });
      }
      if (url.includes("/click/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(clickFixture),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            info: { name: "unknown", version: "1.0.0", summary: "Unknown", requires_dist: [] },
            urls: [],
          }),
      });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectPipPackagePayload("toolong");
    expect(payload.template).toBe("pip_package");
  });

  it("derives name and className", async () => {
    const payload = await collectPipPackagePayload("toolong");
    expect(payload.name).toBe("toolong");
    expect(payload.className).toBe("Toolong");
  });

  it("uses PyPI summary as description", async () => {
    const payload = await collectPipPackagePayload("toolong");
    expect(payload.desc).toContain("log file");
  });

  it("uses homepage from PyPI info", async () => {
    const payload = await collectPipPackagePayload("toolong");
    expect(payload.homepage).toBe("https://github.com/textualize/toolong");
  });

  it("generates MIT license line", async () => {
    const payload = await collectPipPackagePayload("toolong");
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates PyPI livecheck block", async () => {
    const payload = await collectPipPackagePayload("toolong");
    expect(payload.livecheckBlock).toContain("pypi.org/pypi/toolong/json");
  });
});
