import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  collectPipPackagePayload,
  selectBestDistribution,
  parseRequiresDistEntry,
  isRequirementApplicable,
  versionSatisfies,
  parseVersionConstraint,
  compareVersions,
  normalizePackageName,
  KNOWN_BIN_NAMES,
  selectPipFormulaPython,
  RESOURCE_SYSTEM_DEPS,
  pypiInfoMatchesGithub,
  collectPypiProjectUrls,
  resolvePypiGithubIdentity,
} from "../../../lib/generators/pip-package.ts";
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

  it("includes undeclared click runtime dependency as a resource", async () => {
    const payload = await collectPipPackagePayload("shell-gpt");
    expect(payload.resourcesBlock).toContain('resource "click"');
  });

  it("defaults test binary to sgpt without explicit binName", async () => {
    const payload = await collectPipPackagePayload("shell-gpt");
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

describe("pip requirement parsing helpers", () => {
  it("normalizes package names per PEP 503", () => {
    expect(normalizePackageName("PyYAML")).toBe("pyyaml");
    expect(normalizePackageName("typing_extensions")).toBe("typing-extensions");
    expect(normalizePackageName("shell.gpt")).toBe("shell-gpt");
  });

  it("parses requires_dist with extras, versions, and markers", () => {
    const parsed = parseRequiresDistEntry(
      'requests[security]>=2.0,<3.0; python_version >= "3.10"',
    );
    expect(parsed?.name).toBe("requests");
    expect(parsed?.extras).toEqual(["security"]);
    expect(parsed?.constraint.clauses.map((c) => c.op)).toEqual([">=", "<"]);
    expect(parsed?.marker).toContain("python_version");
  });

  it("skips extras-only requirements unless that extra is active", () => {
    expect(isRequirementApplicable('extra == "dev"')).toBe(false);
    expect(isRequirementApplicable('extra == "litellm"')).toBe(false);
    expect(
      isRequirementApplicable('extra == "server"', { activeExtras: ["server"] }),
    ).toBe(true);
    expect(
      isRequirementApplicable('extra == "server"', {
        activeExtras: ["client"],
      }),
    ).toBe(false);
    expect(
      isRequirementApplicable('extra == "server"', { extra: "server" }),
    ).toBe(true);
  });

  it("evaluates platform markers for the host", () => {
    expect(
      isRequirementApplicable('sys_platform == "win32"', {
        sysPlatform: "darwin",
      }),
    ).toBe(false);
    expect(
      isRequirementApplicable('sys_platform == "darwin"', {
        sysPlatform: "darwin",
      }),
    ).toBe(true);
    expect(
      isRequirementApplicable('platform_system == "Windows"', {
        platformSystem: "Darwin",
      }),
    ).toBe(false);
  });

  it("checks PEP 440-ish version constraints", () => {
    const c = parseVersionConstraint(">=1.8.0,<2.0.0");
    expect(versionSatisfies("1.9.0", c)).toBe(true);
    expect(versionSatisfies("2.0.0", c)).toBe(false);
    expect(versionSatisfies("1.7.9", c)).toBe(false);

    const pin = parseVersionConstraint("==1.83.4");
    expect(versionSatisfies("1.83.4", pin)).toBe(true);
    expect(versionSatisfies("1.83.5", pin)).toBe(false);

    // ~=1.4 => >=1.4, ==1.* (1.5 is allowed); ~=1.4.0 => >=1.4.0, ==1.4.*
    const approx = parseVersionConstraint("~=1.4");
    expect(versionSatisfies("1.4.2", approx)).toBe(true);
    expect(versionSatisfies("1.5.0", approx)).toBe(true);
    expect(versionSatisfies("2.0.0", approx)).toBe(false);
    const approxPatch = parseVersionConstraint("~=1.4.0");
    expect(versionSatisfies("1.4.2", approxPatch)).toBe(true);
    expect(versionSatisfies("1.5.0", approxPatch)).toBe(false);
  });

  it("compares dotted versions", () => {
    expect(compareVersions("1.2.3", "1.2.10")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("knows shell-gpt binary alias", () => {
    expect(KNOWN_BIN_NAMES["shell-gpt"]).toBe("sgpt");
  });
});

describe("collectPipPackagePayload — pinned dep version skew", () => {
  beforeEach(() => {
    mock.restore();

    const rootPkg = {
      info: {
        name: "root-pkg",
        version: "1.0.0",
        summary: "Root package pinning an older mcp",
        home_page: "https://example.com/root-pkg",
        license: "MIT",
        // Pin matches installed wheel; latest mcp has different deps.
        requires_dist: ["mcp==1.28.1"],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "root_pkg-1.0.0-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/root_pkg-1.0.0-py3-none-any.whl",
          digests: { sha256: "aa".repeat(32) },
        },
      ],
    };

    const mcpLatest = {
      info: {
        name: "mcp",
        version: "2.0.0",
        summary: "Latest mcp",
        requires_dist: ["httpx2>=2.5.0"],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "mcp-2.0.0-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/mcp-2.0.0-py3-none-any.whl",
          digests: { sha256: "bb".repeat(32) },
        },
      ],
      releases: {
        "2.0.0": [
          {
            packagetype: "bdist_wheel",
            python_version: "py3",
            filename: "mcp-2.0.0-py3-none-any.whl",
            url: "https://files.pythonhosted.org/packages/xx/mcp-2.0.0-py3-none-any.whl",
            digests: { sha256: "bb".repeat(32) },
          },
        ],
        "1.28.1": [
          {
            packagetype: "bdist_wheel",
            python_version: "py3",
            filename: "mcp-1.28.1-py3-none-any.whl",
            url: "https://files.pythonhosted.org/packages/xx/mcp-1.28.1-py3-none-any.whl",
            digests: { sha256: "cc".repeat(32) },
          },
        ],
      },
    };

    const mcpPinned = {
      info: {
        name: "mcp",
        version: "1.28.1",
        summary: "Pinned mcp",
        requires_dist: ["httpx-sse>=0.4", "httpx>=0.27.1,<1.0.0"],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "mcp-1.28.1-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/mcp-1.28.1-py3-none-any.whl",
          digests: { sha256: "cc".repeat(32) },
        },
      ],
    };

    const httpxSse = {
      info: {
        name: "httpx-sse",
        version: "0.4.3",
        summary: "SSE support for httpx",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "httpx_sse-0.4.3-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/httpx_sse-0.4.3-py3-none-any.whl",
          digests: { sha256: "dd".repeat(32) },
        },
      ],
    };

    const httpx = {
      info: {
        name: "httpx",
        version: "0.28.1",
        summary: "httpx",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "httpx-0.28.1-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/httpx-0.28.1-py3-none-any.whl",
          digests: { sha256: "ee".repeat(32) },
        },
      ],
    };

    const httpx2 = {
      info: {
        name: "httpx2",
        version: "2.9.1",
        summary: "httpx2 (mcp 2.x only)",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "httpx2-2.9.1-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/httpx2-2.9.1-py3-none-any.whl",
          digests: { sha256: "ff".repeat(32) },
        },
      ],
    };

    global.fetch = mock((url: string) => {
      const u = String(url);
      let body: unknown;
      if (u.includes("/root-pkg/")) body = rootPkg;
      else if (u.includes("/mcp/1.28.1/")) body = mcpPinned;
      else if (u.includes("/mcp/")) body = mcpLatest;
      else if (u.includes("/httpx-sse/")) body = httpxSse;
      else if (u.includes("/httpx2/")) body = httpx2;
      else if (u.includes("/httpx/")) body = httpx;
      else {
        body = {
          info: {
            name: "unknown",
            version: "1.0.0",
            summary: "Unknown",
            requires_dist: [],
          },
          urls: [],
        };
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      });
    }) as any;
  });

  it("walks requires_dist of the pinned dep version, not latest", async () => {
    const payload = await collectPipPackagePayload("root-pkg");
    expect(payload.resourcesBlock).toContain('resource "mcp"');
    expect(payload.resourcesBlock).toContain("mcp-1.28.1-py3-none-any.whl");
    // mcp 1.28.1 needs httpx-sse; latest mcp 2.x would pull httpx2 instead.
    expect(payload.resourcesBlock).toContain('resource "httpx-sse"');
    expect(payload.resourcesBlock).toContain("httpx_sse-0.4.3-py3-none-any.whl");
    expect(payload.resourcesBlock).not.toContain('resource "httpx2"');
  });
});

