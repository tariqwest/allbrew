import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectNpmPackagePayload } from "../../../lib/generators/npm-package.ts";
import maildevFixture from "../../fixtures/npm/maildev.json";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("mocked_sha256_hash_64chars_padding_abcdef0123456789abcdef012345"),
  downloadAndHash: vi.fn().mockResolvedValue({ sha256: "mocked_sha256_hash" }),
}));

describe("collectNpmPackagePayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn((url: string) => {
      if (url.includes("registry.npmjs.org/maildev")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(maildevFixture),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
      });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.template).toBe("npm_package");
  });

  it("extracts name from package name", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.name).toBe("maildev");
    expect(payload.className).toBe("Maildev");
  });

  it("uses npm description", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.desc).toContain("SMTP");
  });

  it("uses npm homepage", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.homepage).toBe("https://github.com/maildev/maildev");
  });

  it("uses tarball URL from latest version", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.url).toBe(
      "https://registry.npmjs.org/maildev/-/maildev-2.1.0.tgz",
    );
  });

  it("computes SHA256 of tarball", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("generates license line from npm data", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates npm registry livecheck block", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.livecheckBlock).toContain(
      "registry.npmjs.org/maildev/latest",
    );
  });

  it("includes allbrew dependency", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.allbrewDependency).toContain("allbrew");
  });

  it("respects name override", async () => {
    const payload = await collectNpmPackagePayload("maildev", null, {
      name: "my-maildev",
    });
    expect(payload.name).toBe("my-maildev");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectNpmPackagePayload("maildev");
    expect(payload.serviceBlock).toBe("");
  });

  it("includes service block when configured", async () => {
    const payload = await collectNpmPackagePayload("maildev", null, {
      service: true,
      serviceCommand: "maildev",
    });
    expect(payload.serviceBlock).toContain("service do");
  });

  it("throws when npm registry returns non-OK", async () => {
    await expect(
      collectNpmPackagePayload("nonexistent-pkg-xyz"),
    ).rejects.toThrow("npm registry lookup failed");
  });
});
