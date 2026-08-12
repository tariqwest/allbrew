import { describe, it, expect } from "bun:test";
import { collectCaskAppSetappPayload } from "../../lib/generators/cask-app-setapp.ts";
import { renderCask } from "../../lib/template-renderer.ts";
import { assertValidCask } from "./helpers/validate-ruby.ts";

describe.concurrent("cask-app-setapp integration", () => {
  it("bartender: payload fields are well-formed", async () => {
    const url = "https://setapp.com/apps/bartender";
    const payload = await collectCaskAppSetappPayload(url, { name: "bartender" });
    expect(payload.template).toBe("cask_app_setapp");
    expect(payload.name).toBe("bartender");
    expect(payload.slug).toBe("bartender");
    expect(payload.appName).toBeTruthy();
    expect(payload.version).toBeTruthy();
    expect(payload.livecheckBlock).toContain("setapp.com/apps/bartender");
  });

  it("bartender: generates structurally valid Ruby cask", async () => {
    const url = "https://setapp.com/apps/bartender";
    const payload = await collectCaskAppSetappPayload(url, { name: "bartender" });
    const ruby = renderCask(payload);
    assertValidCask(ruby);
    expect(ruby).toContain('cask "bartender" do');
    expect(ruby).toContain('depends_on formula: "setapp-cli"');
    expect(ruby).toContain('depends_on cask: "setapp"');
    expect(ruby).toContain('executable: "setapp-cli"');
    expect(ruby).toContain("zap trash:");
  });

  it("cleanshot: slug and display name may differ", async () => {
    const url = "https://setapp.com/apps/cleanshot";
    const payload = await collectCaskAppSetappPayload(url);
    expect(payload.slug).toBe("cleanshot");
    expect(payload.template).toBe("cask_app_setapp");
    expect(payload.appName.length).toBeGreaterThan(0);
  });

  it("invalid URL: throws on missing slug", async () => {
    await expect(
      collectCaskAppSetappPayload("https://setapp.com/download", {
        name: "invalid",
      }),
    ).rejects.toThrow();
  });
});