describe("collectPipPackagePayload — dependency extras expansion", () => {
  beforeEach(() => {
    mock.restore();

    const rootPkg = {
      info: {
        name: "root-pkg",
        version: "1.0.0",
        summary: "Root depending on fastmcp meta package",
        home_page: "https://example.com/root-pkg",
        license: "MIT",
        requires_dist: ["fastmcp==3.4.4"],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "root_pkg-1.0.0-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/root_pkg-1.0.0-py3-none-any.whl",
          digests: { sha256: "11".repeat(32) },
        },
      ],
    };

    const fastmcp = {
      info: {
        name: "fastmcp",
        version: "3.4.4",
        summary: "Meta package requiring slim extras",
        // Same shape as real fastmcp: extras on the dependency, not env markers.
        requires_dist: ["fastmcp-slim[client,server]==3.4.4"],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "fastmcp-3.4.4-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/fastmcp-3.4.4-py3-none-any.whl",
          digests: { sha256: "22".repeat(32) },
        },
      ],
    };

    const fastmcpSlim = {
      info: {
        name: "fastmcp-slim",
        version: "3.4.4",
        summary: "Slim core with optional extras",
        requires_dist: [
          "platformdirs>=4.0.0",
          'griffelib>=2.0.0; extra == "server"',
          'httpx>=0.28.1; extra == "client"',
          'anthropic>=0.48.0; extra == "anthropic"',
        ],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "fastmcp_slim-3.4.4-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/fastmcp_slim-3.4.4-py3-none-any.whl",
          digests: { sha256: "33".repeat(32) },
        },
      ],
    };

    const griffelib = {
      info: {
        name: "griffelib",
        version: "2.1.0",
        summary: "Provides griffe import",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "griffelib-2.1.0-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/griffelib-2.1.0-py3-none-any.whl",
          digests: { sha256: "44".repeat(32) },
        },
      ],
    };

    const httpx = {
      info: {
        name: "httpx",
        version: "0.28.1",
        summary: "httpx",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "httpx-0.28.1-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/httpx-0.28.1-py3-none-any.whl",
          digests: { sha256: "55".repeat(32) },
        },
      ],
    };

    const platformdirs = {
      info: {
        name: "platformdirs",
        version: "4.3.0",
        summary: "platformdirs",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "platformdirs-4.3.0-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/platformdirs-4.3.0-py3-none-any.whl",
          digests: { sha256: "66".repeat(32) },
        },
      ],
    };

    const anthropic = {
      info: {
        name: "anthropic",
        version: "0.50.0",
        summary: "optional anthropic extra",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          python_version: "py3",
          filename: "anthropic-0.50.0-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/xx/anthropic-0.50.0-py3-none-any.whl",
          digests: { sha256: "77".repeat(32) },
        },
      ],
    };

    global.fetch = mock((url: string) => {
      const u = String(url);
      let body: unknown;
      if (u.includes("/root-pkg/")) body = rootPkg;
      else if (u.includes("/fastmcp-slim/")) body = fastmcpSlim;
      else if (u.includes("/fastmcp/")) body = fastmcp;
      else if (u.includes("/griffelib/")) body = griffelib;
      else if (u.includes("/httpx/")) body = httpx;
      else if (u.includes("/platformdirs/")) body = platformdirs;
      else if (u.includes("/anthropic/")) body = anthropic;
      else {
        body = {
          info: {
            name: "unknown",
            version: "1.0.0",
            summary: "Unknown",
            requires_dist: [],
          },
          urls: [],
        };
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      });
    }) as any;
  });

  it("expands Foo[client,server] extras into transitive resources", async () => {
    const payload = await collectPipPackagePayload("root-pkg");
    expect(payload.resourcesBlock).toContain('resource "fastmcp"');
    expect(payload.resourcesBlock).toContain('resource "fastmcp-slim"');
    // server + client extras from fastmcp-slim[client,server]
    expect(payload.resourcesBlock).toContain('resource "griffelib"');
    expect(payload.resourcesBlock).toContain('resource "httpx"');
    expect(payload.resourcesBlock).toContain('resource "platformdirs"');
    // unrelated optional extra stays off
    expect(payload.resourcesBlock).not.toContain('resource "anthropic"');
  });
});

