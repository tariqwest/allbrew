import { describe, it, expect, mock, beforeEach } from "bun:test";

/**
 * Exercises getLatestRelease's 404 → prerelease fallback without network.
 * We inject a fake Octokit via initOctokit by replacing the module's internal
 * client through the public API surface after mocking `octokit`.
 */

describe("getLatestRelease prerelease fallback", () => {
  let getLatestRelease: (owner: string, repo: string) => Promise<any>;
  let initOctokit: (token?: string | null) => void;
  let listHandler: any;
  let latestHandler: any;

  beforeEach(async () => {
    mock.restore();
    latestHandler = null;
    listHandler = null;

    mock.module("octokit", () => ({
      Octokit: class FakeOctokit {
        rest = {
          repos: {
            getLatestRelease: (...args: any[]) => latestHandler(...args),
            listReleases: (...args: any[]) => listHandler(...args),
          },
        };
        constructor(_opts?: any) {}
      },
    }));

    // Fresh import after mock
    const gh = await import("../../lib/github.ts");
    getLatestRelease = gh.getLatestRelease;
    initOctokit = gh.initOctokit;
    initOctokit(null);
  });

  it("returns latest stable when available", async () => {
    latestHandler = async () => ({
      data: {
        tag_name: "v1.0.0",
        name: "1.0.0",
        body: "",
        draft: false,
        prerelease: false,
        assets: [],
        tarball_url: "t",
        zipball_url: "z",
      },
    });
    listHandler = async () => ({ data: [] });
    const release = await getLatestRelease("o", "r");
    expect(release?.tagName).toBe("v1.0.0");
    expect(release?.prerelease).toBe(false);
  });

  it("falls back to newest prerelease when /releases/latest 404s", async () => {
    latestHandler = async () => {
      const err: any = new Error("Not Found");
      err.status = 404;
      throw err;
    };
    listHandler = async () => ({
      data: [
        {
          tag_name: "v0.2.0-beta.1",
          name: "beta",
          body: "",
          draft: false,
          prerelease: true,
          assets: [
            {
              name: "portdeck-macos-arm64",
              browser_download_url: "u",
              size: 1,
              content_type: "x",
            },
          ],
          tarball_url: "t",
          zipball_url: "z",
        },
        {
          tag_name: "v0.1.0-alpha",
          name: "alpha",
          body: "",
          draft: false,
          prerelease: true,
          assets: [],
          tarball_url: "t",
          zipball_url: "z",
        },
      ],
    });
    const release = await getLatestRelease("owner", "portdeck");
    expect(release?.tagName).toBe("v0.2.0-beta.1");
    expect(release?.prerelease).toBe(true);
    expect(release?.usedPrereleaseFallback).toBe(true);
  });

  it("returns null when latest 404 and only drafts exist", async () => {
    latestHandler = async () => {
      const err: any = new Error("Not Found");
      err.status = 404;
      throw err;
    };
    listHandler = async () => ({
      data: [
        {
          tag_name: "v0",
          name: "d",
          body: "",
          draft: true,
          prerelease: true,
          assets: [],
          tarball_url: "t",
          zipball_url: "z",
        },
      ],
    });
    const release = await getLatestRelease("o", "empty");
    expect(release).toBeNull();
  });
});
