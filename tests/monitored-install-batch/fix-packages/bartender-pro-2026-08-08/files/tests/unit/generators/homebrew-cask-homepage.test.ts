import { describe, expect, it } from "bun:test";
import { matchOfficialCaskByHomepage } from "../../../lib/generators/homebrew-cask.ts";

describe("matchOfficialCaskByHomepage", () => {
  it("matches superwhisper.com to official homebrew/cask token", async () => {
    const m = await matchOfficialCaskByHomepage(
      "https://superwhisper.com",
      "superwhisper",
    );
    expect(m).not.toBeNull();
    expect(m!.token).toBe("superwhisper");
    expect(m!.homepage).toMatch(/superwhisper\.com/i);
  });

  it("returns null when preferred token is unrelated to page domain", async () => {
    const m = await matchOfficialCaskByHomepage(
      "https://example.com/product",
      "superwhisper",
    );
    expect(m).toBeNull();
  });

  it("matches pictogramapp.com to official homebrew/cask pictogram", async () => {
    const m = await matchOfficialCaskByHomepage(
      "https://pictogramapp.com",
      "pictogram",
    );
    expect(m).not.toBeNull();
    expect(m!.token).toBe("pictogram");
    expect(m!.homepage).toMatch(/pictogramapp\.com/i);
  });

  it("matches expired refine.app brand TLD to official cask homepage refine.sh", async () => {
    const m = await matchOfficialCaskByHomepage("https://refine.app", "refine");
    expect(m).not.toBeNull();
    expect(m!.token).toBe("refine");
    expect(m!.homepage).toMatch(/refine\.sh/i);
  });

  it("matches refine.app even when preferredName is batch slug refine-app", async () => {
    const m = await matchOfficialCaskByHomepage("https://refine.app", "refine-app");
    expect(m).not.toBeNull();
    expect(m!.token).toBe("refine");
  });


  it("matches apphousekitchen.com + aldente-pro slug to official cask aldente", async () => {
    const m = await matchOfficialCaskByHomepage(
      "https://apphousekitchen.com",
      "aldente-pro",
    );
    expect(m).not.toBeNull();
    expect(m!.token).toBe("aldente");
    expect(m!.homepage).toMatch(/apphousekitchen\.com/i);
  });

  it("matches apphousekitchen.com bare homepage via domain index fallback", async () => {
    const m = await matchOfficialCaskByHomepage("https://apphousekitchen.com");
    expect(m).not.toBeNull();
    expect(m!.token).toBe("aldente");
  });

  it("matches cleanshot.com to official cask when homepage is getcleanshot.com", async () => {
    const m = await matchOfficialCaskByHomepage(
      "https://cleanshot.com",
      "cleanshot-x",
    );
    expect(m).not.toBeNull();
    expect(m!.token).toBe("cleanshot");
    expect(m!.homepage).toMatch(/getcleanshot\.com|cleanshot\.com/i);
  });

  it("matches getcleanshot.com host to official cleanshot cask", async () => {
    const m = await matchOfficialCaskByHomepage(
      "https://getcleanshot.com/",
      "cleanshot-x",
    );
    expect(m).not.toBeNull();
    expect(m!.token).toBe("cleanshot");
  });

  it("matches macbartender.com + bartender-pro slug to official cask bartender", async () => {
    const m = await matchOfficialCaskByHomepage(
      "https://macbartender.com",
      "bartender-pro",
    );
    expect(m).not.toBeNull();
    expect(m!.token).toBe("bartender");
    expect(m!.homepage).toMatch(/macbartender\.com/i);
  });

});
