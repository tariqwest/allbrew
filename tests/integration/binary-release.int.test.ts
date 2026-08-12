import { describe, it, expect } from "bun:test";
import { collectBinaryReleasePayload } from "../../lib/generators/binary-release.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: downloads real GitHub release binaries, validates SHA + Ruby output.
 * Run: bun run test:int
 */

const starshipRepoInfo = {
  name: "starship",
  fullName: "starship/starship",
  description: "The minimal, blazing-fast, and infinitely customizable prompt",
  homepage: "https://starship.rs",
  htmlUrl: "https://github.com/starship/starship",
  license: "ISC",
  defaultBranch: "master",
};

const starshipRelease = {
  tagName: "v1.19.0",
  assets: [
    {
      name: "starship-aarch64-apple-darwin.tar.gz",
      url: "https://github.com/starship/starship/releases/download/v1.19.0/starship-aarch64-apple-darwin.tar.gz",
    },
    {
      name: "starship-x86_64-apple-darwin.tar.gz",
      url: "https://github.com/starship/starship/releases/download/v1.19.0/starship-x86_64-apple-darwin.tar.gz",
    },
  ],
};

describe.concurrent("binary-release integration", () => {
  it("starship: payload fields are well-formed", async () => {
    const payload = await collectBinaryReleasePayload(
      starshipRepoInfo,
      starshipRelease,
    );
    expect(payload.template).toBe("binary_release");
    expect(payload.name).toBe("starship");
    expect(payload.className).toBe("Starship");
    expect(payload.version).toBe("1.19.0");
    expect(payload.platformBlocks).toContain("on_macos do");
  });

  it("starship: generates structurally valid Ruby formula", async () => {
    const payload = await collectBinaryReleasePayload(
      starshipRepoInfo,
      starshipRelease,
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Starship < Formula");
    expect(ruby).toContain("on_macos do");
    expect(ruby).toContain("on_arm do");
    expect(ruby).toContain("sha256");
  });

  it("starship: platform blocks reference version interpolation", async () => {
    const payload = await collectBinaryReleasePayload(
      starshipRepoInfo,
      starshipRelease,
    );
    expect(payload.platformBlocks).toContain("#{version}");
  });
});

const csctfRepoInfo = {
  name: "chat_shared_conversation_to_file",
  fullName: "Dicklesworthstone/chat_shared_conversation_to_file",
  description: "CLI tool that converts public share links into Markdown and HTML",
  homepage: "https://github.com/Dicklesworthstone/chat_shared_conversation_to_file",
  htmlUrl: "https://github.com/Dicklesworthstone/chat_shared_conversation_to_file",
  license: null,
  defaultBranch: "main",
};

const csctfRelease = {
  tagName: "v0.4.5",
  assets: [
    {
      name: "csctf-macos-arm64",
      url: "https://github.com/Dicklesworthstone/chat_shared_conversation_to_file/releases/download/v0.4.5/csctf-macos-arm64",
    },
    {
      name: "csctf-macos-x64",
      url: "https://github.com/Dicklesworthstone/chat_shared_conversation_to_file/releases/download/v0.4.5/csctf-macos-x64",
    },
    {
      name: "csctf-linux-arm64",
      url: "https://github.com/Dicklesworthstone/chat_shared_conversation_to_file/releases/download/v0.4.5/csctf-linux-arm64",
    },
    {
      name: "csctf-linux-x64",
      url: "https://github.com/Dicklesworthstone/chat_shared_conversation_to_file/releases/download/v0.4.5/csctf-linux-x64",
    },
  ],
};

describe.concurrent("binary-release bare binaries integration", () => {
  it("csctf: detects bare assets and renames bin to csctf", async () => {
    const payload = await collectBinaryReleasePayload(
      csctfRepoInfo,
      csctfRelease,
      { name: "chat-shared-conversation-to-file" },
    );
    expect(payload.template).toBe("binary_release");
    expect(payload.binName).toBe("csctf");
    expect(payload.installBody).toContain('bin.install bin_path => "csctf"');
    expect(payload.platformBlocks).toContain("on_macos do");
    expect(payload.platformBlocks).toContain("#{version}");
  }, 120_000);

  it("csctf: generates structurally valid Ruby formula", async () => {
    const payload = await collectBinaryReleasePayload(
      csctfRepoInfo,
      csctfRelease,
      { name: "chat-shared-conversation-to-file", binName: "csctf" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class ChatSharedConversationToFile < Formula");
    expect(ruby).toContain('bin.install bin_path => "csctf"');
  }, 120_000);
});
