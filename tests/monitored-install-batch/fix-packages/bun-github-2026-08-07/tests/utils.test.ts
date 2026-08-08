import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  toFormulaName,
  toClassName,
  toCaskToken,
  extractVersionFromTag,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  matchAssetToArch,
  isHostCompatibleBinaryAsset,
  releaseHasHostCompatibleBinary,
  isAppAsset,
  isBinaryAsset,
  assertSafeFetchUrl,
  resolveNonCollidingFormulaName,
  resolveNonCollidingCaskName,
  chooseReleaseArtifactKind,
  setHomebrewCorePrefixForTests,
  setHomebrewCaskPrefixForTests,
  setHomebrewCachePrefixForTests,
  setHomebrewCaskTokenOverrideForTests,
  isHomebrewCoreFormulaName,
  isHomebrewCaskToken,
} from "../../lib/utils.ts";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

describe("resolveNonCollidingFormulaName", () => {
  let coreRoot: string;

  beforeEach(() => {
    coreRoot = mkdtempSync(join(tmpdir(), "allbrew-core-"));
    mkdirSync(join(coreRoot, "Formula", "n"), { recursive: true });
    writeFileSync(join(coreRoot, "Formula", "n", "nanobot.rb"), "class Nanobot < Formula\nend\n");
    setHomebrewCorePrefixForTests(coreRoot);
  });

  afterEach(() => {
    setHomebrewCorePrefixForTests(undefined);
    rmSync(coreRoot, { recursive: true, force: true });
  });

  it("keeps names that are free in homebrew/core", () => {
    const result = resolveNonCollidingFormulaName("unique-cli", ["unique-cli"]);
    expect(result).toEqual({
      name: "unique-cli",
      renamedFrom: null,
      reason: null,
    });
    expect(isHomebrewCoreFormulaName("unique-cli")).toBe(false);
  });

  it("renames bare nanobot to nanobot-ai when core owns nanobot", () => {
    expect(isHomebrewCoreFormulaName("nanobot")).toBe(true);
    const result = resolveNonCollidingFormulaName("nanobot", [
      "nanobot-ai",
      "nanobot",
    ]);
    expect(result.name).toBe("nanobot-ai");
    expect(result.renamedFrom).toBe("nanobot");
    expect(result.reason).toContain("nanobot");
  });

  it("falls back to -tap suffix when alternatives also collide", () => {
    mkdirSync(join(coreRoot, "Formula", "n"), { recursive: true });
    writeFileSync(
      join(coreRoot, "Formula", "n", "nanobot-ai.rb"),
      "class NanobotAi < Formula\nend\n",
    );
    const result = resolveNonCollidingFormulaName("nanobot", ["nanobot-ai"]);
    expect(result.name).toBe("nanobot-tap");
    expect(result.renamedFrom).toBe("nanobot");
  });
});

