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
});
