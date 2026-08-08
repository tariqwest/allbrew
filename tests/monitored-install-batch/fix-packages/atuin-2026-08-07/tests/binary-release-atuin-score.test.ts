import { describe, it, expect } from "bun:test";
import {
  scoreBinaryReleaseAsset,
  pickArchiveEntrypoint,
  buildBinaryReleaseInstallBody,
} from "../../../lib/generators/binary-release.ts";

describe("scoreBinaryReleaseAsset (atuin multi-product releases)", () => {
  const hints = ["atuin", "atuin-tap"];

  it("prefers primary CLI over atuin-server companion", () => {
    const client = scoreBinaryReleaseAsset(
      "atuin-aarch64-apple-darwin.tar.gz",
      hints,
    );
    const server = scoreBinaryReleaseAsset(
      "atuin-server-aarch64-apple-darwin.tar.gz",
      hints,
    );
    expect(client).toBeGreaterThan(server);
  });

  it("prefers client on intel linux assets too", () => {
    const client = scoreBinaryReleaseAsset(
      "atuin-x86_64-unknown-linux-musl.tar.gz",
      hints,
    );
    const server = scoreBinaryReleaseAsset(
      "atuin-server-x86_64-unknown-linux-musl.tar.gz",
      hints,
    );
    expect(client).toBeGreaterThan(server);
  });
});

describe("pickArchiveEntrypoint atuin-tap name collision", () => {
  it("selects atuin binary not atuin-server when formula is atuin-tap", () => {
    const members = [
      "atuin-aarch64-apple-darwin/",
      "atuin-aarch64-apple-darwin/atuin",
      "atuin-aarch64-apple-darwin/README.md",
    ];
    const picked = pickArchiveEntrypoint(members, "atuin-tap", {});
    expect(picked?.binName).toBe("atuin-tap");
    expect(picked?.sourcePath).toContain("atuin");
    expect(picked?.sourcePath).not.toContain("server");
  });
});

describe("buildBinaryReleaseInstallBody arch-specific wrapper", () => {
  it("finds binary by basename under arch-prefixed directory", () => {
    const body = buildBinaryReleaseInstallBody(
      "atuin",
      ["atuin-aarch64-apple-darwin.tar.gz"],
      "atuin-aarch64-apple-darwin/atuin",
    );
    expect(body).toContain('Dir[libexec/"**/atuin"]');
    expect(body).not.toContain("atuin-aarch64-apple-darwin/atuin");
  });
});
