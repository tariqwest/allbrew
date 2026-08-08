import { describe, expect, test } from "bun:test";
import {
  formatBottleCellar,
  renderBottleBlock,
} from "../../lib/generators/homebrew-formula.ts";

describe("formatBottleCellar", () => {
  test("keeps leading colon from API symbol values", () => {
    expect(formatBottleCellar(":any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar(":any")).toBe(":any");
  });

  test("adds colon to bare symbol names", () => {
    expect(formatBottleCellar("any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar("any")).toBe(":any");
  });

  test("quotes absolute Cellar paths as Ruby strings", () => {
    expect(formatBottleCellar("/opt/homebrew/Cellar")).toBe(
      '"/opt/homebrew/Cellar"',
    );
    expect(formatBottleCellar("/usr/local/Cellar")).toBe(
      '"/usr/local/Cellar"',
    );
  });

  test("defaults empty to :any", () => {
    expect(formatBottleCellar(null)).toBe(":any");
    expect(formatBottleCellar("")).toBe(":any");
  });

  test("never emits double-colon or symbolized paths", () => {
    expect(formatBottleCellar(":any_skip_relocation")).not.toMatch(/^::/);
    expect(formatBottleCellar("/opt/homebrew/Cellar")).not.toMatch(/^:/);
  });
});

describe("renderBottleBlock", () => {
  test("renders path and symbol cellars without Ruby syntax errors", () => {
    const ruby = renderBottleBlock("  ", {
      rebuild: 0,
      root_url: "https://ghcr.io/v2/homebrew/core",
      files: {
        arm64_sonoma: {
          cellar: "/opt/homebrew/Cellar",
          sha256: "abc",
        },
        sonoma: {
          cellar: ":any_skip_relocation",
          sha256: "def",
        },
      },
    });
    expect(ruby).toContain(
      'sha256 cellar: "/opt/homebrew/Cellar", arm64_sonoma: "abc"',
    );
    expect(ruby).toContain(
      'sha256 cellar: :any_skip_relocation, sonoma: "def"',
    );
    expect(ruby).not.toContain("::any");
    expect(ruby).not.toContain(":/opt");
  });
});

import { classify } from "../../lib/classifier.ts";

describe("homebrew-core formula blob → homebrew-formula", () => {
  test("classifies Formula/b/bun.rb blob as homebrew-formula bun", () => {
    const r = classify(
      "https://github.com/Homebrew/homebrew-core/blob/53edc22030369be2cd875ae0921ac6564e16d4a7/Formula/b/bun.rb",
    );
    expect(r.type).toBe("homebrew-formula");
    expect(r.name).toBe("bun");
  });

  test("classifies formulae.brew.sh formula page", () => {
    const r = classify("https://formulae.brew.sh/formula/bun");
    expect(r.type).toBe("homebrew-formula");
    expect(r.name).toBe("bun");
  });
});
