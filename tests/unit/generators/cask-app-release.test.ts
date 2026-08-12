import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectCaskAppReleasePayload } from "../../../lib/generators/cask-app-release.ts";
import mcpsmFixture from "../../fixtures/github/mcpsm.json";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("cask_sha256_mock"),
  downloadAndHash: mock()
    .mockResolvedValue({ sha256: "ghcask_sha256_64chars_pad_abcdef0123456789abcdef0123456789ab" }),
  downloadToTemp: mock().mockResolvedValue({
    path: "/tmp/mock.zip",
    sha256: "ghcask_sha256_64chars_pad_abcdef0123456789abcdef0123456789ab",
    cleanup: mock(),
  }),
}));

mock.module("../../../lib/archive-inspector.ts", () => ({
  listZipEntries: mock().mockResolvedValue(["TestApp.app/"]),
  listArchiveEntries: mock().mockResolvedValue(["TestApp.app/"]),
  listDmgAppNames: mock().mockResolvedValue([]),
}));


function mockArchiveInspector(opts: { zip?: string[]; dmg?: string[] } = {}) {
  mock.module("../../../lib/archive-inspector.ts", () => ({
    listZipEntries: mock().mockResolvedValue(opts.zip ?? ["TestApp.app/"]),
    listArchiveEntries: mock().mockResolvedValue(opts.zip ?? ["TestApp.app/"]),
    listDmgAppNames: mock().mockResolvedValue(opts.dmg ?? []),
  }));
}

