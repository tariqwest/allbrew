import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectBinaryReleasePayload } from "../../../lib/generators/binary-release.ts";
import wakapiFixture from "../../fixtures/github/wakapi.json";

vi.mock("../../../lib/sha256.ts", () => ({
  hashUrl: vi.fn().mockResolvedValue("binary_sha256_mock_64chars_pad_abcdef0123456789abcdef01234567"),
  downloadAndHash: vi
    .fn()
    .mockResolvedValue({ sha256: "binary_sha256_mock_64chars_pad_abcdef0123456789abcdef01234567" }),
}));

describe("collectBinaryReleasePayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const repoInfo = wakapiFixture.repo;
  const release = wakapiFixture.release;

  it("returns payload with correct template identifier", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.template).toBe("binary_release");
  });

  it("derives name from repo name", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.name).toBe("wakapi");
    expect(payload.className).toBe("Wakapi");
  });

  it("extracts version from tag (strips v prefix)", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.version).toBe("2.12.2");
  });

  it("uses repo description", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.desc).toContain("WakaTime");
  });

  it("generates platform blocks for detected architectures", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.platformBlocks).toContain("on_macos do");
    expect(payload.platformBlocks).toContain("on_arm do");
    // wakapi has darwin_arm64 and darwin_amd64
    expect(payload.platformBlocks).toContain("on_intel do");
  });

  it("templates version into platform block URLs", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.platformBlocks).toContain("#{version}");
  });

  it("includes linux blocks when linux assets exist", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.platformBlocks).toContain("on_linux do");
  });

  it("includes license line", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("MIT");
  });

  it("sets binName from formula name", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.binName).toBe("wakapi");
  });

  it("respects name override", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release, {
      name: "my-wakapi",
    });
    expect(payload.name).toBe("my-wakapi");
    expect(payload.binName).toBe("my-wakapi");
  });

  it("throws when no platform-specific assets found", async () => {
    const noAssets = { ...release, assets: [{ name: "README.md", url: "..." }] };
    await expect(
      collectBinaryReleasePayload(repoInfo, noAssets),
    ).rejects.toThrow("No platform-specific binary assets");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.serviceBlock).toBe("");
  });
});
