import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectNpmPackagePayload } from "../../../lib/generators/npm-package.ts";
import maildevFixture from "../../fixtures/npm/maildev.json";
import diracCliFixture from "../../fixtures/npm/dirac-cli.json";
import clineFixture from "../../fixtures/npm/cline.json";
import taskbookFixture from "../../fixtures/npm/taskbook.json";
import npkillFixture from "../../fixtures/npm/npkill.json";
import vtopFixture from "../../fixtures/npm/vtop.json";

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
      if (url.includes("registry.npmjs.org/dirac-cli")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(diracCliFixture),
        });
      }
      if (url.includes("registry.npmjs.org/cline")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(clineFixture),
        });
      }
      if (url.includes("registry.npmjs.org/taskbook")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(taskbookFixture),
        });
      }
      if (url.includes("registry.npmjs.org/npkill")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npkillFixture),
        });
      }
      if (url.includes("registry.npmjs.org/vtop")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(vtopFixture),
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

describe("collectNpmPackagePayload — dirac-cli", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn((url: string) => {
      if (url.includes("registry.npmjs.org/dirac-cli")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(diracCliFixture),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
      });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli");
    expect(payload.template).toBe("npm_package");
  });

  it("extracts name from package name by default", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli");
    expect(payload.name).toBe("dirac-cli");
    expect(payload.className).toBe("DiracCli");
  });

  it("uses npm description", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli");
    expect(payload.desc).toContain("Autonomous coding agent");
  });

  it("uses npm homepage", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli");
    expect(payload.homepage).toBe("https://dirac.run");
  });

  it("uses tarball URL from latest version", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli");
    expect(payload.url).toBe(
      "https://registry.npmjs.org/dirac-cli/-/dirac-cli-0.4.9.tgz",
    );
  });

  it("generates license line from npm data", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli");
    expect(payload.licenseLine).toContain("Apache-2.0");
  });

  it("generates npm registry livecheck block", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli");
    expect(payload.livecheckBlock).toContain(
      "registry.npmjs.org/dirac-cli/latest",
    );
  });

  it("respects name override to match bin command", async () => {
    const payload = await collectNpmPackagePayload("dirac-cli", null, {
      name: "dirac",
    });
    expect(payload.name).toBe("dirac");
    expect(payload.className).toBe("Dirac");
  });
});

describe("collectNpmPackagePayload — cline", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn((url: string) => {
      if (url.includes("registry.npmjs.org/cline")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(clineFixture),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
      });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectNpmPackagePayload("cline");
    expect(payload.template).toBe("npm_package");
  });

  it("derives name and className from package name", async () => {
    const payload = await collectNpmPackagePayload("cline");
    expect(payload.name).toBe("cline");
    expect(payload.className).toBe("Cline");
  });

  it("uses npm description", async () => {
    const payload = await collectNpmPackagePayload("cline");
    expect(payload.desc).toContain("coding agent");
  });

  it("uses npm homepage", async () => {
    const payload = await collectNpmPackagePayload("cline");
    expect(payload.homepage).toBe("https://cline.bot");
  });

  it("uses tarball URL from latest version", async () => {
    const payload = await collectNpmPackagePayload("cline");
    expect(payload.url).toBe(
      "https://registry.npmjs.org/cline/-/cline-3.0.30.tgz",
    );
  });

  it("generates license line from npm data", async () => {
    const payload = await collectNpmPackagePayload("cline");
    expect(payload.licenseLine).toContain("Apache-2.0");
  });

  it("generates npm registry livecheck block", async () => {
    const payload = await collectNpmPackagePayload("cline");
    expect(payload.livecheckBlock).toContain(
      "registry.npmjs.org/cline/latest",
    );
  });

  it("name matches bin command — no override needed", async () => {
    const payload = await collectNpmPackagePayload("cline");
    expect(payload.name).toBe("cline");
    expect(payload.className).toBe("Cline");
  });
});

describe("collectNpmPackagePayload — taskbook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn((url: string) => {
      if (url.includes("registry.npmjs.org/taskbook")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(taskbookFixture),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectNpmPackagePayload("taskbook");
    expect(payload.template).toBe("npm_package");
  });

  it("derives name and className from package name", async () => {
    const payload = await collectNpmPackagePayload("taskbook");
    expect(payload.name).toBe("taskbook");
    expect(payload.className).toBe("Taskbook");
  });

  it("bin name differs from package name (tb vs taskbook)", async () => {
    const payload = await collectNpmPackagePayload("taskbook");
    expect(payload.name).toBe("taskbook");
  });

  it("uses tarball URL from latest version", async () => {
    const payload = await collectNpmPackagePayload("taskbook");
    expect(payload.url).toBe(
      "https://registry.npmjs.org/taskbook/-/taskbook-0.3.0.tgz",
    );
  });

  it("generates MIT license line", async () => {
    const payload = await collectNpmPackagePayload("taskbook");
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates npm registry livecheck block", async () => {
    const payload = await collectNpmPackagePayload("taskbook");
    expect(payload.livecheckBlock).toContain(
      "registry.npmjs.org/taskbook/latest",
    );
  });
});

describe("collectNpmPackagePayload — npkill", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn((url: string) => {
      if (url.includes("registry.npmjs.org/npkill")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(npkillFixture),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectNpmPackagePayload("npkill");
    expect(payload.template).toBe("npm_package");
  });

  it("derives name and className", async () => {
    const payload = await collectNpmPackagePayload("npkill");
    expect(payload.name).toBe("npkill");
    expect(payload.className).toBe("Npkill");
  });

  it("uses npm description", async () => {
    const payload = await collectNpmPackagePayload("npkill");
    expect(payload.desc).toContain("node_modules");
  });

  it("uses tarball URL from latest version", async () => {
    const payload = await collectNpmPackagePayload("npkill");
    expect(payload.url).toBe(
      "https://registry.npmjs.org/npkill/-/npkill-0.12.2.tgz",
    );
  });

  it("generates MIT license line", async () => {
    const payload = await collectNpmPackagePayload("npkill");
    expect(payload.licenseLine).toContain("MIT");
  });
});

describe("collectNpmPackagePayload — vtop", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn((url: string) => {
      if (url.includes("registry.npmjs.org/vtop")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(vtopFixture),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectNpmPackagePayload("vtop");
    expect(payload.template).toBe("npm_package");
  });

  it("derives name and className", async () => {
    const payload = await collectNpmPackagePayload("vtop");
    expect(payload.name).toBe("vtop");
    expect(payload.className).toBe("Vtop");
  });

  it("uses homepage from npm data", async () => {
    const payload = await collectNpmPackagePayload("vtop");
    expect(payload.homepage).toBe("http://parall.ax/vtop");
  });

  it("uses tarball URL from latest version", async () => {
    const payload = await collectNpmPackagePayload("vtop");
    expect(payload.url).toBe(
      "https://registry.npmjs.org/vtop/-/vtop-0.6.1.tgz",
    );
  });

  it("generates MIT license line", async () => {
    const payload = await collectNpmPackagePayload("vtop");
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates npm registry livecheck block", async () => {
    const payload = await collectNpmPackagePayload("vtop");
    expect(payload.livecheckBlock).toContain(
      "registry.npmjs.org/vtop/latest",
    );
  });
});