describe("collectCaskAppReleasePayload", () => {
  beforeEach(() => {
    mock.restore();
    mockArchiveInspector();
  });

  const repoInfo = {
    name: "seaquel",
    fullName: "webstonehq/seaquel",
    description: "Modern SQL client",
    homepage: "https://seaquel.app",
    htmlUrl: "https://github.com/webstonehq/seaquel",
    license: "MIT",
  };

  const release = {
    tagName: "v2026.4.8",
    assets: [
      {
        name: "Seaquel_2026.4.8_aarch64.dmg",
        url: "https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg",
      },
      {
        name: "Seaquel_2026.4.8_x64.dmg",
        url: "https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_x64.dmg",
      },
    ],
  };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.template).toBe("cask_app_release");
  });

  it("derives cask token from repo name", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.name).toBe("seaquel");
  });

  it("extracts version from tag", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.version).toBe("2026.4.8");
  });

  it("prefers .dmg asset over .zip", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.url).toContain(".dmg");
  });

  it("templates version into URL", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.url).toContain("#{version}");
  });

  it("falls back to app name from DMG filename when mount yields nothing", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.appName).toContain("Seaquel");
    expect(payload.appName).toContain(".app");
  });

  it("prefers app name from mounted DMG over filename heuristic", async () => {
    mockArchiveInspector({ zip: [], dmg: ["MCP Router.app"] });
    const mcpRelease = {
      tagName: "v0.6.3",
      assets: [
        {
          name: "MCP-Router.dmg",
          url: "https://github.com/mcp-router/mcp-router/releases/download/v0.6.3/MCP-Router.dmg",
        },
      ],
    };
    const payload = await collectCaskAppReleasePayload(
      {
        name: "mcp-router",
        fullName: "mcp-router/mcp-router",
        description: "MCP manager",
        homepage: "https://mcp-router.net",
        htmlUrl: "https://github.com/mcp-router/mcp-router",
      },
      mcpRelease,
    );
    expect(payload.appName).toBe("MCP Router.app");
    expect(payload.displayName).toBe("MCP Router");
  });

  it("detects .app inside zip-wrapped DMG and emits container nested (Nicotine+)", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const dir = await mkdtemp(join(tmpdir(), "allbrew-np-zip-"));
    const dmgName = "nicotine+-3.3.10.dmg";
    const zipPath = join(dir, "macos-arm64-installer.zip");
    try {
      await writeFile(join(dir, dmgName), "not-a-real-dmg");
      await execFileAsync("zip", ["-j", "-q", zipPath, join(dir, dmgName)]);

      mock.module("../../../lib/sha256.ts", () => ({
        hashUrl: mock().mockResolvedValue("cask_sha256_mock"),
        downloadAndHash: mock().mockResolvedValue({
          sha256: "np_sha256_64chars_pad_abcdef0123456789abcdef0123456789abcd",
        }),
        downloadToTemp: mock().mockResolvedValue({
          path: zipPath,
          sha256: "np_sha256_64chars_pad_abcdef0123456789abcdef0123456789abcd",
          cleanup: mock(),
        }),
      }));
      mockArchiveInspector({
        zip: [dmgName],
        dmg: ["Nicotine+.app"],
      });

      const npRelease = {
        tagName: "3.3.10",
        assets: [
          {
            name: "macos-arm64-installer.zip",
            url: "https://github.com/nicotine-plus/nicotine-plus/releases/download/3.3.10/macos-arm64-installer.zip",
          },
          {
            name: "macos-x86_64-installer.zip",
            url: "https://github.com/nicotine-plus/nicotine-plus/releases/download/3.3.10/macos-x86_64-installer.zip",
          },
        ],
      };
      const payload = await collectCaskAppReleasePayload(
        {
          name: "nicotine-plus",
          fullName: "nicotine-plus/nicotine-plus",
          description: "Graphical client for the Soulseek peer-to-peer network",
          homepage: "https://nicotine-plus.org",
          htmlUrl: "https://github.com/nicotine-plus/nicotine-plus",
        },
        npRelease,
      );
      expect(payload.template).toBe("cask_app_release");
      expect(payload.appName).toBe("Nicotine+.app");
      expect(payload.displayName).toBe("Nicotine+");
      expect(payload.containerBlock).toContain("container nested:");
      expect(payload.containerBlock).toContain("nicotine+-#{version}.dmg");
      expect(payload.url).toContain("macos-arm64-installer.zip");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps nested wrapper path for .app (lucor/paw forceAppAssets)", async () => {
    mockArchiveInspector({
      zip: [
        "paw-0.27.0-macos-arm64/",
        "paw-0.27.0-macos-arm64/Paw.app/",
        "paw-0.27.0-macos-arm64/Paw.app/Contents/MacOS/paw",
        "paw-0.27.0-macos-arm64/THIRD_PARTY_LICENSES",
      ],
    });
    const pawRelease = {
      tagName: "v0.27.0",
      assets: [
        {
          name: "paw-0.27.0-macos-arm64.zip",
          url: "https://github.com/lucor/paw/releases/download/v0.27.0/paw-0.27.0-macos-arm64.zip",
        },
        {
          name: "paw-0.27.0-macos-amd64.zip",
          url: "https://github.com/lucor/paw/releases/download/v0.27.0/paw-0.27.0-macos-amd64.zip",
        },
      ],
    };
    const payload = await collectCaskAppReleasePayload(
      {
        name: "paw",
        fullName: "lucor/paw",
        description: "password manager",
        homepage: "https://paw.pm",
        htmlUrl: "https://github.com/lucor/paw",
      },
      pawRelease,
      { forceAppAssets: true },
    );
    expect(payload.template).toBe("cask_app_release");
    // Nested path kept + version templated so brew finds the app under the wrapper.
    expect(payload.appName).toContain("Paw.app");
    expect(payload.appName).toContain("#{version}");
    expect(payload.appName).toMatch(/macos-arm64|macos-amd64/);
    expect(payload.displayName).toBe("Paw");
    expect(payload.url).toMatch(/\.zip/);
    expect(payload.url).not.toMatch(/minisig/);
  });

  it("uses repo description", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.desc).toBe("Modern SQL client");
  });

  it("uses repo homepage", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.homepage).toBe("https://seaquel.app");
  });

  it("generates zap block", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("Library/Application Support");
  });

  it("includes SHA256", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.sha256).toBeTruthy();
  });

  it("respects name override", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release, {
      name: "custom-seaquel",
    });
    expect(payload.name).toBe("custom-seaquel");
  });

  it("respects appName override", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release, {
      appName: "MyApp.app",
    });
    expect(payload.appName).toBe("MyApp.app");
    expect(payload.displayName).toBe("MyApp");
  });

  it("throws when no app assets found", async () => {
    const noAppRelease = {
      ...release,
      assets: [{ name: "source.tar.gz", url: "..." }],
    };
    await expect(
      collectCaskAppReleasePayload(repoInfo, noAppRelease),
    ).rejects.toThrow("No .dmg or macOS .zip assets");
  });

  it("falls back to .zip when no .dmg", async () => {
    mockArchiveInspector({ zip: ["Seaquel.app/"] });
    const zipRelease = {
      tagName: "v1.0.0",
      assets: [
        {
          name: "Seaquel-macos.zip",
          url: "https://github.com/webstonehq/seaquel/releases/download/v1.0.0/Seaquel-macos.zip",
        },
      ],
    };
    const payload = await collectCaskAppReleasePayload(
      repoInfo,
      zipRelease,
    );
    expect(payload.url).toContain(".zip");
    expect(payload.appName).toBe("Seaquel.app");
  });

  it("throws when zip has no .app bundle instead of inventing Repo.app", async () => {
    mockArchiveInspector({ zip: ["bin/gogs", "README.md"] });
    const zipRelease = {
      tagName: "v0.14.3",
      assets: [
        {
          name: "gogs_0.14.3_darwin_amd64.zip",
          // still classified only if isAppAsset; force via app-named zip without .app inside
          url: "https://example.com/Foo-macos.zip",
        },
      ],
    };
    // Asset name must pass isAppAsset (macos zip without cpu arch)
    zipRelease.assets[0].name = "Foo-macos.zip";
    await expect(
      collectCaskAppReleasePayload(repoInfo, zipRelease),
    ).rejects.toThrow(/No \.app bundle found/);
  });
});

