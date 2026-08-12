import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  collectCaskAppSetappPayload,
  parseSetappPage,
  extractSetappSlug,
} from "../../../lib/generators/cask-app-setapp.ts";

const BARTENDER_HTML = `<!DOCTYPE html>
<html><head>
<meta name="description" content="Clean up and superpower your menu bar">
</head><body>
<h1>Bartender Pro</h1>
<p>Version 6.5.2</p>
</body></html>`;

describe("extractSetappSlug", () => {
  it("extracts slug from Setapp URL", () => {
    expect(extractSetappSlug("https://setapp.com/apps/bartender")).toBe("bartender");
  });

  it("returns null for non-Setapp URL", () => {
    expect(extractSetappSlug("https://setapp.com/download")).toBeNull();
  });
});

describe("parseSetappPage", () => {
  it("parses app name, version, and description", () => {
    const result = parseSetappPage(
      BARTENDER_HTML,
      "bartender",
      "https://setapp.com/apps/bartender",
    );
    expect(result.appName).toBe("Bartender Pro");
    expect(result.version).toBe("6.5.2");
    expect(result.desc).toBe("Clean up and superpower your menu bar");
    expect(result.slug).toBe("bartender");
  });
});

describe("collectCaskAppSetappPayload", () => {
  beforeEach(() => {
    mock.restore();
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(BARTENDER_HTML),
      }),
    ) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectCaskAppSetappPayload(
      "https://setapp.com/apps/bartender",
    );
    expect(payload.template).toBe("cask_app_setapp");
  });

  it("extracts slug from URL", async () => {
    const payload = await collectCaskAppSetappPayload(
      "https://setapp.com/apps/bartender",
    );
    expect(payload.slug).toBe("bartender");
  });

  it("uses display name from page h1", async () => {
    const payload = await collectCaskAppSetappPayload(
      "https://setapp.com/apps/bartender",
    );
    expect(payload.appName).toBe("Bartender Pro");
  });

  it("derives cask token from slug", async () => {
    const payload = await collectCaskAppSetappPayload(
      "https://setapp.com/apps/bartender",
    );
    expect(payload.name).toBe("bartender");
  });

  it("uses version from page", async () => {
    const payload = await collectCaskAppSetappPayload(
      "https://setapp.com/apps/bartender",
    );
    expect(payload.version).toBe("6.5.2");
  });

  it("generates Setapp livecheck block", async () => {
    const payload = await collectCaskAppSetappPayload(
      "https://setapp.com/apps/bartender",
    );
    expect(payload.livecheckBlock).toContain("setapp.com/apps/bartender");
    expect(payload.livecheckBlock).toContain("Version");
  });

  it("generates zap block with app name path", async () => {
    const payload = await collectCaskAppSetappPayload(
      "https://setapp.com/apps/bartender",
    );
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("Bartender Pro");
  });

  it("respects name override", async () => {
    const payload = await collectCaskAppSetappPayload(
      "https://setapp.com/apps/bartender",
      { name: "bartender-pro" },
    );
    expect(payload.name).toBe("bartender-pro");
  });

  it("throws when URL has no slug", async () => {
    await expect(
      collectCaskAppSetappPayload("https://setapp.com/download"),
    ).rejects.toThrow("Could not extract Setapp slug");
  });

  it("throws when page has no app name", async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve("<html><body></body></html>"),
      }),
    ) as any;
    await expect(
      collectCaskAppSetappPayload("https://setapp.com/apps/bartender"),
    ).rejects.toThrow("Could not extract app name");
  });

  it("throws when page fetch fails", async () => {
    global.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 404 }),
    ) as any;
    await expect(
      collectCaskAppSetappPayload("https://setapp.com/apps/bartender"),
    ).rejects.toThrow("Setapp page fetch failed");
  });
});

describe("setappLatestVersion", () => {
  beforeEach(() => {
    mock.restore();
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(BARTENDER_HTML),
      }),
    ) as any;
  });

  it("returns version from Setapp page", async () => {
    const { setappLatestVersion } = await import(
      "../../../lib/generators/cask-app-setapp.ts"
    );
    const version = await setappLatestVersion("bartender");
    expect(version).toBe("6.5.2");
  });
});
