import { describe, expect, test } from "bun:test";
import { matchOfficialCaskByHomepage } from "../../../lib/generators/homebrew-cask.ts";

describe("matchOfficialCaskByHomepage", () => {
  test("matches exact homepage domain for chronoid.app", async () => {
    const m = await matchOfficialCaskByHomepage("https://www.chronoid.app/", "chronoid");
    expect(m?.token).toBe("chronoid");
  });

  test("matches alternate TLD chronoid.com when label equals token", async () => {
    const m = await matchOfficialCaskByHomepage("https://chronoid.com", "chronoid");
    expect(m?.token).toBe("chronoid");
  });

  test("does not match unrelated domain with preferredName alone if label differs", async () => {
    const m = await matchOfficialCaskByHomepage(
      "https://example.com/path",
      "chronoid",
    );
    expect(m).toBeNull();
  });
});