describe("collectCaskAppReleasePayload — Zap terminal (dual assets, cask collision)", () => {
  beforeEach(() => {
    mock.restore();
    mockArchiveInspector({ dmg: ["Zap.app"] });
  });

  const zapRepoInfo = {
    name: "zap",
    fullName: "zerx-lab/zap",
    description:
      "Zap is an open, local-first terminal with first-class AI and agent support.",
    homepage: "https://zap.zerx.dev",
    htmlUrl: "https://github.com/zerx-lab/zap",
    license: "AGPL-3.0",
  };

  const zapRelease = {
    tagName: "v2026.07.09.1",
    assets: [
      {
        name: "Zap-arm64.dmg",
        url: "https://github.com/zerx-lab/zap/releases/download/v2026.07.09.1/Zap-arm64.dmg",
      },
      {
        name: "Zap-intel.dmg",
        url: "https://github.com/zerx-lab/zap/releases/download/v2026.07.09.1/Zap-intel.dmg",
      },
      {
        name: "zap-macos-aarch64.tar.gz",
        url: "https://github.com/zerx-lab/zap/releases/download/v2026.07.09.1/zap-macos-aarch64.tar.gz",
      },
      {
        name: "zap-macos-x86_64.tar.gz",
        url: "https://github.com/zerx-lab/zap/releases/download/v2026.07.09.1/zap-macos-x86_64.tar.gz",
      },
    ],
  };

  it("builds cask payload from DMG when dual assets are present", async () => {
    const payload = await collectCaskAppReleasePayload(zapRepoInfo, zapRelease, {
      name: "zap-zerx-lab",
      appName: "Zap.app",
    });
    expect(payload.template).toBe("cask_app_release");
    expect(payload.name).toBe("zap-zerx-lab");
    expect(payload.version).toBe("2026.07.09.1");
    expect(payload.appName).toBe("Zap.app");
    expect(payload.url).toContain("Zap-arm64.dmg");
    expect(payload.url).toContain("#{version}");
    expect(payload.homepage).toBe("https://zap.zerx.dev");
  });
});

