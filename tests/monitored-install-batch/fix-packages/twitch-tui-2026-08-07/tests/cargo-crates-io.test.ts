import { describe, it, expect, mock } from "bun:test";
import {
  parseGithubRepoFromUrl,
  cratesIoCrateUrl,
  collectCargoPackagePayload,
  fetchCratesIoCrate,
} from "../../../lib/generators/cargo-package.ts";

describe("parseGithubRepoFromUrl", () => {
  it("parses https github URLs", () => {
    expect(
      parseGithubRepoFromUrl("https://github.com/Xithrius/twitch-tui"),
    ).toEqual({ owner: "Xithrius", repo: "twitch-tui" });
  });

  it("strips .git suffix", () => {
    expect(
      parseGithubRepoFromUrl("https://github.com/Xithrius/twitch-tui.git"),
    ).toEqual({ owner: "Xithrius", repo: "twitch-tui" });
  });

  it("returns null for non-github", () => {
    expect(parseGithubRepoFromUrl("https://gitlab.com/foo/bar")).toBeNull();
  });
});

describe("cratesIoCrateUrl", () => {
  it("builds static.crates.io URL", () => {
    expect(cratesIoCrateUrl("twitch-tui", "2.6.19")).toBe(
      "https://static.crates.io/crates/twitch-tui/twitch-tui-2.6.19.crate",
    );
  });
});

describe("collectCargoPackagePayload crate tarball path", () => {
  it("uses crateVersion + crateChecksum without release", async () => {
    const payload = await collectCargoPackagePayload(
      {
        name: "twitch-tui",
        fullName: "Xithrius/twitch-tui",
        description: "Twitch chat in the terminal.",
        homepage: "https://github.com/Xithrius/twitch-tui",
        htmlUrl: "https://github.com/Xithrius/twitch-tui",
        defaultBranch: "main",
        license: "MIT",
      },
      null,
      {
        crateName: "twitch-tui",
        crateVersion: "2.6.19",
        crateChecksum: "abc123checksum",
        binName: "twt",
      },
    );
    expect(payload.urlLines).toContain(
      "https://static.crates.io/crates/twitch-tui/twitch-tui-2.6.19.crate",
    );
    expect(payload.urlLines).toContain("abc123checksum");
    expect(payload.urlLines).toContain('version "2.6.19"');
    expect(payload.testBinName).toBe("twt");
    expect(payload.livecheckBlock).toContain("twitch-tui");
  });
});

describe("fetchCratesIoCrate (mocked)", () => {
  it("prefers max_stable_version and bin_names", async () => {
    const prev = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({
        crate: {
          name: "twitch-tui",
          description: "Twitch chat in the terminal.",
          homepage: "https://github.com/Xithrius/twitch-tui",
          repository: "https://github.com/Xithrius/twitch-tui",
          max_stable_version: "2.6.19",
          newest_version: "3.0.0-alpha.3",
        },
        versions: [
          {
            num: "3.0.0-alpha.3",
            checksum: "aaa",
            bin_names: ["twt"],
            yanked: false,
          },
          {
            num: "2.6.19",
            checksum: "bbb",
            bin_names: ["twt"],
            license: "MIT OR Apache-2.0",
            yanked: false,
          },
        ],
      }),
    })) as any;

    try {
      const info = await fetchCratesIoCrate("twitch-tui");
      expect(info.version).toBe("2.6.19");
      expect(info.checksum).toBe("bbb");
      expect(info.binNames).toEqual(["twt"]);
      expect(info.githubOwner).toBe("Xithrius");
      expect(info.githubRepo).toBe("twitch-tui");
    } finally {
      globalThis.fetch = prev;
    }
  });
});
