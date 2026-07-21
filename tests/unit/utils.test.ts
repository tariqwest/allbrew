import { describe, it, expect } from "bun:test";
import {
  toFormulaName,
  toClassName,
  toCaskToken,
  extractVersionFromTag,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  matchAssetToArch,
  isAppAsset,
  isBinaryAsset,
} from "../../lib/utils.ts";

describe("toFormulaName", () => {
  it("lowercases and replaces non-alphanumeric with hyphens", () => {
    expect(toFormulaName("CQ-editor")).toBe("cq-editor");
  });

  it("handles scoped npm packages", () => {
    expect(toFormulaName("@hehehai/buke")).toBe("hehehai-buke");
  });

  it("collapses multiple hyphens", () => {
    expect(toFormulaName("foo--bar---baz")).toBe("foo-bar-baz");
  });

  it("strips leading and trailing hyphens", () => {
    expect(toFormulaName("-foo-bar-")).toBe("foo-bar");
  });

  it("passes through already-valid names", () => {
    expect(toFormulaName("pyqt-openai")).toBe("pyqt-openai");
  });

  it("handles underscores", () => {
    expect(toFormulaName("spotify_player")).toBe("spotify-player");
  });

  it("handles dots", () => {
    expect(toFormulaName("Rnwood.Smtp4dev")).toBe("rnwood-smtp4dev");
  });
});

describe("toClassName", () => {
  it("capitalizes each segment", () => {
    expect(toClassName("foo-bar")).toBe("FooBar");
  });

  it("handles single word", () => {
    expect(toClassName("marimo")).toBe("Marimo");
  });

  it("handles multiple segments", () => {
    expect(toClassName("cq-editor")).toBe("CqEditor");
  });

  it("handles numeric segments", () => {
    expect(toClassName("smtp4dev")).toBe("Smtp4dev");
  });
});

describe("toCaskToken", () => {
  it("lowercases and replaces non-alphanumeric with hyphens", () => {
    expect(toCaskToken("Seaquel_2026")).toBe("seaquel-2026");
  });

  it("collapses multiple hyphens", () => {
    expect(toCaskToken("Foo  Bar")).toBe("foo-bar");
  });

  it("strips leading/trailing hyphens", () => {
    expect(toCaskToken(".FooBar.")).toBe("foobar");
  });
});

describe("extractVersionFromTag", () => {
  it("strips leading v", () => {
    expect(extractVersionFromTag("v1.2.3")).toBe("1.2.3");
  });

  it("strips leading V (case insensitive)", () => {
    expect(extractVersionFromTag("V2.0.0")).toBe("2.0.0");
  });

  it("passes through tags without v prefix", () => {
    expect(extractVersionFromTag("1.0.0")).toBe("1.0.0");
  });

  it("handles complex version strings", () => {
    expect(extractVersionFromTag("v2026.4.8")).toBe("2026.4.8");
  });
});

describe("rubyEscape", () => {
  it("escapes backslashes", () => {
    expect(rubyEscape("foo\\bar")).toBe("foo\\\\bar");
  });

  it("escapes double quotes", () => {
    expect(rubyEscape('say "hello"')).toBe('say \\"hello\\"');
  });

  it("handles null/undefined", () => {
    expect(rubyEscape(null)).toBe("");
    expect(rubyEscape(undefined)).toBe("");
  });

  it("passes through safe strings", () => {
    expect(rubyEscape("hello world")).toBe("hello world");
  });
});

describe("rubyString", () => {
  it("wraps in double quotes", () => {
    expect(rubyString("hello")).toBe('"hello"');
  });

  it("returns empty string for falsy values", () => {
    expect(rubyString("")).toBe('""');
    expect(rubyString(null)).toBe('""');
  });

  it("escapes contents", () => {
    expect(rubyString('say "hi"')).toBe('"say \\"hi\\""');
  });
});

describe("guessLicenseIdentifier", () => {
  it("normalizes MIT", () => {
    expect(guessLicenseIdentifier("MIT")).toBe("MIT");
    expect(guessLicenseIdentifier("mit")).toBe("MIT");
  });

  it("normalizes Apache-2.0", () => {
    expect(guessLicenseIdentifier("Apache-2.0")).toBe("Apache-2.0");
    expect(guessLicenseIdentifier("apache 2.0")).toBe("Apache-2.0");
  });

  it("normalizes GPL variants", () => {
    expect(guessLicenseIdentifier("GPL-3.0")).toBe("GPL-3.0-only");
    expect(guessLicenseIdentifier("gpl-2.0")).toBe("GPL-2.0-only");
  });

  it("returns null for null/undefined", () => {
    expect(guessLicenseIdentifier(null)).toBeNull();
    expect(guessLicenseIdentifier(undefined)).toBeNull();
  });

  it("passes through unknown licenses as-is", () => {
    expect(guessLicenseIdentifier("WTFPL")).toBe("WTFPL");
  });
});

describe("matchAssetToArch", () => {
  it("matches macOS ARM64 patterns", () => {
    expect(matchAssetToArch("foo-darwin-arm64.tar.gz")).toBe("macosArm");
    expect(matchAssetToArch("foo-macos-arm64.tgz")).toBe("macosArm");
    expect(matchAssetToArch("foo_aarch64_apple.zip")).toBe("macosArm");
  });

  it("matches macOS Intel patterns", () => {
    expect(matchAssetToArch("foo-darwin-amd64.tar.gz")).toBe("macosIntel");
    expect(matchAssetToArch("foo-macos-x86_64.tgz")).toBe("macosIntel");
  });

  it("matches Linux ARM64 patterns", () => {
    expect(matchAssetToArch("foo-linux-arm64.tar.gz")).toBe("linuxArm");
    expect(matchAssetToArch("foo-linux-aarch64.tgz")).toBe("linuxArm");
  });

  it("matches Linux Intel patterns", () => {
    expect(matchAssetToArch("foo-linux-amd64.tar.gz")).toBe("linuxIntel");
    expect(matchAssetToArch("foo-linux-x86_64.tgz")).toBe("linuxIntel");
  });

  it("returns null for unrecognized patterns", () => {
    expect(matchAssetToArch("foo-windows-x64.exe")).toBeNull();
    expect(matchAssetToArch("README.md")).toBeNull();
  });
});

describe("isAppAsset", () => {
  it("matches .dmg files", () => {
    expect(isAppAsset("Foo.dmg")).toBe(true);
    expect(isAppAsset("Foo-1.2.3.DMG")).toBe(true);
  });

  it("matches macOS .zip files", () => {
    expect(isAppAsset("Foo-macos.zip")).toBe(true);
    expect(isAppAsset("Foo-darwin-arm64.zip")).toBe(true);
  });

  it("rejects non-mac .zip files", () => {
    expect(isAppAsset("foo-linux-x64.zip")).toBe(false);
  });

  it("rejects non-archive files", () => {
    expect(isAppAsset("README.md")).toBe(false);
  });
});

describe("isBinaryAsset", () => {
  it("matches archive extensions that aren't app assets", () => {
    expect(isBinaryAsset("foo-linux-amd64.tar.gz")).toBe(true);
    expect(isBinaryAsset("foo-darwin-arm64.tgz")).toBe(true);
  });

  it("rejects app assets", () => {
    expect(isBinaryAsset("Foo-macos.zip")).toBe(false);
    expect(isBinaryAsset("Foo.dmg")).toBe(false);
  });

  it("rejects non-archive files", () => {
    expect(isBinaryAsset("foo.exe")).toBe(false);
  });
});