describe("collectCaskAppReleasePayload — KnowNote (Electron, lowercase DMG)", () => {
  beforeEach(() => {
    mock.restore();
    mockArchiveInspector();
  });

  const knowNoteRepoInfo = {
    name: "KnowNote",
    fullName: "MrSibe/KnowNote",
    description:
      "Local-first open-source alternative to Google NotebookLM with RAG and private LLMs",
    homepage: "https://github.com/MrSibe/KnowNote",
    htmlUrl: "https://github.com/MrSibe/KnowNote",
    license: "GPL-3.0",
  };

  const knowNoteRelease = {
    tagName: "v1.2.0",
    assets: [
      {
        name: "KnowNote-1.2.0-arm64-mac.zip",
        url: "https://github.com/MrSibe/KnowNote/releases/download/v1.2.0/KnowNote-1.2.0-arm64-mac.zip",
      },
      {
        name: "knownote-1.2.0.dmg",
        url: "https://github.com/MrSibe/KnowNote/releases/download/v1.2.0/knownote-1.2.0.dmg",
      },
      {
        name: "knownote-1.2.0-setup.exe",
        url: "https://github.com/MrSibe/KnowNote/releases/download/v1.2.0/knownote-1.2.0-setup.exe",
      },
      {
        name: "latest-mac.yml",
        url: "https://github.com/MrSibe/KnowNote/releases/download/v1.2.0/latest-mac.yml",
      },
    ],
  };

  it("returns correct template identifier", async () => {
    const payload = await collectCaskAppReleasePayload(
      knowNoteRepoInfo,
      knowNoteRelease,
    );
    expect(payload.template).toBe("cask_app_release");
  });

  it("derives cask token from repo name", async () => {
    const payload = await collectCaskAppReleasePayload(
      knowNoteRepoInfo,
      knowNoteRelease,
    );
    expect(payload.name).toBe("knownote");
  });

  it("extracts version from tag", async () => {
    const payload = await collectCaskAppReleasePayload(
      knowNoteRepoInfo,
      knowNoteRelease,
    );
    expect(payload.version).toBe("1.2.0");
  });

  it("prefers .dmg over .zip, .exe, and .yml assets", async () => {
    const payload = await collectCaskAppReleasePayload(
      knowNoteRepoInfo,
      knowNoteRelease,
    );
    expect(payload.url).toContain(".dmg");
    expect(payload.url).not.toContain(".zip");
    expect(payload.url).not.toContain(".exe");
    expect(payload.url).not.toContain(".yml");
  });

  it("templates version into URL", async () => {
    const payload = await collectCaskAppReleasePayload(
      knowNoteRepoInfo,
      knowNoteRelease,
    );
    expect(payload.url).toContain("#{version}");
  });

  it("uses repo description", async () => {
    const payload = await collectCaskAppReleasePayload(
      knowNoteRepoInfo,
      knowNoteRelease,
    );
    expect(payload.desc).toContain("NotebookLM");
  });

  it("generates zap block", async () => {
    const payload = await collectCaskAppReleasePayload(
      knowNoteRepoInfo,
      knowNoteRelease,
    );
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("Library/Application Support");
  });

  it("includes SHA256", async () => {
    const payload = await collectCaskAppReleasePayload(
      knowNoteRepoInfo,
      knowNoteRelease,
    );
    expect(payload.sha256).toBeTruthy();
  });
});

