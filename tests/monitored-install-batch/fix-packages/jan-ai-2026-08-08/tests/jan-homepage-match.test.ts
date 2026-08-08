import { describe, expect, it } from "bun:test";
import { matchOfficialCaskByHomepage } from "../../../lib/generators/homebrew-cask.ts";

describe("matchOfficialCaskByHomepage jan.ai", () => {
  it("matches jan.ai + batch slug jan-ai to official homebrew/cask jan", async () => {
    const m = await matchOfficialCaskByHomepage("https://jan.ai", "jan-ai");
    expect(m).not.toBeNull();
    expect(m!.token).toBe("jan");
    expect(m!.homepage).toMatch(/jan\.ai/i);
  });
});
