import { describe, expect, test } from "bun:test";
import {
  pickReleaseWithAppAssets,
  pickReleaseWithBinaryAssets,
} from "../../lib/github.ts";
import { isAppAsset, isBinaryAsset, matchAssetToArch } from "../../lib/utils.ts";

function rel(
  tag: string,
  assets: string[],
  flags: { draft?: boolean; prerelease?: boolean } = {},
) {
  return {
    tagName: tag,
    name: tag,
    body: "",
    draft: Boolean(flags.draft),
    prerelease: Boolean(flags.prerelease),
    assets: assets.map((name) => ({
      name,
      url: `https://example.com/${name}`,
      size: 1,
      contentType: "application/octet-stream",
    })),
    tarballUrl: "",
    zipballUrl: "",
  };
}

describe("pickReleaseWithAppAssets", () => {
  test("picks newest stable release with osx.dmg when latest is linux-only", () => {
    const picked = pickReleaseWithAppAssets(
      [
        rel("0.17.0", [
          "manuskript-0.17.0-1.deb",
          "manuskript-0.17.0-windows.zip",
        ]),
        rel("0.16.1", ["manuskript-0.16.1-osx.dmg"]),
        rel("0.16.0", ["manuskript-0.16.0-osx.dmg"]),
      ],
      isAppAsset,
    );
    expect(picked?.tagName).toBe("0.16.1");
  });

  test("skips drafts and prefers stable over prerelease", () => {
    const picked = pickReleaseWithAppAssets(
      [
        rel("0.18.0-rc1", ["app-0.18.0-osx.dmg"], { prerelease: true }),
        rel("0.17.0-wip", ["app-wip.dmg"], { draft: true }),
        rel("0.16.1", ["app-0.16.1.dmg"]),
      ],
      isAppAsset,
    );
    expect(picked?.tagName).toBe("0.16.1");
  });

  test("falls back to prerelease app assets when no stable has them", () => {
    const picked = pickReleaseWithAppAssets(
      [
        rel("1.0.0", ["foo-linux.tar.gz"]),
        rel("1.0.0-beta", ["foo.dmg"], { prerelease: true }),
      ],
      isAppAsset,
    );
    expect(picked?.tagName).toBe("1.0.0-beta");
  });

  test("returns null when no app assets exist", () => {
    const picked = pickReleaseWithAppAssets(
      [rel("1.0.0", ["foo-linux.tar.gz", "foo.deb"])],
      isAppAsset,
    );
    expect(picked).toBeNull();
  });
});

describe("pickReleaseWithBinaryAssets", () => {
  const pickOpts = {
    isBinaryAssetFn: isBinaryAsset,
    matchAssetToArchFn: matchAssetToArch,
  };

  test("picks older release with aarch64-apple-darwin when latest has empty assets (lazyjj)", () => {
    const picked = pickReleaseWithBinaryAssets(
      [
        rel("v0.6.1", []),
        rel("v0.6.0", []),
        rel("v0.5.0", [
          "lazyjj-v0.5.0-aarch64-apple-darwin.tar.gz",
          "lazyjj-v0.5.0-x86_64-apple-darwin.tar.gz",
          "lazyjj-v0.5.0-x86_64-unknown-linux-musl.tar.gz",
        ]),
        rel("v0.4.2", [
          "lazyjj-v0.4.2-aarch64-apple-darwin.tar.gz",
        ]),
      ],
      pickOpts,
    );
    expect(picked?.tagName).toBe("v0.5.0");
  });

  test("skips intel-only macOS releases (no arm64/universal)", () => {
    const picked = pickReleaseWithBinaryAssets(
      [
        rel("v2.0.0", []),
        rel("v1.9.0", ["tool-v1.9.0-x86_64-apple-darwin.tar.gz"]),
        rel("v1.8.0", [
          "tool-v1.8.0-aarch64-apple-darwin.tar.gz",
          "tool-v1.8.0-x86_64-apple-darwin.tar.gz",
        ]),
      ],
      pickOpts,
    );
    expect(picked?.tagName).toBe("v1.8.0");
  });

  test("skips linux-only releases", () => {
    const picked = pickReleaseWithBinaryAssets(
      [
        rel("v2.0.0", ["tool-linux-amd64.tar.gz"]),
        rel("v1.0.0", ["tool-darwin-arm64.tar.gz"]),
      ],
      pickOpts,
    );
    expect(picked?.tagName).toBe("v1.0.0");
  });

  test("returns null when no usable macOS binary assets", () => {
    const picked = pickReleaseWithBinaryAssets(
      [
        rel("v1.0.0", ["tool-linux-amd64.tar.gz", "tool-windows.exe"]),
      ],
      pickOpts,
    );
    expect(picked).toBeNull();
  });
});
