import { describe, expect, test } from "bun:test";
import {
  extractAssetsFromReleaseBody,
  mergeBodyAssetsIntoRelease,
  pickReleaseWithAppAssets,
} from "../../lib/github.ts";
import { isAppAsset } from "../../lib/utils.ts";

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

describe("extractAssetsFromReleaseBody (CDN / CrabNebula)", () => {
  const capBody = `
## Downloads
- [macOS (Apple Silicon)](https://cdn.crabnebula.app/asset/01KZEFZ68WNSB388NYX4CS5WR3)
- [macOS (Intel)](https://cdn.crabnebula.app/asset/01KZEFNE730CAPDCNP2RQ066VT)
- [Windows](https://cdn.crabnebula.app/asset/01KZEK613F20ZWMV8ZC1JY7HMR)
- [Linux](https://cdn.crabnebula.app/asset/01KZEFJYCGN6YJ32PQ7AX334RZ)

<!-- DOWNLOADS_JSON {"macos-arm64":"https://cdn.crabnebula.app/asset/01KZEFZ68WNSB388NYX4CS5WR3","macos-x64":"https://cdn.crabnebula.app/asset/01KZEFNE730CAPDCNP2RQ066VT","windows":"https://cdn.crabnebula.app/asset/01KZEK613F20ZWMV8ZC1JY7HMR","linux":"https://cdn.crabnebula.app/asset/01KZEFJYCGN6YJ32PQ7AX334RZ"} -->
`;

  test("parses DOWNLOADS_JSON macos keys only", () => {
    const assets = extractAssetsFromReleaseBody(capBody, {
      productName: "Cap",
    });
    expect(assets.length).toBe(2);
    expect(assets.every((a) => a.name.endsWith(".dmg"))).toBe(true);
    expect(assets.some((a) => /arm64/i.test(a.name))).toBe(true);
    expect(assets.some((a) => /x64/i.test(a.name))).toBe(true);
    expect(
      assets.every((a) => a.url.includes("cdn.crabnebula.app")),
    ).toBe(true);
  });

  test("isAppAsset accepts synthesized names", () => {
    const assets = extractAssetsFromReleaseBody(capBody, {
      productName: "Cap",
    });
    for (const a of assets) {
      expect(isAppAsset(a.name)).toBe(true);
    }
  });

  test("mergeBodyAssetsIntoRelease fills empty assets", () => {
    const merged = mergeBodyAssetsIntoRelease(
      {
        tagName: "cap-v0.5.9",
        name: "0.5.9",
        body: capBody,
        assets: [],
      },
      { productName: "Cap" },
    );
    expect(merged?.assets?.length).toBe(2);
  });

  test("mergeBodyAssetsIntoRelease keeps real GitHub assets", () => {
    const merged = mergeBodyAssetsIntoRelease(
      {
        tagName: "v1",
        body: capBody,
        assets: [
          {
            name: "Real.dmg",
            url: "https://github.com/ex/r/releases/download/v1/Real.dmg",
          },
        ],
      },
      { productName: "Cap" },
    );
    expect(merged?.assets?.length).toBe(1);
    expect(merged?.assets?.[0].name).toBe("Real.dmg");
  });

  test("ignores non-mac labels", () => {
    const assets = extractAssetsFromReleaseBody(
      "[Windows](https://cdn.example.com/win) [Linux](https://cdn.example.com/lin)",
    );
    expect(assets.length).toBe(0);
  });
});
