import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectPipPackagePayload } from "../../../lib/generators/pip-package.ts";
import marimoFixture from "../../fixtures/pypi/marimo.json";
import clickFixture from "../../fixtures/pypi/click.json";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("mocked_sha256_hash"),
  downloadAndHash: vi.fn().mockResolvedValue({ sha256: "mocked_sha256_hash" }),
}));

describe("collectPipPackagePayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn((url: string) => {
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
    expect(payload.allbrewDependency).toContain("allbrew");
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
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as any;
    await expect(
      collectPipPackagePayload("nonexistent-package-xyz"),
    ).rejects.toThrow("PyPI lookup failed");
  });
});
