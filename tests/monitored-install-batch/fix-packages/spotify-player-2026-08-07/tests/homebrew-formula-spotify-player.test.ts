import { describe, expect, test } from "bun:test";
import {
  formatBottleCellar,
  homebrewFormulaApiCandidates,
  renderBottleBlock,
  toHomebrewCoreToken,
} from "../../lib/generators/homebrew-formula.ts";
import { classify } from "../../lib/classifier.ts";

describe("toHomebrewCoreToken", () => {
  test("preserves underscores used by core formulas", () => {
    expect(toHomebrewCoreToken("spotify_player")).toBe("spotify_player");
    expect(toHomebrewCoreToken("Spotify_Player")).toBe("spotify_player");
  });

  test("still normalizes spaces and punctuation", () => {
    expect(toHomebrewCoreToken("foo bar")).toBe("foo-bar");
  });
});

describe("homebrewFormulaApiCandidates", () => {
  test("includes underscore and hyphen variants for spotify-player", () => {
    const c = homebrewFormulaApiCandidates("spotify-player");
    expect(c).toContain("spotify-player");
    expect(c).toContain("spotify_player");
  });

  test("keeps spotify_player first-class", () => {
    const c = homebrewFormulaApiCandidates("spotify_player");
    expect(c[0]).toBe("spotify_player");
    expect(c).toContain("spotify-player");
  });
});

describe("formatBottleCellar", () => {
  test("never double-colons API symbol cellar values", () => {
    expect(formatBottleCellar(":any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar("any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar("/opt/homebrew/Cellar")).toBe(
      '"/opt/homebrew/Cellar"',
    );
  });
});

describe("renderBottleBlock spotify_player-style", () => {
  test("emits valid cellar symbols", () => {
    const ruby = renderBottleBlock("  ", {
      rebuild: 0,
      root_url: "https://ghcr.io/v2/homebrew/core",
      files: {
        arm64_sonoma: {
          cellar: ":any_skip_relocation",
          sha256: "ab0b47ed58794f384550de3381493950a7354cd8afc8f5821f1e9de8190ac8e5",
        },
      },
    });
    expect(ruby).toContain("sha256 cellar: :any_skip_relocation, arm64_sonoma:");
    expect(ruby).not.toContain("::any_skip_relocation");
  });
});

describe("classifier formulae.brew.sh/spotify_player", () => {
  test("classifies as homebrew-formula with underscore name", () => {
    const r = classify("https://formulae.brew.sh/formula/spotify_player");
    expect(r.type).toBe("homebrew-formula");
    expect(r.name).toBe("spotify_player");
  });
});
