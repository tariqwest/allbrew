import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectCaskAppReleasePayload } from "../../../lib/generators/cask-app-release.ts";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("cask_sha256_mock"),
  downloadAndHash: vi
    .fn()
    .mockResolvedValue({ sha256: "ghcask_sha256_64chars_pad_abcdef0123456789abcdef0123456789ab" }),
  downloadToTemp: vi.fn().mockResolvedValue({ path: "/tmp/mock.zip" }),
}));

vi.mock("../../../lib/archive-inspector.ts", () => ({
  listZipEntries: vi.fn().mockResolvedValue(["TestApp.app/"]),
}));

describe("collectCaskAppReleasePayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  it("detects app name from DMG filename", async () => {
    const payload = await collectCaskAppReleasePayload(repoInfo, release);
    expect(payload.appName).toContain("Seaquel");
    expect(payload.appName).toContain(".app");
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
    const zipRelease = {
      tagName: "v1.0.0",
      assets: [
        {
          name: "Seaquel-macos-arm64.zip",
          url: "https://github.com/webstonehq/seaquel/releases/download/v1.0.0/Seaquel-macos-arm64.zip",
        },
      ],
    };
    const payload = await collectCaskAppReleasePayload(
      repoInfo,
      zipRelease,
    );
    expect(payload.url).toContain(".zip");
  });
});

describe("collectCaskAppReleasePayload — KnowNote (Electron, lowercase DMG)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    vi.restoreAllMocks();
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
