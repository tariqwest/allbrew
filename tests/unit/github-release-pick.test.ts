import { describe, expect, test } from "bun:test";
import {
  pickReleaseWithAppAssets,
  pickReleaseWithBinaryAssets,
  releaseMatchesProductName,
  textMatchesProductName,
} from "../../lib/github.ts";
import { isAppAsset, isBinaryAsset, matchAssetToArch } from "../../lib/utils.ts";

function rel(
  tag: string,
  assets: string[],
  flags: { draft?: boolean; prerelease?: boolean; name?: string } = {},
) {
  return {
    tagName: tag,
    name: flags.name ?? tag,
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

describe("textMatchesProductName / releaseMatchesProductName", () => {
  test("cua-driver matches cua-driver-rs tags and assets, not lume", () => {
    expect(textMatchesProductName("cua-driver", "cua-driver-rs-v0.19.3")).toBe(
      true,
    );
    expect(
      textMatchesProductName(
        "cua-driver",
        "cua-driver-rs-0.19.3-darwin-arm64.tar.gz",
      ),
    ).toBe(true);
    expect(textMatchesProductName("cua-driver", "lume-v0.5.3")).toBe(false);
    expect(
      textMatchesProductName("cua-driver", "lume-0.5.3-darwin-arm64.tar.gz"),
    ).toBe(false);
  });

  test("releaseMatchesProductName uses tag or assets", () => {
    expect(
      releaseMatchesProductName(
        rel("cua-driver-rs-v0.19.3", [
          "cua-driver-rs-0.19.3-darwin-arm64.tar.gz",
        ]),
        "cua-driver",
      ),
    ).toBe(true);
    expect(
      releaseMatchesProductName(
        rel("lume-v0.5.3", ["lume-0.5.3-darwin-arm64.tar.gz"]),
        "cua-driver",
      ),
    ).toBe(false);
  });
});

describe("pickReleaseWithBinaryAssets", () => {
  const binOpts = {
    isBinaryAssetFn: isBinaryAsset,
    matchAssetToArchFn: matchAssetToArch,
  };

  test("with productName picks cua-driver-rs over newer lume latest", () => {
    const picked = pickReleaseWithBinaryAssets(
      [
        rel("lume-v0.5.3", [
          "lume-0.5.3-darwin-arm64.tar.gz",
          "lume-0.5.3-darwin-arm64.pkg.tar.gz",
        ]),
        rel("cua-driver-rs-v0.19.3", [
          "cua-driver-rs-0.19.3-darwin-arm64.tar.gz",
          "cua-driver-rs-0.19.3-darwin-universal.tar.gz",
          "cua-driver-rs-0.19.3-linux-x86_64.tar.gz",
        ]),
        rel("cua-driver-rs-v0.19.2", [
          "cua-driver-rs-0.19.2-darwin-arm64.tar.gz",
        ]),
      ],
      { ...binOpts, productName: "cua-driver" },
    );
    expect(picked?.tagName).toBe("cua-driver-rs-v0.19.3");
  });

  test("without productName picks newest with macOS arm/universal bins", () => {
    const picked = pickReleaseWithBinaryAssets(
      [
        rel("lume-v0.5.3", ["lume-0.5.3-darwin-arm64.tar.gz"]),
        rel("cua-driver-rs-v0.19.3", [
          "cua-driver-rs-0.19.3-darwin-arm64.tar.gz",
        ]),
      ],
      binOpts,
    );
    expect(picked?.tagName).toBe("lume-v0.5.3");
  });

  test("prefers stable over prerelease for same product", () => {
    const picked = pickReleaseWithBinaryAssets(
      [
        rel(
          "nightly-cua-driver-rs-v0.19.4-nightly.1",
          ["cua-driver-rs-0.19.4-nightly.1-darwin-arm64.tar.gz"],
          { prerelease: true },
        ),
        rel("cua-driver-rs-v0.19.3", [
          "cua-driver-rs-0.19.3-darwin-arm64.tar.gz",
        ]),
      ],
      { ...binOpts, productName: "cua-driver" },
    );
    expect(picked?.tagName).toBe("cua-driver-rs-v0.19.3");
  });

  test("when all product tags are prerelease, prefers non-nightly over nightly", () => {
    const picked = pickReleaseWithBinaryAssets(
      [
        rel(
          "nightly-cua-driver-rs-v0.19.4-nightly.1",
          ["cua-driver-rs-0.19.4-nightly.1-darwin-arm64.tar.gz"],
          { prerelease: true },
        ),
        rel(
          "cua-driver-rs-v0.19.3",
          ["cua-driver-rs-0.19.3-darwin-arm64.tar.gz"],
          { prerelease: true },
        ),
        rel(
          "cua-driver-rs-v0.19.2",
          ["cua-driver-rs-0.19.2-darwin-arm64.tar.gz"],
          { prerelease: true },
        ),
      ],
      { ...binOpts, productName: "cua-driver" },
    );
    expect(picked?.tagName).toBe("cua-driver-rs-v0.19.3");
  });

  test("returns null when product has no matching binary release", () => {
    const picked = pickReleaseWithBinaryAssets(
      [rel("lume-v0.5.3", ["lume-0.5.3-darwin-arm64.tar.gz"])],
      { ...binOpts, productName: "cua-driver" },
    );
    expect(picked).toBeNull();
  });
});
