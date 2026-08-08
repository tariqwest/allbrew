import { describe, expect, it } from "bun:test";
import {
  brandsCompatible,
  matchOfficialCaskByHomepage,
} from "../../../lib/generators/homebrew-cask.ts";

describe("brandsCompatible", () => {
  it("matches paste.app brand to pasteapp.io homepage brand via token paste", () => {
    expect(brandsCompatible("paste", "pasteapp", "paste")).toBe(true);
  });

  it("rejects unrelated page brand even when token is a real cask", () => {
    expect(brandsCompatible("example", "pasteapp", "paste")).toBe(false);
  });
});

describe("matchOfficialCaskByHomepage", () => {
  it("matches paste.app to official homebrew/cask paste (homepage pasteapp.io)", async () => {
    const m = await matchOfficialCaskByHomepage("https://paste.app", "paste");
    expect(m).not.toBeNull();
    expect(m!.token).toBe("paste");
    expect(m!.homepage).toMatch(/pasteapp\.io/i);
  });

  it("matches paste.app without preferred name via host brand label", async () => {
    const m = await matchOfficialCaskByHomepage("https://paste.app");
    expect(m).not.toBeNull();
    expect(m!.token).toBe("paste");
  });

  it("returns null when preferred token is unrelated to page domain", async () => {
    const m = await matchOfficialCaskByHomepage(
      "https://example.com/product",
      "superwhisper",
    );
    expect(m).toBeNull();
  });
});