describe("collectCaskAppReleasePayload — Codeg (Tauri 2)", () => {
  beforeEach(() => {
    mock.restore();
    mockArchiveInspector();
  });

  const codegRepoInfo = {
    name: "codeg",
    fullName: "xintaofei/codeg",
    description:
      "Collaborative multi-agent AI coding workspace: aggregate sessions from Claude Code, Codex, OpenCode, etc.",
    homepage: "https://github.com/xintaofei/codeg",
    htmlUrl: "https://github.com/xintaofei/codeg",
    license: "Apache-2.0",
  };

  const codegRelease = {
    tagName: "v0.18.2",
    assets: [
      {
        name: "codeg_0.18.2_aarch64.dmg",
        url: "https://github.com/xintaofei/codeg/releases/download/v0.18.2/codeg_0.18.2_aarch64.dmg",
      },
      {
        name: "codeg_0.18.2_x64.dmg",
        url: "https://github.com/xintaofei/codeg/releases/download/v0.18.2/codeg_0.18.2_x64.dmg",
      },
      {
        name: "codeg-server-darwin-arm64.tar.gz",
        url: "https://github.com/xintaofei/codeg/releases/download/v0.18.2/codeg-server-darwin-arm64.tar.gz",
      },
      {
        name: "codeg_0.18.2_amd64.deb",
        url: "https://github.com/xintaofei/codeg/releases/download/v0.18.2/codeg_0.18.2_amd64.deb",
      },
    ],
  };

  it("returns correct template identifier", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    expect(payload.template).toBe("cask_app_release");
  });

  it("derives cask token from repo name", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    expect(payload.name).toBe("codeg");
  });

  it("extracts version from tag", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    expect(payload.version).toBe("0.18.2");
  });

  it("prefers .dmg over server tarball and .deb", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    expect(payload.url).toContain(".dmg");
    expect(payload.url).not.toContain(".tar.gz");
    expect(payload.url).not.toContain(".deb");
  });

  it("templates version into URL", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    expect(payload.url).toContain("#{version}");
  });

  it("detects app name from DMG filename", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    expect(payload.appName).toContain(".app");
  });

  it("uses repo description", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    expect(payload.desc).toContain("multi-agent");
  });

  it("generates zap block", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    expect(payload.zapBlock).toContain("zap trash:");
  });

  it("includes SHA256", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    expect(payload.sha256).toBeTruthy();
  });
});

describe("collectCaskAppReleasePayload — HarnessKit (Tauri 2, arch-specific DMGs + hk CLI binary)", () => {
  beforeEach(() => {
    mock.restore();
    mockArchiveInspector();
  });

  const harnessKitRepoInfo = {
    name: "HarnessKit",
    fullName: "RealZST/HarnessKit",
    description: "One home for every agent. Free, open-source app to manage all your AI coding agents.",
    homepage: "https://github.com/RealZST/HarnessKit",
    htmlUrl: "https://github.com/RealZST/HarnessKit",
    license: "Apache-2.0",
  };

  const harnessKitRelease = {
    tagName: "v1.6.5",
    assets: [
      {
        name: "HarnessKit_1.6.5_aarch64.dmg",
        url: "https://github.com/RealZST/HarnessKit/releases/download/v1.6.5/HarnessKit_1.6.5_aarch64.dmg",
      },
      {
        name: "HarnessKit_1.6.5_x64.dmg",
        url: "https://github.com/RealZST/HarnessKit/releases/download/v1.6.5/HarnessKit_1.6.5_x64.dmg",
      },
      {
        name: "HarnessKit_aarch64.app.tar.gz",
        url: "https://github.com/RealZST/HarnessKit/releases/download/v1.6.5/HarnessKit_aarch64.app.tar.gz",
      },
      {
        name: "hk-macos-arm64",
        url: "https://github.com/RealZST/HarnessKit/releases/download/v1.6.5/hk-macos-arm64",
      },
      {
        name: "hk-macos-x64",
        url: "https://github.com/RealZST/HarnessKit/releases/download/v1.6.5/hk-macos-x64",
      },
      {
        name: "hk-linux-arm64",
        url: "https://github.com/RealZST/HarnessKit/releases/download/v1.6.5/hk-linux-arm64",
      },
    ],
  };

  it("returns correct template identifier", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    expect(payload.template).toBe("cask_app_release");
  });

  it("derives lowercase cask token from repo name", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    expect(payload.name).toBe("harnesskit");
  });

  it("extracts version from tag", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    expect(payload.version).toBe("1.6.5");
  });

  it("prefers .dmg over .tar.gz and bare CLI binaries", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    expect(payload.url).toContain(".dmg");
    expect(payload.url).not.toContain(".tar.gz");
    expect(payload.url).not.toContain("hk-macos");
  });

  it("templates version into URL", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    expect(payload.url).toContain("#{version}");
  });

  it("detects app name from a versioned architecture-specific DMG filename", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    expect(payload.appName).toBe("HarnessKit.app");
  });

  it("uses repo description", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    expect(payload.desc).toContain("agent");
  });

  it("generates zap block", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("Library/Application Support");
  });

  it("includes SHA256", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    expect(payload.sha256).toBeTruthy();
  });

});

