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
});
