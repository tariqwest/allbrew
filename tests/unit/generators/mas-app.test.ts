import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectMasAppPayload } from "../../../lib/generators/mas-app.ts";

describe("collectMasAppPayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn(() =>
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
    const payload = await collectMasAppPayload(
      "https://apps.apple.com/us/app/bear/id1091189122?mt=12",
    );
    expect(payload.template).toBe("mas_app");
  });

  it("extracts app ID from URL", async () => {
    const payload = await collectMasAppPayload(
      "https://apps.apple.com/us/app/bear/id1091189122?mt=12",
    );
    expect(payload.appId).toBe("1091189122");
  });

  it("uses track name from iTunes API", async () => {
    const payload = await collectMasAppPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.appName).toBe("Bear");
  });

  it("derives cask token from app name", async () => {
    const payload = await collectMasAppPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.name).toBe("bear");
  });

  it("uses first line of description (truncated)", async () => {
    const payload = await collectMasAppPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.desc).toContain("Write beautifully");
    expect(payload.desc).not.toContain("More details");
  });

  it("uses seller URL as homepage", async () => {
    const payload = await collectMasAppPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.homepage).toBe("https://bear.app");
  });

  it("uses version from iTunes API", async () => {
    const payload = await collectMasAppPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.version).toBe("2.2.5");
  });

  it("generates zap block with bundle ID paths", async () => {
    const payload = await collectMasAppPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.zapBlock).toContain("zap trash:");
    expect(payload.zapBlock).toContain("net.shinyfrog.bear");
    expect(payload.zapBlock).toContain("Application Support/Bear");
  });

  it("generates MAS livecheck block", async () => {
    const payload = await collectMasAppPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
    );
    expect(payload.livecheckBlock).toContain("itunes.apple.com/lookup");
    expect(payload.livecheckBlock).toContain("1091189122");
  });

  it("respects name override", async () => {
    const payload = await collectMasAppPayload(
      "https://apps.apple.com/us/app/bear/id1091189122",
      { name: "bear-notes" },
    );
    expect(payload.name).toBe("bear-notes");
  });

  it("throws when URL has no app ID", async () => {
    await expect(
      collectMasAppPayload("https://apps.apple.com/us/app/bear"),
    ).rejects.toThrow("Could not extract App Store ID");
  });

  it("throws when iTunes API returns empty results", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }),
    ) as any;
    await expect(
      collectMasAppPayload("https://apps.apple.com/us/app/fake/id9999999999"),
    ).rejects.toThrow("No app found");
  });

  it("throws when iTunes API returns non-OK", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 }),
    ) as any;
    await expect(
      collectMasAppPayload("https://apps.apple.com/us/app/bear/id1091189122"),
    ).rejects.toThrow("iTunes Lookup API failed");
  });
});