describe("collectCaskAppReleasePayload — MōIcons (arm64-only DMG, MōBrowser runtime)", () => {
  beforeEach(() => {
    mock.restore();
    mockArchiveInspector();
  });

  const moIconsRepoInfo = {
    name: "icons",
    fullName: "mo-browser-apps/icons",
    description: "Generate macOS app icons with AI",
    homepage: "https://github.com/mo-browser-apps/icons",
    htmlUrl: "https://github.com/mo-browser-apps/icons",
    license: "MIT",
  };

  const moIconsRelease = {
    tagName: "v1.0.3",
    assets: [
      {
        name: "MoIcons-1.0.3-arm64.dmg",
        url: "https://github.com/mo-browser-apps/icons/releases/download/v1.0.3/MoIcons-1.0.3-arm64.dmg",
      },
    ],
  };

  it("returns correct template identifier", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
    );
    expect(payload.template).toBe("cask_app_release");
  });

  it("derives cask token from repo name", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
    );
    expect(payload.name).toBe("icons");
  });

  it("respects name override for canonical cask token", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
      { name: "moicons" },
    );
    expect(payload.name).toBe("moicons");
  });

  it("extracts version from tag", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
    );
    expect(payload.version).toBe("1.0.3");
  });

  it("selects the only DMG asset (arm64-only, no x64 fallback)", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
    );
    expect(payload.url).toContain(".dmg");
    expect(payload.url).toContain("MoIcons");
  });

  it("templates version into URL", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
    );
    expect(payload.url).toContain("#{version}");
  });

  it("falls back to app name from DMG filename when mount yields nothing", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
    );
    expect(payload.appName).toContain("MoIcons");
    expect(payload.appName).toContain(".app");
  });

  it("respects appName override", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
      { appName: "MoIcons.app" },
    );
    expect(payload.appName).toBe("MoIcons.app");
    expect(payload.displayName).toBe("MoIcons");
  });

  it("uses repo description", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
    );
    expect(payload.desc).toContain("macOS app icons");
  });

  it("generates zap block", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
    );
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("Library/Application Support");
  });

  it("includes SHA256", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
    );
    expect(payload.sha256).toBeTruthy();
  });
});

describe("collectCaskAppReleasePayload — Eigent (AI Desktop Agent)", () => {
  beforeEach(() => {
    mock.restore();
    mockArchiveInspector();
  });

  const eigentRepoInfo = {
    name: "eigent",
    fullName: "eigent-ai/eigent",
    description: "The Open Source Cowork Desktop to Unlock Your Exceptional Productivity",
    homepage: "https://www.eigent.ai/",
    htmlUrl: "https://github.com/eigent-ai/eigent",
    license: "Apache-2.0",
  };

  const eigentRelease = {
    tagName: "v1.0.1",
    assets: [
      {
        name: "Eigent-1.0.1-arm64-mac.zip",
        url: "https://github.com/eigent-ai/eigent/releases/download/v1.0.1/Eigent-1.0.1-arm64-mac.zip",
      },
      {
        name: "Eigent-1.0.1-arm64.dmg",
        url: "https://github.com/eigent-ai/eigent/releases/download/v1.0.1/Eigent-1.0.1-arm64.dmg",
      },
      {
        name: "Eigent-1.0.1-mac.zip",
        url: "https://github.com/eigent-ai/eigent/releases/download/v1.0.1/Eigent-1.0.1-mac.zip",
      },
      {
        name: "Eigent-1.0.1.dmg",
        url: "https://github.com/eigent-ai/eigent/releases/download/v1.0.1/Eigent-1.0.1.dmg",
      },
      {
        name: "Eigent-1.0.1.AppImage",
        url: "https://github.com/eigent-ai/eigent/releases/download/v1.0.1/Eigent-1.0.1.AppImage",
      },
      {
        name: "Eigent.Setup.1.0.1.exe",
        url: "https://github.com/eigent-ai/eigent/releases/download/v1.0.1/Eigent.Setup.1.0.1.exe",
      },
    ],
  };

  it("returns correct template identifier", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.template).toBe("cask_app_release");
  });

  it("derives cask token from repo name", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.name).toBe("eigent");
  });

  it("extracts version from tag", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.version).toBe("1.0.1");
  });

  it("prefers .dmg over .zip, .AppImage, and .exe assets", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.url).toContain(".dmg");
    expect(payload.url).not.toContain(".zip");
    expect(payload.url).not.toContain(".AppImage");
    expect(payload.url).not.toContain(".exe");
  });

  it("templates version into URL", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.url).toContain("#{version}");
  });

  it("detects app name from DMG filename", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.appName).toContain("Eigent");
    expect(payload.appName).toContain(".app");
  });

  it("uses repo description", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.desc).toContain("Cowork Desktop");
  });

  it("uses repo homepage", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.homepage).toBe("https://www.eigent.ai/");
  });

  it("generates zap block", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("Library/Application Support");
  });

  it("includes SHA256", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.sha256).toBeTruthy();
  });
});

