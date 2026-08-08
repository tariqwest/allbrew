import { describe, expect, test } from "bun:test";
import {
  formatBottleCellar,
  renderBottleBlock,
} from "../../lib/generators/homebrew-formula.ts";
import { classify } from "../../lib/classifier.ts";

describe("formatBottleCellar", () => {
  test("keeps API symbol strings as-is", () => {
    expect(formatBottleCellar(":any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
    expect(formatBottleCellar(":any")).toBe(":any");
  });

  test("prefixes bare names once", () => {
    expect(formatBottleCellar("any_skip_relocation")).toBe(
      ":any_skip_relocation",
    );
  });

  test("quotes absolute paths", () => {
    expect(formatBottleCellar("/opt/homebrew/Cellar")).toBe(
      '"/opt/homebrew/Cellar"',
    );
  });

  test("defaults empty to :any", () => {
    expect(formatBottleCellar("")).toBe(":any");
    expect(formatBottleCellar(null)).toBe(":any");
  });
});

describe("renderBottleBlock", () => {
  test("does not double-colon cellar symbols", () => {
    const block = renderBottleBlock("  ", {
      rebuild: 0,
      root_url: "https://ghcr.io/v2/homebrew/core/foo/blobs",
      files: {
        arm64_sequoia: {
          cellar: ":any_skip_relocation",
          sha256: "abc",
        },
      },
    });
    expect(block).toContain("cellar: :any_skip_relocation");
    expect(block).not.toContain("::any_skip_relocation");
  });
});

describe("classify formulae.brew.sh formula pages", () => {
  test("mcclowes token routes to homebrew-formula (even if core 404s later)", () => {
    const r = classify("https://formulae.brew.sh/formula/mcclowes");
    expect(r.type).toBe("homebrew-formula");
    expect(r.name).toBe("mcclowes");
  });

  test("does not treat GitHub author as monorepo for this page shape", () => {
    const r = classify("https://formulae.brew.sh/formula/pug");
    expect(r.type).toBe("homebrew-formula");
    expect(r.name).toBe("pug");
  });
});