describe("resolveNonCollidingCaskName", () => {
  let caskRoot: string;
  let cacheRoot: string;

  beforeEach(() => {
    caskRoot = mkdtempSync(join(tmpdir(), "allbrew-cask-"));
    cacheRoot = mkdtempSync(join(tmpdir(), "allbrew-brew-cache-"));
    mkdirSync(join(caskRoot, "Casks", "z"), { recursive: true });
    writeFileSync(
      join(caskRoot, "Casks", "z", "zap.rb"),
      'cask "zap" do\nend\n',
    );
    setHomebrewCaskPrefixForTests(caskRoot);
    setHomebrewCachePrefixForTests(cacheRoot);
    setHomebrewCaskTokenOverrideForTests(undefined);
  });

  afterEach(() => {
    setHomebrewCaskPrefixForTests(undefined);
    setHomebrewCachePrefixForTests(undefined);
    setHomebrewCaskTokenOverrideForTests(undefined);
    rmSync(caskRoot, { recursive: true, force: true });
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  it("keeps names that are free in homebrew/cask", () => {
    const result = resolveNonCollidingCaskName("unique-app", ["unique-app"]);
    expect(result).toEqual({
      name: "unique-app",
      renamedFrom: null,
      reason: null,
    });
    expect(isHomebrewCaskToken("unique-app")).toBe(false);
  });

  it("renames bare zap using owner alternative when homebrew/cask owns zap", () => {
    expect(isHomebrewCaskToken("zap")).toBe(true);
    const result = resolveNonCollidingCaskName("zap", [
      "zerx-lab-zap",
      "zap-zerx-lab",
    ]);
    expect(result.name).toBe("zerx-lab-zap");
    expect(result.renamedFrom).toBe("zap");
    expect(result.reason).toContain("zap");
  });

  it("falls back to -tap suffix when alternatives also collide", () => {
    writeFileSync(
      join(caskRoot, "Casks", "z", "zap-zerx-lab.rb"),
      'cask "zap-zerx-lab" do\nend\n',
    );
    const result = resolveNonCollidingCaskName("zap", ["zap-zerx-lab"]);
    expect(result.name).toBe("zap-tap");
    expect(result.renamedFrom).toBe("zap");
  });

  it("detects cask tokens from Homebrew API cache when tap checkout is missing", () => {
    setHomebrewCaskPrefixForTests(null);
    mkdirSync(join(cacheRoot, "api", "cask"), { recursive: true });
    writeFileSync(
      join(cacheRoot, "api", "cask", "zap.json"),
      JSON.stringify({ token: "zap", tap: "homebrew/cask" }),
    );
    expect(isHomebrewCaskToken("zap")).toBe(true);
    const result = resolveNonCollidingCaskName("zap", ["zap-zerx-lab"]);
    expect(result.name).toBe("zap-zerx-lab");
  });

  it("honors explicit token override set for tests", () => {
    setHomebrewCaskPrefixForTests(null);
    setHomebrewCachePrefixForTests(null);
    setHomebrewCaskTokenOverrideForTests(new Set(["collision"]));
    expect(isHomebrewCaskToken("collision")).toBe(true);
    expect(isHomebrewCaskToken("free-name")).toBe(false);
  });
});

describe("chooseReleaseArtifactKind", () => {
  it("prefers cask when both app and binary assets exist", () => {
    expect(chooseReleaseArtifactKind(2, 3)).toBe("cask");
  });

  it("returns cask when only app assets exist", () => {
    expect(chooseReleaseArtifactKind(1, 0)).toBe("cask");
  });

  it("returns binary when only binary assets exist", () => {
    expect(chooseReleaseArtifactKind(0, 2)).toBe("binary");
  });

  it("returns null when neither asset kind exists", () => {
    expect(chooseReleaseArtifactKind(0, 0)).toBeNull();
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

  it("strips rust-v style prefixes", () => {
    expect(extractVersionFromTag("rust-v0.0.34")).toBe("0.0.34");
  });

  it("strips release- prefixes", () => {
    expect(extractVersionFromTag("release-1.2.3")).toBe("1.2.3");
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

  it("preserves known-safe Homebrew interpolations (e.g. #{version})", () => {
    expect(rubyEscape("https://example.com/v#{version}/foo")).toBe(
      "https://example.com/v#{version}/foo",
    );
    expect(rubyEscape("~/Library/Caches/#{name}")).toBe(
      "~/Library/Caches/#{name}",
    );
  });

  it("escapes unknown Ruby interpolation sequences", () => {
    expect(rubyEscape('desc with #{`rm -rf /`}')).toBe(
      'desc with \\#{`rm -rf /`}',
    );
    expect(rubyEscape("#{foo}")).toBe("\\#{foo}");
  });

  it("escapes control characters", () => {
    expect(rubyEscape("line1\nline2\r\nline3\t")).toBe(
      "line1\\nline2\\r\\nline3\\t",
    );
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

describe("assertSafeFetchUrl", () => {
  it("allows plain https URLs", () => {
    expect(() => assertSafeFetchUrl("https://example.com/foo.tgz")).not.toThrow();
  });

  it("allows localhost http URLs", () => {
    expect(() => assertSafeFetchUrl("http://localhost:8080/foo")).not.toThrow();
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => assertSafeFetchUrl("file:///etc/passwd")).toThrow(
      /Unsupported URL protocol/,
    );
  });

  it("rejects cloud metadata endpoints", () => {
    expect(() => assertSafeFetchUrl("http://169.254.169.254/latest/meta-data/")).toThrow(
      /Blocked cloud metadata URL/,
    );
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
    // oven-sh/bun: platform-first then aarch64 (not aarch64-first)
    expect(matchAssetToArch("bun-darwin-aarch64.zip")).toBe("macosArm");
    expect(matchAssetToArch("bun-darwin-aarch64-profile.zip")).toBe("macosArm");
    expect(matchAssetToArch("bun-macos-aarch64.zip")).toBe("macosArm");
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

describe("isHostCompatibleBinaryAsset", () => {
  it("requires darwin arm64 or universal on Apple Silicon", () => {
    const host = { platform: "darwin", arch: "arm64" };
    expect(isHostCompatibleBinaryAsset("tdash-darwin-amd64", host)).toBe(false);
    expect(isHostCompatibleBinaryAsset("tdash-linux-arm64", host)).toBe(false);
    expect(isHostCompatibleBinaryAsset("tdash-darwin-arm64", host)).toBe(true);
    expect(isHostCompatibleBinaryAsset("tool-macos-universal", host)).toBe(true);
  });

  it("requires darwin amd64 or universal on Intel Mac", () => {
    const host = { platform: "darwin", arch: "x64" };
    expect(isHostCompatibleBinaryAsset("tdash-darwin-amd64", host)).toBe(true);
    expect(isHostCompatibleBinaryAsset("tdash-darwin-arm64", host)).toBe(false);
  });

  it("releaseHasHostCompatibleBinary for tdash-like releases", () => {
    const assets = [
      "tdash-darwin-amd64",
      "tdash-linux-amd64",
      "tdash-linux-arm64",
    ];
    expect(
      releaseHasHostCompatibleBinary(assets, { platform: "darwin", arch: "arm64" }),
    ).toBe(false);
    expect(
      releaseHasHostCompatibleBinary(assets, { platform: "darwin", arch: "x64" }),
    ).toBe(true);
  });
});

describe("isAppAsset", () => {
  it("matches .dmg files", () => {
    expect(isAppAsset("Foo.dmg")).toBe(true);
    expect(isAppAsset("Foo-1.2.3.DMG")).toBe(true);
  });

  it("matches macOS desktop .zip files without cpu arch tags", () => {
    expect(isAppAsset("Foo-macos.zip")).toBe(true);
    expect(isAppAsset("Foo-darwin.zip")).toBe(true);
    expect(isAppAsset("MyApp.app.zip")).toBe(true);
  });

  it("rejects arch-tagged darwin/macos CLI zips (not app bundles)", () => {
    expect(isAppAsset("Foo-darwin-arm64.zip")).toBe(false);
    expect(isAppAsset("gogs_0.14.3_darwin_amd64.zip")).toBe(false);
    expect(isAppAsset("tool-macos-x64.zip")).toBe(false);
  });

  it("matches macOS installer zips even when arch-tagged (zip-wrapped DMG)", () => {
    // Nicotine+: macos-arm64-installer.zip contains nicotine+-X.Y.Z.dmg
    expect(isAppAsset("macos-arm64-installer.zip")).toBe(true);
    expect(isAppAsset("macos-x86_64-installer.zip")).toBe(true);
    expect(isAppAsset("Foo-macos-arm64-installer.zip")).toBe(true);
    expect(isBinaryAsset("macos-arm64-installer.zip")).toBe(false);
  });

  it("matches short mac+arch desktop app zips (Electron/Fyne)", () => {
    // Supersonic releases: Product-version-mac-arm64.zip contains Supersonic.app
    expect(isAppAsset("Supersonic-0.22.0-mac-arm64.zip")).toBe(true);
    expect(isAppAsset("Supersonic-0.22.0-mac-x64.zip")).toBe(true);
    expect(isAppAsset("MyApp-1.0.0-mac-arm64.zip")).toBe(true);
    expect(matchAssetToArch("Supersonic-0.22.0-mac-arm64.zip")).toBe("macosArm");
    expect(matchAssetToArch("Supersonic-0.22.0-mac-x64.zip")).toBe("macosIntel");
  });

  it("rejects non-mac .zip files", () => {
    expect(isAppAsset("foo-linux-x64.zip")).toBe(false);
  });

  it("rejects non-archive files", () => {
    expect(isAppAsset("README.md")).toBe(false);
  });

  it("matches product-style macOS .tgz app archives (Mission Control Plus)", () => {
    expect(isAppAsset("Mission.Control.Plus.tgz")).toBe(true);
    expect(isAppAsset("Foo.Bar.Baz.tar.gz")).toBe(true);
    expect(isAppAsset("MyApp.app.tgz")).toBe(true);
  });

  it("rejects platform-tagged CLI tarballs as app assets", () => {
    expect(isAppAsset("foo-darwin-arm64.tgz")).toBe(false);
    expect(isAppAsset("foo-linux-amd64.tar.gz")).toBe(false);
  });

  it("rejects macOS CLI tarballs without cpu arch (not .app bundles)", () => {
    // SwiftPolyglot / many go-style releases: name-version-macos.tar.gz → bare binary
    expect(isAppAsset("swiftpolyglot-2.0.2-macos.tar.gz")).toBe(false);
    expect(isBinaryAsset("swiftpolyglot-2.0.2-macos.tar.gz")).toBe(true);
    expect(matchAssetToArch("swiftpolyglot-2.0.2-macos.tar.gz")).toBe(
      "macosUniversal",
    );
    expect(isAppAsset("tool-1.0.0-darwin.tar.gz")).toBe(false);
    expect(isBinaryAsset("tool-1.0.0-darwin.tar.gz")).toBe(true);
  });
});

describe("isBinaryAsset", () => {
  it("matches archive extensions that aren't app assets", () => {
    expect(isBinaryAsset("foo-linux-amd64.tar.gz")).toBe(true);
    expect(isBinaryAsset("foo-darwin-arm64.tgz")).toBe(true);
  });

  it("matches bare platform-tagged binaries (e.g. Bun compile releases)", () => {
    expect(isBinaryAsset("csctf-macos-arm64")).toBe(true);
    expect(isBinaryAsset("csctf-macos-x64")).toBe(true);
    expect(isBinaryAsset("csctf-linux-arm64")).toBe(true);
    expect(isBinaryAsset("csctf-linux-x64")).toBe(true);
    // Windows assets are ignored by Homebrew arch matching (no formula target).
    expect(isBinaryAsset("csctf-windows-x64.exe")).toBe(false);
    expect(matchAssetToArch("csctf-macos-arm64")).toBe("macosArm");
    expect(matchAssetToArch("csctf-macos-x64")).toBe("macosIntel");
  });

  it("rejects app assets", () => {
    expect(isBinaryAsset("Foo-macos.zip")).toBe(false);
    expect(isBinaryAsset("Foo.dmg")).toBe(false);
    expect(isBinaryAsset("MyApp.app.zip")).toBe(false);
  });

  it("treats arch-tagged darwin zips as CLI binaries", () => {
    expect(isBinaryAsset("gogs_0.14.3_darwin_amd64.zip")).toBe(true);
    expect(isBinaryAsset("Foo-darwin-arm64.zip")).toBe(true);
  });

  it("rejects checksum/docs and untagged binaries", () => {
    expect(isBinaryAsset("foo.exe")).toBe(false);
    expect(isBinaryAsset("csctf-macos-arm64.sha256")).toBe(false);
    expect(isBinaryAsset("sha256.txt")).toBe(false);
    expect(isBinaryAsset("README.md")).toBe(false);
  });

  it("matches versioned bare binaries like afm_0.1.0_macOS_universal", () => {
    expect(isBinaryAsset("afm_0.1.0_macOS_universal")).toBe(true);
    expect(matchAssetToArch("afm_0.1.0_macOS_universal")).toBe("macosUniversal");
    expect(isBinaryAsset("tool-1.2.3-linux-x64")).toBe(true);
    expect(isBinaryAsset("afm_0.1.0_checksums.txt")).toBe(false);
  });
});