describe("collectCaskAppReleasePayload — Hermes One (Electron, arm64+x64 DMG, name override)", () => {
  beforeEach(() => {
    mock.restore();
    mockArchiveInspector();
  });

  const hermesOneRepoInfo = {
    name: "hermes-desktop",
    fullName: "fathah/hermes-desktop",
    description:
      "Community maintained native desktop app for Hermes Agent — a self-improving AI assistant",
    homepage: "https://hermesone.org",
    htmlUrl: "https://github.com/fathah/hermes-desktop",
    license: "MIT",
  };

  const hermesOneRelease = {
    tagName: "v0.7.3",
    assets: [
      {
        name: "hermes-desktop-0.7.3-arm64-mac.zip",
        url: "https://github.com/fathah/hermes-desktop/releases/download/v0.7.3/hermes-desktop-0.7.3-arm64-mac.zip",
      },
      {
        name: "hermes-desktop-0.7.3-arm64.dmg",
        url: "https://github.com/fathah/hermes-desktop/releases/download/v0.7.3/hermes-desktop-0.7.3-arm64.dmg",
      },
      {
        name: "hermes-desktop-0.7.3-portable.exe",
        url: "https://github.com/fathah/hermes-desktop/releases/download/v0.7.3/hermes-desktop-0.7.3-portable.exe",
      },
      {
        name: "hermes-desktop-0.7.3-setup.exe",
        url: "https://github.com/fathah/hermes-desktop/releases/download/v0.7.3/hermes-desktop-0.7.3-setup.exe",
      },
      {
        name: "hermes-desktop-0.7.3-x64-mac.zip",
        url: "https://github.com/fathah/hermes-desktop/releases/download/v0.7.3/hermes-desktop-0.7.3-x64-mac.zip",
      },
      {
        name: "hermes-desktop-0.7.3-x64.dmg",
        url: "https://github.com/fathah/hermes-desktop/releases/download/v0.7.3/hermes-desktop-0.7.3-x64.dmg",
      },
    ],
  };

  it("returns correct template identifier", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one" },
    );
    expect(payload.template).toBe("cask_app_release");
  });

  it("uses name override to avoid collision with dodo-reach/hermes-desktop", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one" },
    );
    expect(payload.name).toBe("hermes-one");
  });

  it("defaults to repo-derived cask token without override", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
    );
    expect(payload.name).toBe("hermes-desktop");
  });

  it("extracts version from tag", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one" },
    );
    expect(payload.version).toBe("0.7.3");
  });

  it("prefers .dmg over .zip and .exe assets", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one" },
    );
    expect(payload.url).toContain(".dmg");
    expect(payload.url).not.toContain(".zip");
    expect(payload.url).not.toContain(".exe");
  });

  it("templates version into URL", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one" },
    );
    expect(payload.url).toContain("#{version}");
  });

  it("falls back to app name from DMG filename when mount yields nothing", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one" },
    );
    expect(payload.appName).toContain(".app");
  });

  it("respects appName override", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one", appName: "Hermes Desktop.app" },
    );
    expect(payload.appName).toBe("Hermes Desktop.app");
    expect(payload.displayName).toBe("Hermes Desktop");
  });

  it("uses repo description", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one" },
    );
    expect(payload.desc).toContain("Hermes Agent");
  });

  it("uses repo homepage", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one" },
    );
    expect(payload.homepage).toBe("https://hermesone.org");
  });

  it("generates zap block", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one" },
    );
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("Library/Application Support");
  });

  it("includes SHA256", async () => {
    const payload = await collectCaskAppReleasePayload(
      hermesOneRepoInfo,
      hermesOneRelease,
      { name: "hermes-one" },
    );
    expect(payload.sha256).toBeTruthy();
  });
});