describe("selectPipFormulaPython", () => {
  it("picks newest Homebrew Python satisfying requires_python", () => {
    expect(selectPipFormulaPython("<3.13,>=3.10")).toEqual({
      major: 3,
      minor: 12,
    });
    expect(selectPipFormulaPython(">=3.10")).toEqual({ major: 3, minor: 13 });
    expect(selectPipFormulaPython(null)).toEqual({ major: 3, minor: 13 });
    expect(selectPipFormulaPython("")).toEqual({ major: 3, minor: 13 });
  });
});

describe("pyqt-openai pip formula knobs", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("uses python@3.12, portaudio, and import-based version test", async () => {
    const root = {
      info: {
        name: "pyqt-openai",
        version: "1.8.3",
        summary: "VividNode chatbot",
        requires_python: "<3.13,>=3.10",
        requires_dist: ["PySide6", "pyaudio"],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          filename: "pyqt_openai-1.8.3-py3-none-any.whl",
          url: "https://files.pythonhosted.org/packages/pyqt_openai-1.8.3-py3-none-any.whl",
          digests: { sha256: "aa".repeat(32) },
        },
      ],
    };
    const pyside = {
      info: {
        name: "PySide6",
        version: "6.11.1",
        summary: "Qt",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "bdist_wheel",
          filename:
            "pyside6-6.11.1-cp310-abi3-macosx_13_0_universal2.whl",
          url: "https://files.pythonhosted.org/packages/pyside6-6.11.1-cp310-abi3-macosx_13_0_universal2.whl",
          digests: { sha256: "bb".repeat(32) },
        },
      ],
    };
    const pyaudio = {
      info: {
        name: "pyaudio",
        version: "0.2.14",
        summary: "PortAudio bindings",
        requires_dist: [],
      },
      urls: [
        {
          packagetype: "sdist",
          filename: "PyAudio-0.2.14.tar.gz",
          url: "https://files.pythonhosted.org/packages/PyAudio-0.2.14.tar.gz",
          digests: { sha256: "cc".repeat(32) },
        },
      ],
    };

    global.fetch = mock((url: string) => {
      const u = String(url);
      let body: unknown = {
        info: {
          name: "unknown",
          version: "1.0.0",
          summary: "Unknown",
          requires_dist: [],
        },
        urls: [],
      };
      if (u.includes("/pyqt-openai/")) body = root;
      else if (u.includes("/PySide6/") || u.includes("/pyside6/")) body = pyside;
      else if (u.includes("/pyaudio/") || u.includes("/PyAudio/")) body = pyaudio;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      });
    }) as any;

    const payload = await collectPipPackagePayload("pyqt-openai");
    expect(payload.pythonFormula).toBe("3.12");
    expect(payload.pythonBin).toBe("python3.12");
    expect(payload.extraDependsBlock).toContain('depends_on "portaudio"');
    expect(payload.testDoBody).toContain("import pyqt_openai");
    expect(payload.testDoBody).not.toContain("--version");
    expect(payload.resourcesBlock).toContain('resource "pyaudio"');
    expect(RESOURCE_SYSTEM_DEPS.pyaudio).toContain("portaudio");
    expect(KNOWN_BIN_NAMES["pyqt-openai"]).toBe("pyqt-openai");
  });
});

