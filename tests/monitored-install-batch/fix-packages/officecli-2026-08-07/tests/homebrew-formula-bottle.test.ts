import { describe, expect, test } from "bun:test";
import {
  formatBottleCellar,
  renderBottleBlock,
} from "../../lib/generators/homebrew-formula.ts";
import { classify } from "../../lib/classifier.ts";

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
  });

  test("quotes absolute Cellar paths as Ruby strings", () => {
    expect(formatBottleCellar("/opt/homebrew/Cellar")).toBe(
      '"/opt/homebrew/Cellar"',
    );
  });

  test("defaults empty to :any", () => {
    expect(formatBottleCellar(null)).toBe(":any");
    expect(formatBottleCellar("")).toBe(":any");
  });

  test("never emits double-colon", () => {
    expect(formatBottleCellar(":any_skip_relocation")).not.toMatch(/^::/);
    expect(formatBottleCellar(":any")).not.toMatch(/^::/);
  });
});

describe("renderBottleBlock (md-tui-style bottles)", () => {
  test("renders md-tui API cellar values as valid Ruby", () => {
    const ruby = renderBottleBlock("  ", {
      rebuild: 0,
      root_url: "https://ghcr.io/v2/homebrew/core",
      files: {
        arm64_sonoma: {
          cellar: ":any_skip_relocation",
          sha256:
            "bb540fafc406f370da3572bb944f032919e225d382c7bd261d14254e9e3cfc8c",
        },
        arm64_linux: {
          cellar: ":any",
          sha256:
            "c3994ffb35e39585336a52d7c6a97fa13e93d4817744e0d2739de8df2e81a36f",
        },
      },
    });
    expect(ruby).toContain(
      "sha256 cellar: :any_skip_relocation, arm64_sonoma:",
    );
    expect(ruby).toContain("sha256 cellar: :any, arm64_linux:");
    expect(ruby).not.toContain("::any_skip_relocation");
    expect(ruby).not.toContain("::any,");
  });
});

describe("md-tui homebrew formula page", () => {
  test("classifies formulae.brew.sh formula/md-tui", () => {
    const r = classify("https://formulae.brew.sh/formula/md-tui");
    expect(r.type).toBe("homebrew-formula");
    expect(r.name).toBe("md-tui");
  });
});

describe("renderBottleBlock (kubetui-style bottles)", () => {
  test("renders kubetui API cellar values as valid Ruby", () => {
    const ruby = renderBottleBlock("  ", {
      rebuild: 0,
      root_url: "https://ghcr.io/v2/homebrew/core",
      files: {
        arm64_sequoia: {
          cellar: ":any_skip_relocation",
          sha256:
            "64b39231cd69738e52a20e34835c8e57a40d48e0a97f86727729709bd57724f4",
        },
        x86_64_linux: {
          cellar: ":any",
          sha256:
            "b6ec07469118fbf52ee22e48e12555bb35fbc71e2aa35e5b5e35337d905056cb",
        },
      },
    });
    expect(ruby).toContain(
      "sha256 cellar: :any_skip_relocation, arm64_sequoia:",
    );
    expect(ruby).toContain("sha256 cellar: :any, x86_64_linux:");
    expect(ruby).not.toContain("::any_skip_relocation");
    expect(ruby).not.toContain("::any,");
  });
});

describe("kubetui homebrew formula page", () => {
  test("classifies formulae.brew.sh formula/kubetui", () => {
    const r = classify("https://formulae.brew.sh/formula/kubetui");
    expect(r.type).toBe("homebrew-formula");
    expect(r.name).toBe("kubetui");
  });
});