describe("collectCaskAppReleasePayload — MCPSM (Rust .app.zip only)", () => {
  beforeEach(() => {
    mock.restore();
    mockArchiveInspector({ zip: ["MCPSM.app/"] });
  });

  const repoInfo = mcpsmFixture.repo;
  const release = mcpsmFixture.release;

  it("returns payload with correct template identifier", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.template).toBe("cask_app_release");
  });

  it("derives cask token from repo name by default", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.name).toBe("mcp-server-manager");
  });

  it("respects name override to short product token", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release, {
      name: "mcpsm",
    });
    expect(payload.name).toBe("mcpsm");
  });

  it("extracts version from tag", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.version).toBe("1.1.3");
  });

  it("selects MCPSM.app.zip when no DMG is present", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.url).toContain(".zip");
    expect(payload.url).not.toContain(".dmg");
    expect(payload.url).toContain("MCPSM");
    expect(payload.url).toContain("#{version}");
  });

  it("detects app name from zip entries", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.appName).toBe("MCPSM.app");
    expect(payload.displayName).toBe("MCPSM");
  });

  it("uses repo description", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.desc).toContain("Model Context Protocol");
  });

  it("uses repo htmlUrl as homepage when homepage is null", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.homepage).toBe(
      "https://github.com/antruongnguyen/mcp-server-manager",
    );
  });

  it("generates zap block", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("Library/Application Support");
  });

  it("includes SHA256", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.sha256).toBeTruthy();
  });
});

describe("collectCaskAppReleasePayload — ComicTagger (bare tag, version in asset name)", () => {
  beforeEach(() => {
    mock.restore();
    mockArchiveInspector({ zip: ["ComicTagger.app/"] });
  });

  const repoInfo = {
    name: "comictagger",
    fullName: "comictagger/comictagger",
    description: "A multi-platform app for writing metadata to digital comics",
    homepage: "https://github.com/comictagger/comictagger",
    htmlUrl: "https://github.com/comictagger/comictagger",
    license: "Apache-2.0",
  };

  const release = {
    // GitHub release tag is bare "1.5.5" (no v prefix); asset basename also embeds 1.5.5
    tagName: "1.5.5",
    assets: [
      {
        name: "ComicTagger-1.5.5-osx-10.15.7-x86_64.app.zip",
        url: "https://github.com/comictagger/comictagger/releases/download/1.5.5/ComicTagger-1.5.5-osx-10.15.7-x86_64.app.zip",
      },
      {
        name: "comictagger-1.5.5-py3-none-any.whl",
        url: "https://github.com/comictagger/comictagger/releases/download/1.5.5/comictagger-1.5.5-py3-none-any.whl",
      },
    ],
  };

  it("templates bare tag without injecting v into asset basename", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release, {
      name: "comictagger-comictagger",
    });
    expect(payload.template).toBe("cask_app_release");
    expect(payload.version).toBe("1.5.5");
    expect(payload.url).toBe(
      "https://github.com/comictagger/comictagger/releases/download/#{version}/ComicTagger-#{version}-osx-10.15.7-x86_64.app.zip",
    );
    expect(payload.url).not.toContain("ComicTagger-v#{version}");
    expect(payload.appName).toBe("ComicTagger.app");
  });
});
