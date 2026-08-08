import { describe, it, expect } from "bun:test";
import {
  isHostCompatibleBinaryAsset,
  releaseHasHostCompatibleBinary,
} from "../../../lib/utils.ts";

describe("isHostCompatibleBinaryAsset (tdash)", () => {
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
