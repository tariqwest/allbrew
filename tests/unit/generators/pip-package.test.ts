import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectPipPackagePayload, selectBestDistribution } from "../../../lib/generators/pip-package.ts";
import marimoFixture from "../../fixtures/pypi/marimo.json";
import clickFixture from "../../fixtures/pypi/click.json";
import stuiFixture from "../../fixtures/pypi/s-tui.json";
import browsrFixture from "../../fixtures/pypi/browsr.json";
import toolongFixture from "../../fixtures/pypi/toolong.json";
import shellGptFixture from "../../fixtures/pypi/shell-gpt.json";

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

  it("prefers wheel URL and SHA256 over sdist", async () => {
    const payload = await collectPipPackagePayload("marimo");
    expect(payload.url).toContain("marimo-0.13.0-py3-none-any.whl");
    expect(payload.sha256).toBe(
      "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
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
    // click fixture is sdist-only
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

  it("prefers wheel URL and SHA256 over sdist", async () => {
    const payload = await collectPipPackagePayload("s-tui");
    expect(payload.url).toContain("s_tui-1.1.6-py3-none-any.whl");
    expect(payload.sha256).toBe(
      "f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e3",
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

describe("collectPipPackagePayload — shell-gpt", () => {
  const repoInfo = {
    name: "shell_gpt",
    fullName: "TheR1D/shell_gpt",
    description: "A command-line productivity tool powered by AI large language models.",
    homepage: "https://github.com/TheR1D/shell_gpt",
    license: "MIT",
  };

  beforeEach(() => {
    mock.restore();

    global.fetch = mock((url: string) => {
      if (url.includes("/shell-gpt/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(shellGptFixture),
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
    const payload = await collectPipPackagePayload("shell-gpt");
    expect(payload.template).toBe("pip_package");
  });

  it("derives name and className from package name", async () => {
    const payload = await collectPipPackagePayload("shell-gpt");
    expect(payload.name).toBe("shell-gpt");
    expect(payload.className).toBe("ShellGpt");
  });

  it("uses PyPI summary as description", async () => {
    const payload = await collectPipPackagePayload("shell-gpt");
    expect(payload.desc).toContain("command-line productivity tool");
  });

  it("uses PyPI project URL as homepage when home_page is absent", async () => {
    const payload = await collectPipPackagePayload("shell-gpt");
    expect(payload.homepage).toBe("https://pypi.org/project/shell-gpt/");
  });

  it("prefers pure wheel URL and SHA256", async () => {
    const payload = await collectPipPackagePayload("shell-gpt");
    expect(payload.url).toContain("shell_gpt-1.5.1-py3-none-any.whl");
    expect(payload.sha256).toBe(
      "f7bf429e289d878e8094adf9826dec1d28f3c69438a0d85446bc043e4f052b83",
    );
  });

  it("falls back to repoInfo for license when PyPI license is absent", async () => {
    const payload = await collectPipPackagePayload("shell-gpt", repoInfo);
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates PyPI livecheck block", async () => {
    const payload = await collectPipPackagePayload("shell-gpt");
    expect(payload.livecheckBlock).toContain("pypi.org/pypi/shell-gpt/json");
  });

  it("uses --bin-name override for the sgpt executable", async () => {
    const payload = await collectPipPackagePayload("shell-gpt", null, {
      binName: "sgpt",
    });
    expect(payload.testBinName).toBe("sgpt");
  });
});


describe("selectBestDistribution", () => {
  const pureWheel = {
    packagetype: "bdist_wheel",
    python_version: "py3",
    filename: "pkg-1.0.0-py3-none-any.whl",
    url: "https://files.pythonhosted.org/packages/xx/pkg-1.0.0-py3-none-any.whl",
    digests: { sha256: "aa".repeat(32) },
  };
  const sdist = {
    packagetype: "sdist",
    python_version: "source",
    filename: "pkg-1.0.0.tar.gz",
    url: "https://files.pythonhosted.org/packages/xx/pkg-1.0.0.tar.gz",
    digests: { sha256: "bb".repeat(32) },
  };
  const arm64Wheel = {
    packagetype: "bdist_wheel",
    python_version: "cp313",
    filename: "pkg-1.0.0-cp313-cp313-macosx_11_0_arm64.whl",
    url: "https://files.pythonhosted.org/packages/xx/pkg-1.0.0-cp313-cp313-macosx_11_0_arm64.whl",
    digests: { sha256: "cc".repeat(32) },
  };
  const x64Wheel = {
    packagetype: "bdist_wheel",
    python_version: "cp313",
    filename: "pkg-1.0.0-cp313-cp313-macosx_10_9_x86_64.whl",
    url: "https://files.pythonhosted.org/packages/xx/pkg-1.0.0-cp313-cp313-macosx_10_9_x86_64.whl",
    digests: { sha256: "dd".repeat(32) },
  };
  const abi3Arm = {
    packagetype: "bdist_wheel",
    python_version: "cp310",
    filename: "pkg-1.0.0-cp310-abi3-macosx_11_0_arm64.whl",
    url: "https://files.pythonhosted.org/packages/xx/pkg-1.0.0-cp310-abi3-macosx_11_0_arm64.whl",
    digests: { sha256: "ee".repeat(32) },
  };
  const winWheel = {
    packagetype: "bdist_wheel",
    python_version: "cp313",
    filename: "pkg-1.0.0-cp313-cp313-win_amd64.whl",
    url: "https://files.pythonhosted.org/packages/xx/pkg-1.0.0-cp313-cp313-win_amd64.whl",
    digests: { sha256: "ff".repeat(32) },
  };

  it("prefers pure-python wheel over sdist", () => {
    const dist = selectBestDistribution([sdist, pureWheel], { macArch: "arm64" });
    expect(dist?.kind).toBe("wheel");
    expect(dist?.filename).toContain("py3-none-any.whl");
  });

  it("falls back to sdist when no compatible wheel", () => {
    const dist = selectBestDistribution([sdist, winWheel], { macArch: "arm64" });
    expect(dist?.kind).toBe("sdist");
    expect(dist?.filename).toContain(".tar.gz");
  });

  it("selects host-arch platform wheel when pure wheel is missing", () => {
    const dist = selectBestDistribution([sdist, x64Wheel, arm64Wheel], {
      macArch: "arm64",
    });
    expect(dist?.kind).toBe("wheel");
    expect(dist?.filename).toContain("arm64.whl");
  });

  it("accepts abi3 platform wheels for the host arch", () => {
    const dist = selectBestDistribution([sdist, abi3Arm], { macArch: "arm64" });
    expect(dist?.kind).toBe("wheel");
    expect(dist?.filename).toContain("abi3");
  });

  it("prefers pure wheel over platform wheel", () => {
    const dist = selectBestDistribution([arm64Wheel, pureWheel, sdist], {
      macArch: "arm64",
    });
    expect(dist?.filename).toContain("py3-none-any.whl");
  });

  it("can force sdist with preferWheel: false", () => {
    const dist = selectBestDistribution([pureWheel, sdist], {
      preferWheel: false,
      macArch: "arm64",
    });
    expect(dist?.kind).toBe("sdist");
  });

  it("returns null when urls empty", () => {
    expect(selectBestDistribution([])).toBeNull();
  });
});