describe("pypiInfoMatchesGithub — registry/GitHub identity", () => {
  it("matches home_page pointing at the same owner/repo", () => {
    expect(
      pypiInfoMatchesGithub(
        { home_page: "https://github.com/marimo-team/marimo" },
        "marimo-team",
        "marimo",
      ),
    ).toBe(true);
  });

  it("matches project_urls.Homepage for the same repo (case-insensitive)", () => {
    expect(
      pypiInfoMatchesGithub(
        {
          home_page: null,
          project_urls: {
            Homepage: "https://GitHub.com/Usnistgov/open-notebook/",
          },
        },
        "usnistgov",
        "open-notebook",
      ),
    ).toBe(true);
  });

  it("rejects a same-named package that points at a different GitHub owner", () => {
    // NIST open-notebook on PyPI must not be accepted for lfnovo/open-notebook
    expect(
      pypiInfoMatchesGithub(
        {
          home_page: null,
          project_url: "https://pypi.org/project/open-notebook/",
          project_urls: {
            Documentation: "https://pages.nist.gov/open-notebook/",
            Homepage: "https://github.com/usnistgov/open-notebook",
          },
        },
        "lfnovo",
        "open-notebook",
      ),
    ).toBe(false);
  });

  it("rejects empty / missing project urls", () => {
    expect(pypiInfoMatchesGithub({}, "lfnovo", "open-notebook")).toBe(false);
    expect(pypiInfoMatchesGithub(null, "lfnovo", "open-notebook")).toBe(false);
  });

  it("collectPypiProjectUrls flattens home_page + project_urls", () => {
    const urls = collectPypiProjectUrls({
      home_page: "https://example.com",
      project_urls: { Source: "https://github.com/a/b", Docs: null },
    });
    expect(urls).toContain("https://example.com");
    expect(urls).toContain("https://github.com/a/b");
    expect(urls).not.toContain(null as any);
  });
});

