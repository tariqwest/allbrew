import { describe, it, expect } from "vitest";
import { collectCaskAppPayload } from "../../lib/generators/cask-app.ts";
import { collectCaskAppReleasePayload } from "../../lib/generators/cask-app-release.ts";
import { renderCask } from "../../lib/template-renderer.ts";
import { assertValidCask } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: downloads real DMG/ZIP assets, validates SHA + cask Ruby.
 * Run: bun run test:int
 */

describe.concurrent("cask-app integration", () => {
  it("Seaquel DMG: payload is well-formed", async () => {
    const url =
      "https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "seaquel",
      appName: "Seaquel.app",
      homepage: "https://seaquel.app",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toContain("2026.4.8");
    expect(payload.url).toContain("Seaquel");
  });

  it("Seaquel DMG: generates structurally valid Ruby cask", async () => {
    const url =
      "https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "seaquel",
      appName: "Seaquel.app",
      homepage: "https://seaquel.app",
    });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "seaquel" do');
    expect(ruby).toContain('app "Seaquel.app"');
  });

  it("ApiArk DMG: payload is well-formed", async () => {
    const url =
      "https://github.com/berbicanes/apiark/releases/download/v0.4.6/ApiArk_0.4.6_aarch64.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "apiark",
      appName: "ApiArk.app",
      homepage: "https://github.com/berbicanes/apiark",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toContain("0.4.6");
  });

  it("ApiArk DMG: generates structurally valid Ruby cask", async () => {
    const url =
      "https://github.com/berbicanes/apiark/releases/download/v0.4.6/ApiArk_0.4.6_aarch64.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "apiark",
      appName: "ApiArk.app",
      homepage: "https://github.com/berbicanes/apiark",
    });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "apiark" do');
    expect(ruby).toContain('app "ApiArk.app"');
  });

  it("UTM /latest/ redirect: version is null, payload is well-formed", async () => {
    const url = "https://github.com/utmapp/UTM/releases/latest/download/UTM.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "utm",
      appName: "UTM.app",
      homepage: "https://getutm.app",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toBe("");
  }, 60000);

  it("LocalSend DMG: version extracted from filename", async () => {
    const url =
      "https://github.com/localsend/localsend/releases/download/v1.17.0/LocalSend-1.17.0.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "localsend",
      appName: "LocalSend.app",
      homepage: "https://localsend.org",
    });
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toContain("1.17.0");
    const ruby = renderCask(payload);
    assertValidCask(ruby);
  });

  it("Ollama ZIP: .zip containing .app produces valid cask", async () => {
    const url = "https://ollama.com/download/Ollama-darwin.zip";
    const payload = await collectCaskAppPayload(url, {
      name: "ollama-test",
      appName: "Ollama.app",
      homepage: "https://ollama.com",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "ollama-test" do');
    expect(ruby).toContain('app "Ollama.app"');
  }, 60000);

  it("balenaEtcher /latest/ redirect: arch in filename, no version", async () => {
    const url =
      "https://github.com/balena-io/etcher/releases/latest/download/balenaEtcher-darwin-arm64.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "balenaetcher",
      appName: "balenaEtcher.app",
      homepage: "https://etcher.balena.io",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toBe("");
    const ruby = renderCask(payload);
    assertValidCask(ruby);
  }, 60000);

  it("Otty DMG: payload is well-formed (developer-site download)", async () => {
    const url = "https://downloads.otty.sh/macos/Otty.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "otty",
      appName: "Otty.app",
      homepage: "https://otty.sh",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toBe("");
    expect(payload.url).toContain("downloads.otty.sh");
  }, 60000);

  it("Otty DMG: generates structurally valid Ruby cask", async () => {
    const url = "https://downloads.otty.sh/macos/Otty.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "otty",
      appName: "Otty.app",
      homepage: "https://otty.sh",
    });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "otty" do');
    expect(ruby).toContain('app "Otty.app"');
    expect(ruby).toContain("https://otty.sh");
  }, 60000);

  it("Postman: version in CDN URL, payload is well-formed", async () => {
    const url = "https://dl.pstmn.io/download/version/12.16.4/osx_arm64";
    const payload = await collectCaskAppPayload(url, {
      name: "postman",
      appName: "Postman.app",
      homepage: "https://www.postman.com",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toContain("12.16.4");
    expect(payload.url).toContain("dl.pstmn.io");
  }, 120000);

  it("Postman: generates structurally valid Ruby cask", async () => {
    const url = "https://dl.pstmn.io/download/version/12.16.4/osx_arm64";
    const payload = await collectCaskAppPayload(url, {
      name: "postman",
      appName: "Postman.app",
      homepage: "https://www.postman.com",
    });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "postman" do');
    expect(ruby).toContain('app "Postman.app"');
    expect(ruby).toContain("https://www.postman.com");
  }, 120000);

  it("Discord DMG: version in CDN URL, payload is well-formed", async () => {
    const url = "https://dl.discordapp.net/apps/osx/0.0.385/Discord.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "discord",
      appName: "Discord.app",
      homepage: "https://discord.com/",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toContain("0.0.385");
    expect(payload.url).toContain("dl.discordapp.net");
  }, 120000);

  it("Discord DMG: generates structurally valid Ruby cask", async () => {
    const url = "https://dl.discordapp.net/apps/osx/0.0.385/Discord.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "discord",
      appName: "Discord.app",
      homepage: "https://discord.com/",
    });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "discord" do');
    expect(ruby).toContain('app "Discord.app"');
    expect(ruby).toContain("https://discord.com/");
  }, 120000);

  it("OnyX DMG: developer-site download, payload is well-formed", async () => {
    const url = "https://www.titanium-software.fr/download/26/OnyX.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "onyx",
      appName: "OnyX.app",
      homepage: "https://www.titanium-software.fr/en/onyx.html",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toBe("");
    expect(payload.url).toContain("titanium-software.fr");
  }, 120000);

  it("OnyX DMG: generates structurally valid Ruby cask", async () => {
    const url = "https://www.titanium-software.fr/download/26/OnyX.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "onyx",
      appName: "OnyX.app",
      homepage: "https://www.titanium-software.fr/en/onyx.html",
    });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "onyx" do');
    expect(ruby).toContain('app "OnyX.app"');
    expect(ruby).toContain("https://www.titanium-software.fr/en/onyx.html");
  }, 120000);

  it("Little Snitch DMG: version in filename, payload is well-formed", async () => {
    const url = "https://www.obdev.at/downloads/littlesnitch/LittleSnitch-6.4.1.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "little-snitch",
      appName: "Little Snitch.app",
      homepage: "https://www.obdev.at/products/littlesnitch/index.html",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toContain("6.4.1");
    expect(payload.url).toContain("obdev.at");
  }, 120000);

  it("Little Snitch DMG: generates structurally valid Ruby cask with spaced app name", async () => {
    const url = "https://www.obdev.at/downloads/littlesnitch/LittleSnitch-6.4.1.dmg";
    const payload = await collectCaskAppPayload(url, {
      name: "little-snitch",
      appName: "Little Snitch.app",
      homepage: "https://www.obdev.at/products/littlesnitch/index.html",
    });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "little-snitch" do');
    expect(ruby).toContain('app "Little Snitch.app"');
    expect(ruby).toContain("https://www.obdev.at/products/littlesnitch/index.html");
  }, 120000);

  it("Pictogram ZIP: developer-site ZIP, payload is well-formed", async () => {
    const url = "https://pictogramapp.com/updates/v0.1%20%28Build%2013%29.zip";
    const payload = await collectCaskAppPayload(url, {
      name: "pictogram",
      appName: "Pictogram.app",
      homepage: "https://pictogramapp.com/",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toContain("0.1");
    expect(payload.url).toContain("pictogramapp.com");
  }, 120000);

  it("Pictogram ZIP: generates structurally valid Ruby cask", async () => {
    const url = "https://pictogramapp.com/updates/v0.1%20%28Build%2013%29.zip";
    const payload = await collectCaskAppPayload(url, {
      name: "pictogram",
      appName: "Pictogram.app",
      homepage: "https://pictogramapp.com/",
    });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "pictogram" do');
    expect(ruby).toContain('app "Pictogram.app"');
    expect(ruby).toContain("https://pictogramapp.com/");
  }, 120000);

  it("IconChamp ZIP: GitHub raw rolling ZIP, payload is well-formed", async () => {
    const url = "https://github.com/MacEnhance/appcast/raw/master/IconChamp/IconChamp.zip";
    const payload = await collectCaskAppPayload(url, {
      name: "iconchamp",
      appName: "IconChamp.app",
      homepage: "https://www.macenhance.com/iconchamp",
    });
    expect(payload.template).toBe("cask_app");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.versionLine).toBe("");
    expect(payload.url).toContain("MacEnhance/appcast");
  }, 120000);

  it("IconChamp ZIP: generates structurally valid Ruby cask", async () => {
    const url = "https://github.com/MacEnhance/appcast/raw/master/IconChamp/IconChamp.zip";
    const payload = await collectCaskAppPayload(url, {
      name: "iconchamp",
      appName: "IconChamp.app",
      homepage: "https://www.macenhance.com/iconchamp",
    });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "iconchamp" do');
    expect(ruby).toContain('app "IconChamp.app"');
    expect(ruby).toContain("https://www.macenhance.com/iconchamp");
  }, 120000);
});

