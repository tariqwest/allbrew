import { describe, it, expect } from "vitest";
import { collectCaskAppMasPayload } from "../../lib/generators/cask-app-mas.ts";
import { renderCask } from "../../lib/template-renderer.ts";
import { assertValidCask } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: calls iTunes Lookup API, validates MAS cask Ruby.
 * Run: bun run test:int
 */

describe.concurrent("cask-app-mas integration", () => {
  it("magnet: payload fields are well-formed", async () => {
    const url = "https://apps.apple.com/us/app/magnet/id441258766";
    const payload = await collectCaskAppMasPayload(url, { name: "magnet" });
    expect(payload.template).toBe("cask_app_mas");
    expect(payload.name).toBe("magnet");
    expect(payload.appId).toBe("441258766");
    expect(payload.appName).toBeTruthy();
    expect(payload.version).toBeTruthy();
    expect(payload.livecheckBlock).toContain("itunes.apple.com/lookup");
  });

  it("magnet: generates structurally valid Ruby cask", async () => {
    const url = "https://apps.apple.com/us/app/magnet/id441258766";
    const payload = await collectCaskAppMasPayload(url, { name: "magnet" });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "magnet" do');
    expect(ruby).toContain('depends_on formula: "mas"');
    expect(ruby).toContain("zap trash:");
  });

  it("xcode: extracts app id and produces payload", async () => {
    const url = "https://apps.apple.com/us/app/xcode/id497799835";
    const payload = await collectCaskAppMasPayload(url, { name: "xcode" });
    expect(payload.appId).toBe("497799835");
    expect(payload.template).toBe("cask_app_mas");
  });

  it("invalid URL: throws on missing app id", async () => {
    await expect(
      collectCaskAppMasPayload("https://apps.apple.com/us/app/invalid/no-id", {
        name: "invalid",
      }),
    ).rejects.toThrow();
  });
});
