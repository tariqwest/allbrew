import { describe, expect, test } from "bun:test";
import {
  pickNewestNonDraftRelease,
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

  test("PortDeck-style prerelease-only arm64 dmg is an app asset", () => {
    const picked = pickReleaseWithAppAssets(
      [
        rel(
          "v0.1.0-beta.17",
          [
            "PortDeck-0.1.0-beta.17-macos-arm64.dmg",
            "PortDeck-0.1.0-beta.17-macos-arm64.zip",
          ],
          { prerelease: true },
        ),
      ],
      isAppAsset,
    );
    expect(picked?.tagName).toBe("v0.1.0-beta.17");
    expect(
      isAppAsset("PortDeck-0.1.0-beta.17-macos-arm64.dmg"),
    ).toBe(true);
  });
});

describe("pickNewestNonDraftRelease", () => {
  test("returns null for empty or draft-only lists", () => {
    expect(pickNewestNonDraftRelease([])).toBeNull();
    expect(
      pickNewestNonDraftRelease([
        rel("1.0.0-wip", ["a.dmg"], { draft: true }),
      ]),
    ).toBeNull();
  });

  test("prefers stable over newer prerelease when both present", () => {
    const picked = pickNewestNonDraftRelease([
      rel("2.0.0-rc1", ["a.dmg"], { prerelease: true }),
      rel("1.9.0", ["a.dmg"]),
    ]);
    expect(picked?.tagName).toBe("1.9.0");
  });

  test("falls back to newest prerelease when only prereleases exist (PortDeck)", () => {
    const picked = pickNewestNonDraftRelease([
      rel(
        "v0.1.0-beta.17",
        ["PortDeck-0.1.0-beta.17-macos-arm64.dmg"],
        { prerelease: true },
      ),
      rel(
        "v0.1.0-beta.16",
        ["PortDeck-0.1.0-beta.16-macos-arm64.dmg"],
        { prerelease: true },
      ),
    ]);
    expect(picked?.tagName).toBe("v0.1.0-beta.17");
  });
});