describe.concurrent("cask-app-release integration", () => {
  const seaquelRepoInfo = {
    name: "seaquel",
    fullName: "webstonehq/seaquel",
    description: "A modern, intuitive SQL client",
    homepage: "https://seaquel.app",
    htmlUrl: "https://github.com/webstonehq/seaquel",
    license: "MIT",
  };

  const seaquelRelease = {
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

  it("Seaquel: payload from release is well-formed", async () => {
    const payload = await collectCaskAppReleasePayload(
      seaquelRepoInfo,
      seaquelRelease,
    );
    expect(payload.template).toBe("cask_app_release");
    expect(payload.name).toBe("seaquel");
    expect(payload.version).toBe("2026.4.8");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.url).toContain("#{version}");
    expect(payload.appName).toContain(".app");
  });

  it("Seaquel: generates structurally valid Ruby cask", async () => {
    const payload = await collectCaskAppReleasePayload(
      seaquelRepoInfo,
      seaquelRelease,
    );
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "seaquel" do');
    expect(ruby).toContain("strategy :github_latest");
    expect(ruby).toContain("zap trash:");
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
    ],
  };

  it("Codeg: payload from Tauri release is well-formed", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    expect(payload.template).toBe("cask_app_release");
    expect(payload.name).toBe("codeg");
    expect(payload.version).toBe("0.18.2");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.url).toContain("#{version}");
    expect(payload.appName).toContain(".app");
  });

  it("Codeg: generates structurally valid Ruby cask", async () => {
    const payload = await collectCaskAppReleasePayload(
      codegRepoInfo,
      codegRelease,
    );
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "codeg" do');
    expect(ruby).toContain("strategy :github_latest");
    expect(ruby).toContain("zap trash:");
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

  it("KnowNote: payload from release is well-formed", async () => {
    const payload = await collectCaskAppReleasePayload(
      knowNoteRepoInfo,
      knowNoteRelease,
    );
    expect(payload.template).toBe("cask_app_release");
    expect(payload.name).toBe("knownote");
    expect(payload.version).toBe("1.2.0");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.url).toContain("#{version}");
    expect(payload.url).toContain(".dmg");
    expect(payload.appName).toContain(".app");
  }, 60000);

  it("KnowNote: generates structurally valid Ruby cask", async () => {
    const payload = await collectCaskAppReleasePayload(
      knowNoteRepoInfo,
      knowNoteRelease,
    );
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "knownote" do');
    expect(ruby).toContain("strategy :github_latest");
    expect(ruby).toContain("zap trash:");
  }, 60000);

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
    ],
  };

  it("HarnessKit: payload from Tauri 2 release is well-formed", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    expect(payload.template).toBe("cask_app_release");
    expect(payload.name).toBe("harnesskit");
    expect(payload.version).toBe("1.6.5");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.url).toContain("#{version}");
    expect(payload.url).toContain(".dmg");
    expect(payload.appName).toContain("HarnessKit");
    expect(payload.appName).toContain(".app");
  });

  it("HarnessKit: generates structurally valid Ruby cask", async () => {
    const payload = await collectCaskAppReleasePayload(
      harnessKitRepoInfo,
      harnessKitRelease,
    );
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "harnesskit" do');
    expect(ruby).toContain("strategy :github_latest");
    expect(ruby).toContain('app "HarnessKit.app"');
    expect(ruby).toContain("zap trash:");
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

  it("MōIcons: payload from arm64-only release is well-formed", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
      { name: "moicons", appName: "MoIcons.app" },
    );
    expect(payload.template).toBe("cask_app_release");
    expect(payload.name).toBe("moicons");
    expect(payload.version).toBe("1.0.3");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.url).toContain("#{version}");
    expect(payload.url).toContain(".dmg");
    expect(payload.appName).toBe("MoIcons.app");
  });

  it("MōIcons: generates structurally valid Ruby cask", async () => {
    const payload = await collectCaskAppReleasePayload(
      moIconsRepoInfo,
      moIconsRelease,
      { name: "moicons", appName: "MoIcons.app" },
    );
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "moicons" do');
    expect(ruby).toContain("strategy :github_latest");
    expect(ruby).toContain('app "MoIcons.app"');
    expect(ruby).toContain("zap trash:");
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

  it("Eigent: payload from AI desktop agent release is well-formed", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    expect(payload.template).toBe("cask_app_release");
    expect(payload.name).toBe("eigent");
    expect(payload.version).toBe("1.0.1");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.url).toContain("#{version}");
    expect(payload.url).toContain(".dmg");
    expect(payload.appName).toContain("Eigent");
    expect(payload.appName).toContain(".app");
    expect(payload.desc).toContain("Cowork Desktop");
    expect(payload.homepage).toBe("https://www.eigent.ai/");
  });

  it("Eigent: generates structurally valid Ruby cask", async () => {
    const payload = await collectCaskAppReleasePayload(
      eigentRepoInfo,
      eigentRelease,
    );
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "eigent" do');
    expect(ruby).toContain("strategy :github_latest");
    expect(ruby).toContain('app "Eigent.app"');
    expect(ruby).toContain("https://www.eigent.ai/");
    expect(ruby).toContain("zap trash:");
  });
});
