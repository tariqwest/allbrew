import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectCaskAppMasPayload } from "../../../lib/generators/cask-app-mas.ts";

describe("collectCaskAppMasPayload", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                trackName: "Bear",
                bundleId: "net.shinyfrog.bear",
                version: "2.2.5",
                description: "Write beautifully on iPhone, iPad, and Mac\nMore details here.",
                sellerUrl: "https://bear.app",
              },
            ],
          }),
      }),
    ) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/bear/id1091189122?mt=12",
    );
    expect(payload.template).toBe("cask_app_mas");
  });

  it("extracts app ID from URL", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/bear/id1091189122?mt=12",
    );
    expect(payload.appId).toBe("1091189122");
  });

  it("uses track name from iTunes API", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.appName).toBe("Bear");
  });

  it("derives cask token from app name", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.name).toBe("bear");
  });

  it("uses first line of description (truncated)", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.desc).toContain("Write beautifully");
    expect(payload.desc).not.toContain("More details");
  });

  it("uses seller URL as homepage", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.homepage).toBe("https://bear.app");
  });

  it("uses version from iTunes API", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.version).toBe("2.2.5");
  });

  it("generates zap block with bundle ID paths", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("net.shinyfrog.bear");
    expect(payload.zapBlock).toContain("Application Support/Bear");
  });

  it("generates MAS livecheck block", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.livecheckBlock).toContain("itunes.apple.com/lookup");
    expect(payload.livecheckBlock).toContain("1091189122");
  });

  it("respects name override", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
      { name: "bear-notes" },
    );
    expect(payload.name).toBe("bear-notes");
  });

  it("throws when URL has no app ID", async () => {
    await expect(
      collectCaskAppMasPayload("https://apps.apple.com/us/app/bear"),
    ).rejects.toThrow("Could not extract App Store ID");
  });

  it("throws when iTunes API returns empty results", async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }),
    ) as any;
    await expect(
      collectCaskAppMasPayload("https://apps.apple.com/us/app/fake/id9999999999"),
    ).rejects.toThrow("No app found");
  });

  it("throws when iTunes API returns non-OK", async () => {
    global.fetch = mock(() =>
      Promise.resolve({ ok: false, status: 500 }),
    ) as any;
    await expect(
      collectCaskAppMasPayload("https://apps.apple.com/us/app/bear/id1091189122"),
    ).rejects.toThrow("iTunes Lookup API failed");
  });
});

describe("collectCaskAppMasPayload — Magnet", () => {
  beforeEach(() => {
    mock.restore();

    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                trackName: "Magnet",
                bundleId: "id.mndt.Magnet",
                version: "2.14.0",
                description: "Organize Your Workspace\nSnap windows into organized tiles.",
                sellerUrl: "https://magnet.crowdcafe.com",
              },
            ],
          }),
      }),
    ) as any;
  });

  it("returns payload with correct template identifier", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/magnet/id441258766",
    );
    expect(payload.template).toBe("cask_app_mas");
  });

  it("extracts app ID from URL", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/magnet/id441258766",
    );
    expect(payload.appId).toBe("441258766");
  });

  it("uses track name from iTunes API", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/magnet/id441258766",
    );
    expect(payload.appName).toBe("Magnet");
  });

  it("derives cask token from app name", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/magnet/id441258766",
    );
    expect(payload.name).toBe("magnet");
  });

  it("uses first line of description", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/magnet/id441258766",
    );
    expect(payload.desc).toContain("Organize Your Workspace");
    expect(payload.desc).not.toContain("Snap windows");
  });

  it("uses seller URL as homepage", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/magnet/id441258766",
    );
    expect(payload.homepage).toBe("https://magnet.crowdcafe.com");
  });

  it("generates zap block with bundle ID paths", async () => {
    const payload = await collectCaskAppMasPayload(
      "https://apps.apple.com/us/app/magnet/id441258766",
    );
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("id.mndt.Magnet");
  });
});
