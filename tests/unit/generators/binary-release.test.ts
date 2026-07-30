import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectBinaryReleasePayload } from "../../../lib/generators/binary-release.ts";
import wakapiFixture from "../../fixtures/github/wakapi.json";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("binary_sha256_mock_64chars_pad_abcdef0123456789abcdef01234567"),
  downloadAndHash: mock()
    .mockResolvedValue({ sha256: "binary_sha256_mock_64chars_pad_abcdef0123456789abcdef01234567" }),
}));

describe("collectBinaryReleasePayload", () => {
  beforeEach(() => {
    mock.restore();
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

  it("sets binName from formula name for archive assets", async () => {
    const payload = await collectBinaryReleasePayload(repoInfo, release);
    expect(payload.binName).toBe("wakapi");
    expect(payload.installBody).toBe('bin.install "wakapi"');
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

  it("detects bare platform binaries and renames install to shared bin name", async () => {
    const bareRelease = {
      tagName: "v0.4.5",
      assets: [
        {
          name: "csctf-macos-arm64",
          url: "https://example.com/csctf-macos-arm64",
        },
        {
          name: "csctf-macos-x64",
          url: "https://example.com/csctf-macos-x64",
        },
        {
          name: "csctf-linux-arm64",
          url: "https://example.com/csctf-linux-arm64",
        },
        {
          name: "csctf-linux-x64",
          url: "https://example.com/csctf-linux-x64",
        },
        {
          name: "csctf-macos-arm64.sha256",
          url: "https://example.com/csctf-macos-arm64.sha256",
        },
        { name: "sha256.txt", url: "https://example.com/sha256.txt" },
      ],
    };
    const bareRepo = {
      name: "chat_shared_conversation_to_file",
      fullName: "Dicklesworthstone/chat_shared_conversation_to_file",
      description: "CLI share-link converter",
      homepage: "https://github.com/Dicklesworthstone/chat_shared_conversation_to_file",
      htmlUrl: "https://github.com/Dicklesworthstone/chat_shared_conversation_to_file",
      license: null,
      defaultBranch: "main",
    };
    const payload = await collectBinaryReleasePayload(bareRepo, bareRelease, {
      name: "chat-shared-conversation-to-file",
    });
    expect(payload.template).toBe("binary_release");
    expect(payload.binName).toBe("csctf");
    expect(payload.testBinName).toBe("csctf");
    expect(payload.platformBlocks).toContain("on_macos do");
    expect(payload.platformBlocks).toContain("on_linux do");
    expect(payload.installBody).toContain('bin.install bin_path => "csctf"');
    expect(payload.installBody).toContain("Dir[\"*\"]");
  });

  it("respects binName override for bare binaries", async () => {
    const bareRelease = {
      tagName: "v0.4.5",
      assets: [
        {
          name: "csctf-macos-arm64",
          url: "https://example.com/csctf-macos-arm64",
        },
      ],
    };
    const bareRepo = {
      name: "chat_shared_conversation_to_file",
      fullName: "Dicklesworthstone/chat_shared_conversation_to_file",
      description: "CLI",
      homepage: "https://github.com/Dicklesworthstone/chat_shared_conversation_to_file",
      htmlUrl: "https://github.com/Dicklesworthstone/chat_shared_conversation_to_file",
      license: null,
      defaultBranch: "main",
    };
    const payload = await collectBinaryReleasePayload(bareRepo, bareRelease, {
      name: "chat-shared-conversation-to-file",
      binName: "chatctl",
    });
    expect(payload.binName).toBe("chatctl");
    expect(payload.installBody).toContain('bin.install bin_path => "chatctl"');
  });
});