describe("resolvePypiGithubIdentity", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("returns matches=true when PyPI homepage is the GitHub repo", async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            info: {
              name: "marimo",
              version: "0.13.0",
              home_page: "https://github.com/marimo-team/marimo",
            },
            urls: [],
          }),
      }),
    ) as any;

    const r = await resolvePypiGithubIdentity(
      "marimo",
      "marimo-team",
      "marimo",
    );
    expect(r.matches).toBe(true);
    expect(r.pypiData).not.toBeNull();
  });

  it("returns matches=false for open-notebook name collision (NIST vs lfnovo)", async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            info: {
              name: "open-notebook",
              version: "0.2.0",
              home_page: null,
              project_url: "https://pypi.org/project/open-notebook/",
              project_urls: {
                Homepage: "https://github.com/usnistgov/open-notebook",
                Documentation: "https://pages.nist.gov/open-notebook/",
              },
            },
            urls: [],
          }),
      }),
    ) as any;

    const r = await resolvePypiGithubIdentity(
      "open-notebook",
      "lfnovo",
      "open-notebook",
    );
    expect(r.matches).toBe(false);
    expect(r.reason).toMatch(/do not match|usnistgov/i);
    expect(r.pypiData?.info?.name).toBe("open-notebook");
  });

  it("returns matches=false on PyPI 404", async () => {
    global.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 404 }),
    ) as any;

    const r = await resolvePypiGithubIdentity(
      "definitely-not-a-real-pkg-xyz",
      "some",
      "repo",
    );
    expect(r.matches).toBe(false);
    expect(r.pypiData).toBeNull();
    expect(r.reason).toMatch(/not published|404/i);
  });
});

