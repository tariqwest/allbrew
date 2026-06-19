import { describe, it, expect } from "vitest";
import { collectCaskAppPayload } from "../../lib/generators/cask-app.ts";
import { collectGithubReleaseCaskPayload } from "../../lib/generators/github-release-cask.ts";
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
  });

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
});

describe.concurrent("github-release-cask integration", () => {
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
    const payload = await collectGithubReleaseCaskPayload(
      seaquelRepoInfo,
      seaquelRelease,
    );
    expect(payload.template).toBe("github_release");
    expect(payload.name).toBe("seaquel");
    expect(payload.version).toBe("2026.4.8");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.url).toContain("#{version}");
    expect(payload.appName).toContain(".app");
  });

  it("Seaquel: generates structurally valid Ruby cask", async () => {
    const payload = await collectGithubReleaseCaskPayload(
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
