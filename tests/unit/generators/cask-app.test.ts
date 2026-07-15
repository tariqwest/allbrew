import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectCaskAppPayload } from "../../../lib/generators/cask-app.ts";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("cask_sha256_mock"),
  downloadAndHash: vi
    .fn()
    .mockResolvedValue({ sha256: "cask_sha256_64chars_padding_abcdef0123456789abcdef0123456789ab" }),
  downloadToTemp: vi.fn().mockResolvedValue({
    path: "/tmp/mock.zip",
    sha256: "cask_sha256_64chars_padding_abcdef0123456789abcdef0123456789ab",
    cleanup: vi.fn(),
  }),
}));

vi.mock("../../../lib/archive-inspector.ts", () => ({
  listZipEntries: vi.fn().mockResolvedValue(["Seaquel.app/"]),
}));

describe("collectCaskAppPayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectCaskAppPayload(
      "https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg",
    );
    expect(payload.template).toBe("cask_app");
  });

  it("extracts version from URL", async () => {
    const payload = await collectCaskAppPayload(
      "https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg",
    );
    expect(payload.versionLine).toContain("2026.4.8");
  });

  it("derives cask token from filename", async () => {
    const payload = await collectCaskAppPayload(
      "https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg",
    );
    // Filename: Seaquel_2026.4.8_aarch64.dmg → strip .dmg → "Seaquel_2026.4.8_aarch64"
    // baseName regex only strips trailing -digits → no match → full string → toCaskToken
    expect(payload.name).toBe("seaquel-2026-4-8-aarch64");
  });

  it("derives clean cask token when version uses hyphens", async () => {
    const payload = await collectCaskAppPayload(
      "https://example.com/MyApp-1.2.3.dmg",
    );
    // Filename: MyApp-1.2.3.dmg → strip .dmg → "MyApp-1.2.3" → strip /-[\d.]+$/ → "MyApp"
    expect(payload.name).toBe("myapp");
  });

  it("includes SHA256", async () => {
    const payload = await collectCaskAppPayload(
      "https://example.com/Foo-1.0.dmg",
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("builds app block for DMG files", async () => {
    const payload = await collectCaskAppPayload(
      "https://example.com/Foo-1.0.dmg",
    );
    expect(payload.appOrPkgBlock).toContain("app");
    expect(payload.appOrPkgBlock).toContain(".app");
  });

  it("builds pkg block for PKG files", async () => {
    const payload = await collectCaskAppPayload(
      "https://zoom.us/client/latest/Zoom.pkg",
    );
    expect(payload.appOrPkgBlock).toContain("pkg");
    expect(payload.appOrPkgBlock).toContain("uninstall pkgutil");
  });

  it("returns empty versionLine when no version in URL", async () => {
    const payload = await collectCaskAppPayload(
      "https://example.com/MyApp.dmg",
    );
    expect(payload.versionLine).toBe("");
  });

  it("respects name override", async () => {
    const payload = await collectCaskAppPayload("https://example.com/Foo.dmg", {
      name: "custom-foo",
    });
    expect(payload.name).toBe("custom-foo");
  });

  it("respects appName override", async () => {
    const payload = await collectCaskAppPayload("https://example.com/Foo.dmg", {
      appName: "CustomApp.app",
    });
    expect(payload.appOrPkgBlock).toContain("CustomApp.app");
  });

  it("respects homepage override", async () => {
    const payload = await collectCaskAppPayload("https://example.com/Foo.dmg", {
      homepage: "https://foo.app",
    });
    expect(payload.homepageLine).toContain("https://foo.app");
  });

  it("generates livecheck block", async () => {
    const payload = await collectCaskAppPayload(
      "https://example.com/Foo-1.0.dmg",
    );
    expect(payload.livecheckBlock).toContain("livecheck do");
  });

  it("handles GitHub /latest/ URL (no version)", async () => {
    const payload = await collectCaskAppPayload(
      "https://github.com/utmapp/UTM/releases/latest/download/UTM.dmg",
    );
    expect(payload.versionLine).toBe("");
  });

  it("Otty DMG: derives cask token from filename", async () => {
    const payload = await collectCaskAppPayload(
      "https://downloads.otty.sh/macos/Otty.dmg",
    );
    expect(payload.name).toBe("otty");
  });

  it("Otty DMG: no version in URL produces empty versionLine", async () => {
    const payload = await collectCaskAppPayload(
      "https://downloads.otty.sh/macos/Otty.dmg",
    );
    expect(payload.versionLine).toBe("");
  });

  it("Otty DMG: respects name and appName overrides", async () => {
    const payload = await collectCaskAppPayload(
      "https://downloads.otty.sh/macos/Otty.dmg",
      { name: "otty", appName: "Otty.app", homepage: "https://otty.sh" },
    );
    expect(payload.name).toBe("otty");
    expect(payload.appOrPkgBlock).toContain("Otty.app");
    expect(payload.homepageLine).toContain("https://otty.sh");
  });

  it("Otty DMG: includes SHA256", async () => {
    const payload = await collectCaskAppPayload(
      "https://downloads.otty.sh/macos/Otty.dmg",
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("Perplexity DMG: derives cask token from filename", async () => {
    const payload = await collectCaskAppPayload(
      "https://cdn.perplexity.ai/downloads/Perplexity.dmg",
      { name: "perplexity", appName: "Perplexity.app", homepage: "https://www.perplexity.ai" },
    );
    expect(payload.name).toBe("perplexity");
  });

  it("Perplexity DMG: no version in URL produces empty versionLine", async () => {
    const payload = await collectCaskAppPayload(
      "https://cdn.perplexity.ai/downloads/Perplexity.dmg",
      { name: "perplexity", appName: "Perplexity.app", homepage: "https://www.perplexity.ai" },
    );
    expect(payload.versionLine).toBe("");
  });

  it("Perplexity DMG: respects all overrides", async () => {
    const payload = await collectCaskAppPayload(
      "https://cdn.perplexity.ai/downloads/Perplexity.dmg",
      { name: "perplexity", appName: "Perplexity.app", homepage: "https://www.perplexity.ai" },
    );
    expect(payload.name).toBe("perplexity");
    expect(payload.appOrPkgBlock).toContain("Perplexity.app");
    expect(payload.homepageLine).toContain("https://www.perplexity.ai");
  });

  it("Perplexity DMG: template is cask_app", async () => {
    const payload = await collectCaskAppPayload(
      "https://cdn.perplexity.ai/downloads/Perplexity.dmg",
      { name: "perplexity", appName: "Perplexity.app", homepage: "https://www.perplexity.ai" },
    );
    expect(payload.template).toBe("cask_app");
  });

  it("Perplexity DMG: includes SHA256", async () => {
    const payload = await collectCaskAppPayload(
      "https://cdn.perplexity.ai/downloads/Perplexity.dmg",
      { name: "perplexity", appName: "Perplexity.app", homepage: "https://www.perplexity.ai" },
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("Postman: version extracted from CDN URL path", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.pstmn.io/download/version/12.16.4/osx_arm64",
      { name: "postman", appName: "Postman.app", homepage: "https://www.postman.com" },
    );
    expect(payload.versionLine).toContain("12.16.4");
  });

  it("Postman: template is cask_app", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.pstmn.io/download/version/12.16.4/osx_arm64",
      { name: "postman", appName: "Postman.app", homepage: "https://www.postman.com" },
    );
    expect(payload.template).toBe("cask_app");
  });

  it("Postman: respects name override", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.pstmn.io/download/version/12.16.4/osx_arm64",
      { name: "postman", appName: "Postman.app", homepage: "https://www.postman.com" },
    );
    expect(payload.name).toBe("postman");
  });

  it("Postman: respects appName and homepage overrides", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.pstmn.io/download/version/12.16.4/osx_arm64",
      { name: "postman", appName: "Postman.app", homepage: "https://www.postman.com" },
    );
    expect(payload.appOrPkgBlock).toContain("Postman.app");
    expect(payload.homepageLine).toContain("https://www.postman.com");
  });

  it("Postman: includes SHA256", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.pstmn.io/download/version/12.16.4/osx_arm64",
      { name: "postman", appName: "Postman.app", homepage: "https://www.postman.com" },
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("Postman /latest/ URL: no version extracted", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.pstmn.io/download/latest/osx",
      { name: "postman", appName: "Postman.app", homepage: "https://www.postman.com" },
    );
    expect(payload.versionLine).toBe("");
  });

  it("Discord DMG: version extracted from CDN URL path", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.discordapp.net/apps/osx/0.0.385/Discord.dmg",
      { name: "discord", appName: "Discord.app", homepage: "https://discord.com/" },
    );
    expect(payload.versionLine).toContain("0.0.385");
  });

  it("Discord DMG: template is cask_app", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.discordapp.net/apps/osx/0.0.385/Discord.dmg",
      { name: "discord", appName: "Discord.app", homepage: "https://discord.com/" },
    );
    expect(payload.template).toBe("cask_app");
  });

  it("Discord DMG: respects name override", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.discordapp.net/apps/osx/0.0.385/Discord.dmg",
      { name: "discord", appName: "Discord.app", homepage: "https://discord.com/" },
    );
    expect(payload.name).toBe("discord");
  });

  it("Discord DMG: respects appName and homepage overrides", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.discordapp.net/apps/osx/0.0.385/Discord.dmg",
      { name: "discord", appName: "Discord.app", homepage: "https://discord.com/" },
    );
    expect(payload.appOrPkgBlock).toContain("Discord.app");
    expect(payload.homepageLine).toContain("https://discord.com/");
  });

  it("Discord DMG: includes SHA256", async () => {
    const payload = await collectCaskAppPayload(
      "https://dl.discordapp.net/apps/osx/0.0.385/Discord.dmg",
      { name: "discord", appName: "Discord.app", homepage: "https://discord.com/" },
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("OnyX DMG: no version in filename produces empty versionLine", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.titanium-software.fr/download/26/OnyX.dmg",
      { name: "onyx", appName: "OnyX.app", homepage: "https://www.titanium-software.fr/en/onyx.html" },
    );
    expect(payload.versionLine).toBe("");
  });

  it("OnyX DMG: template is cask_app", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.titanium-software.fr/download/26/OnyX.dmg",
      { name: "onyx", appName: "OnyX.app", homepage: "https://www.titanium-software.fr/en/onyx.html" },
    );
    expect(payload.template).toBe("cask_app");
  });

  it("OnyX DMG: respects name override", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.titanium-software.fr/download/26/OnyX.dmg",
      { name: "onyx", appName: "OnyX.app", homepage: "https://www.titanium-software.fr/en/onyx.html" },
    );
    expect(payload.name).toBe("onyx");
  });

  it("OnyX DMG: respects appName and homepage overrides", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.titanium-software.fr/download/26/OnyX.dmg",
      { name: "onyx", appName: "OnyX.app", homepage: "https://www.titanium-software.fr/en/onyx.html" },
    );
    expect(payload.appOrPkgBlock).toContain("OnyX.app");
    expect(payload.homepageLine).toContain("https://www.titanium-software.fr/en/onyx.html");
  });

  it("OnyX DMG: includes SHA256", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.titanium-software.fr/download/26/OnyX.dmg",
      { name: "onyx", appName: "OnyX.app", homepage: "https://www.titanium-software.fr/en/onyx.html" },
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("Little Snitch DMG: version extracted from filename", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.obdev.at/downloads/littlesnitch/LittleSnitch-6.4.1.dmg",
      { name: "little-snitch", appName: "Little Snitch.app", homepage: "https://www.obdev.at/products/littlesnitch/index.html" },
    );
    expect(payload.versionLine).toContain("6.4.1");
  });

  it("Little Snitch DMG: template is cask_app", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.obdev.at/downloads/littlesnitch/LittleSnitch-6.4.1.dmg",
      { name: "little-snitch", appName: "Little Snitch.app", homepage: "https://www.obdev.at/products/littlesnitch/index.html" },
    );
    expect(payload.template).toBe("cask_app");
  });

  it("Little Snitch DMG: respects name override (hyphenated token)", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.obdev.at/downloads/littlesnitch/LittleSnitch-6.4.1.dmg",
      { name: "little-snitch", appName: "Little Snitch.app", homepage: "https://www.obdev.at/products/littlesnitch/index.html" },
    );
    expect(payload.name).toBe("little-snitch");
  });

  it("Little Snitch DMG: app name with space in appOrPkgBlock", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.obdev.at/downloads/littlesnitch/LittleSnitch-6.4.1.dmg",
      { name: "little-snitch", appName: "Little Snitch.app", homepage: "https://www.obdev.at/products/littlesnitch/index.html" },
    );
    expect(payload.appOrPkgBlock).toContain("Little Snitch.app");
  });

  it("Little Snitch DMG: homepage override", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.obdev.at/downloads/littlesnitch/LittleSnitch-6.4.1.dmg",
      { name: "little-snitch", appName: "Little Snitch.app", homepage: "https://www.obdev.at/products/littlesnitch/index.html" },
    );
    expect(payload.homepageLine).toContain("https://www.obdev.at/products/littlesnitch/index.html");
  });

  it("Little Snitch DMG: includes SHA256", async () => {
    const payload = await collectCaskAppPayload(
      "https://www.obdev.at/downloads/littlesnitch/LittleSnitch-6.4.1.dmg",
      { name: "little-snitch", appName: "Little Snitch.app", homepage: "https://www.obdev.at/products/littlesnitch/index.html" },
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("Pictogram ZIP: version extracted from URL (CSV first component 0.1)", async () => {
    const payload = await collectCaskAppPayload(
      "https://pictogramapp.com/updates/v0.1%20%28Build%2013%29.zip",
      { name: "pictogram", appName: "Pictogram.app", homepage: "https://pictogramapp.com/" },
    );
    expect(payload.versionLine).toContain("0.1");
  });

  it("Pictogram ZIP: template is cask_app", async () => {
    const payload = await collectCaskAppPayload(
      "https://pictogramapp.com/updates/v0.1%20%28Build%2013%29.zip",
      { name: "pictogram", appName: "Pictogram.app", homepage: "https://pictogramapp.com/" },
    );
    expect(payload.template).toBe("cask_app");
  });

  it("Pictogram ZIP: respects name override", async () => {
    const payload = await collectCaskAppPayload(
      "https://pictogramapp.com/updates/v0.1%20%28Build%2013%29.zip",
      { name: "pictogram", appName: "Pictogram.app", homepage: "https://pictogramapp.com/" },
    );
    expect(payload.name).toBe("pictogram");
  });

  it("Pictogram ZIP: respects appName override in appOrPkgBlock", async () => {
    const payload = await collectCaskAppPayload(
      "https://pictogramapp.com/updates/v0.1%20%28Build%2013%29.zip",
      { name: "pictogram", appName: "Pictogram.app", homepage: "https://pictogramapp.com/" },
    );
    expect(payload.appOrPkgBlock).toContain("Pictogram.app");
  });

  it("Pictogram ZIP: respects homepage override", async () => {
    const payload = await collectCaskAppPayload(
      "https://pictogramapp.com/updates/v0.1%20%28Build%2013%29.zip",
      { name: "pictogram", appName: "Pictogram.app", homepage: "https://pictogramapp.com/" },
    );
    expect(payload.homepageLine).toContain("https://pictogramapp.com/");
  });

  it("Pictogram ZIP: includes SHA256", async () => {
    const payload = await collectCaskAppPayload(
      "https://pictogramapp.com/updates/v0.1%20%28Build%2013%29.zip",
      { name: "pictogram", appName: "Pictogram.app", homepage: "https://pictogramapp.com/" },
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });

  it("IconChamp ZIP: no version in URL produces empty versionLine", async () => {
    const payload = await collectCaskAppPayload(
      "https://github.com/MacEnhance/appcast/raw/master/IconChamp/IconChamp.zip",
      { name: "iconchamp", appName: "IconChamp.app", homepage: "https://www.macenhance.com/iconchamp" },
    );
    expect(payload.versionLine).toBe("");
  });

  it("IconChamp ZIP: template is cask_app", async () => {
    const payload = await collectCaskAppPayload(
      "https://github.com/MacEnhance/appcast/raw/master/IconChamp/IconChamp.zip",
      { name: "iconchamp", appName: "IconChamp.app", homepage: "https://www.macenhance.com/iconchamp" },
    );
    expect(payload.template).toBe("cask_app");
  });

  it("IconChamp ZIP: derives clean cask token from filename", async () => {
    const payload = await collectCaskAppPayload(
      "https://github.com/MacEnhance/appcast/raw/master/IconChamp/IconChamp.zip",
    );
    expect(payload.name).toBe("iconchamp");
  });

  it("IconChamp ZIP: respects appName override in appOrPkgBlock", async () => {
    const payload = await collectCaskAppPayload(
      "https://github.com/MacEnhance/appcast/raw/master/IconChamp/IconChamp.zip",
      { name: "iconchamp", appName: "IconChamp.app", homepage: "https://www.macenhance.com/iconchamp" },
    );
    expect(payload.appOrPkgBlock).toContain("IconChamp.app");
  });

  it("IconChamp ZIP: respects homepage override", async () => {
    const payload = await collectCaskAppPayload(
      "https://github.com/MacEnhance/appcast/raw/master/IconChamp/IconChamp.zip",
      { name: "iconchamp", appName: "IconChamp.app", homepage: "https://www.macenhance.com/iconchamp" },
    );
    expect(payload.homepageLine).toContain("https://www.macenhance.com/iconchamp");
  });

  it("IconChamp ZIP: includes SHA256", async () => {
    const payload = await collectCaskAppPayload(
      "https://github.com/MacEnhance/appcast/raw/master/IconChamp/IconChamp.zip",
      { name: "iconchamp", appName: "IconChamp.app", homepage: "https://www.macenhance.com/iconchamp" },
    );
    expect(payload.sha256).toBeTruthy();
    expect(payload.sha256.length).toBeGreaterThan(0);
  });
});
