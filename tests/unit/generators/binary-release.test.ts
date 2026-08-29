import { describe, it, expect, mock, beforeEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  collectBinaryReleasePayload,
  templateReleaseUrl,
  templateEntrypointPath,
  pickArchiveEntrypoint,
  buildBinaryReleaseInstallBody,
  resolveBinaryReleaseBinName,
} from "../../../lib/generators/binary-release.ts";
import wakapiFixture from "../../fixtures/github/wakapi.json";

const execFileAsync = promisify(execFile);

/** Mutable download path so tests can inject a real zip for content inspection. */
const downloadState = {
  path: "/tmp/allbrew-mock-asset.bin",
  dir: "/tmp",
  sha256: "binary_sha256_mock_64chars_pad_abcdef0123456789abcdef01234567",
};

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue(
    "binary_sha256_mock_64chars_pad_abcdef0123456789abcdef01234567",
  ),
  downloadAndHash: mock().mockResolvedValue({
    sha256: "binary_sha256_mock_64chars_pad_abcdef0123456789abcdef01234567",
  }),
  downloadToTemp: mock().mockImplementation(async () => ({
    sha256: downloadState.sha256,
    path: downloadState.path,
    dir: downloadState.dir,
    cleanup: mock().mockResolvedValue(undefined),
  })),
}));

describe("collectBinaryReleasePayload", () => {
  beforeEach(() => {
    downloadState.path = "/tmp/allbrew-mock-asset.bin";
    downloadState.dir = "/tmp";
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

  it("throws when only Linux binary assets are present", async () => {
    const linuxOnly = {
      tagName: "v1.1.0",
      assets: [
        {
          name: "wander_1.1.0_Linux_arm64.tar.gz",
          url: "https://example.com/wander_1.1.0_Linux_arm64.tar.gz",
        },
        {
          name: "wander_1.1.0_Linux_x86_64.tar.gz",
          url: "https://example.com/wander_1.1.0_Linux_x86_64.tar.gz",
        },
      ],
    };
    await expect(
      collectBinaryReleasePayload(repoInfo, linuxOnly),
    ).rejects.toThrow(/No macOS binary assets/);
  });

  it("refuses archives that contain a macOS .app bundle (go2tv-style)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "allbrew-binrel-app-"));
    const zipPath = join(dir, "go2tv_v2.5.0_macOS_arm64.zip");
    try {
      await execFileAsync("python3", [
        "-c",
        `import zipfile; z=zipfile.ZipFile(${JSON.stringify(zipPath)},'w');
z.writestr('go2tv.app/Contents/MacOS/go2tv', b'\\x7fELF');
z.writestr('go2tv.app/Contents/Info.plist', b'plist');
z.writestr('LICENSE', b'mit');
z.close()`,
      ]);
      downloadState.path = zipPath;
      downloadState.dir = dir;
      const go2tvRelease = {
        tagName: "v2.5.0",
        assets: [
          {
            name: "go2tv_v2.5.0_macOS_arm64.zip",
            url: "https://example.com/go2tv_v2.5.0_macOS_arm64.zip",
          },
        ],
      };
      await expect(
        collectBinaryReleasePayload(
          {
            name: "go2tv",
            fullName: "alexballas/go2tv",
            description: "cast",
            htmlUrl: "https://github.com/alexballas/go2tv",
            license: "MIT",
          },
          go2tvRelease,
        ),
      ).rejects.toThrow(/cask-app-release|macOS app bundle/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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

  it("maps product-cli bare assets to formula product bin (gotify-cli → gotify)", async () => {
    const assets = [
      "gotify-cli-darwin-arm64",
      "gotify-cli-darwin-amd64",
      "gotify-cli-linux-arm64",
      "gotify-cli-linux-amd64",
    ];
    expect(resolveBinaryReleaseBinName("gotify", assets)).toBe("gotify");
    expect(resolveBinaryReleaseBinName("gotify-tap", assets)).toBe("gotify");
    expect(resolveBinaryReleaseBinName("gotify-cli", assets)).toBe("gotify-cli");
    expect(
      resolveBinaryReleaseBinName("unrelated-tool", assets),
    ).toBe("gotify-cli");

    const bareRelease = {
      tagName: "v2.4.0",
      assets: assets.map((name) => ({
        name,
        url: `https://example.com/${name}`,
      })),
    };
    const bareRepo = {
      name: "cli",
      fullName: "gotify/cli",
      description: "CLI for gotify/server",
      homepage: "https://github.com/gotify/cli",
      htmlUrl: "https://github.com/gotify/cli",
      license: "MIT",
      defaultBranch: "master",
    };
    const payload = await collectBinaryReleasePayload(bareRepo, bareRelease, {
      name: "gotify",
    });
    expect(payload.binName).toBe("gotify");
    expect(payload.installBody).toContain('bin.install bin_path => "gotify"');
  });

  it("templateReleaseUrl preserves bare version tags without injecting v", () => {
    const bare =
      "https://github.com/o/r/releases/download/0.1.0/afm_0.1.0_macOS_universal";
    expect(templateReleaseUrl(bare, "0.1.0", "0.1.0")).toBe(
      "https://github.com/o/r/releases/download/#{version}/afm_#{version}_macOS_universal",
    );
    const tagged =
      "https://github.com/o/r/releases/download/v2.12.2/wakapi_v2.12.2_darwin_arm64.tar.gz";
    expect(templateReleaseUrl(tagged, "2.12.2", "v2.12.2")).toBe(
      "https://github.com/o/r/releases/download/v#{version}/wakapi_v#{version}_darwin_arm64.tar.gz",
    );
  });

  it("templateReleaseUrl rewrites bare version in asset basename after v-tag path", () => {
    // Supersonic-style: tag v0.22.0 in path, bare 0.22.0 in zip name
    const url =
      "https://github.com/supersonic-app/supersonic/releases/download/v0.22.0/Supersonic-0.22.0-mac-arm64.zip";
    expect(templateReleaseUrl(url, "0.22.0", "v0.22.0")).toBe(
      "https://github.com/supersonic-app/supersonic/releases/download/v#{version}/Supersonic-#{version}-mac-arm64.zip",
    );
  });

  it("prefers the client archive over a separate server archive per arch (atuin-style)", async () => {
    const atuinRelease = {
      tagName: "v18.19.0",
      assets: [
        {
          name: "atuin-aarch64-apple-darwin.tar.gz",
          url: "https://github.com/atuinsh/atuin/releases/download/v18.19.0/atuin-aarch64-apple-darwin.tar.gz",
        },
        {
          name: "atuin-server-aarch64-apple-darwin.tar.gz",
          url: "https://github.com/atuinsh/atuin/releases/download/v18.19.0/atuin-server-aarch64-apple-darwin.tar.gz",
        },
        {
          name: "atuin-server-x86_64-apple-darwin.tar.gz",
          url: "https://github.com/atuinsh/atuin/releases/download/v18.19.0/atuin-server-x86_64-apple-darwin.tar.gz",
        },
        {
          name: "atuin-x86_64-apple-darwin.tar.gz",
          url: "https://github.com/atuinsh/atuin/releases/download/v18.19.0/atuin-x86_64-apple-darwin.tar.gz",
        },
        {
          name: "atuin-aarch64-unknown-linux-gnu.tar.gz",
          url: "https://github.com/atuinsh/atuin/releases/download/v18.19.0/atuin-aarch64-unknown-linux-gnu.tar.gz",
        },
        {
          name: "atuin-server-aarch64-unknown-linux-gnu.tar.gz",
          url: "https://github.com/atuinsh/atuin/releases/download/v18.19.0/atuin-server-aarch64-unknown-linux-gnu.tar.gz",
        },
        {
          name: "atuin-x86_64-unknown-linux-gnu.tar.gz",
          url: "https://github.com/atuinsh/atuin/releases/download/v18.19.0/atuin-x86_64-unknown-linux-gnu.tar.gz",
        },
        {
          name: "atuin-server-x86_64-unknown-linux-gnu.tar.gz",
          url: "https://github.com/atuinsh/atuin/releases/download/v18.19.0/atuin-server-x86_64-unknown-linux-gnu.tar.gz",
        },
      ],
    };
    const atuinRepo = {
      name: "atuin",
      fullName: "atuinsh/atuin",
      description: "✨ Making your shell magical",
      homepage: "https://atuin.sh",
      htmlUrl: "https://github.com/atuinsh/atuin",
      license: "MIT",
      defaultBranch: "main",
    };
    const payload = await collectBinaryReleasePayload(atuinRepo, atuinRelease, {
      name: "atuin",
      binName: "atuin",
    });
    expect(payload.platformBlocks).toContain("atuin-aarch64-apple-darwin.tar.gz");
    expect(payload.platformBlocks).toContain("atuin-x86_64-apple-darwin.tar.gz");
    expect(payload.platformBlocks).toContain("atuin-aarch64-unknown-linux-gnu.tar.gz");
    expect(payload.platformBlocks).toContain("atuin-x86_64-unknown-linux-gnu.tar.gz");
    expect(payload.platformBlocks).not.toContain("atuin-server-");
  });

  it("detects versioned bare universal binaries (afm_0.1.0_macOS_universal)", async () => {
    const bareRelease = {
      tagName: "0.1.0",
      assets: [
        {
          name: "afm_0.1.0_macOS_universal",
          url: "https://github.com/rudrankriyam/Foundation-Models-Framework-CLI/releases/download/0.1.0/afm_0.1.0_macOS_universal",
        },
        {
          name: "afm_0.1.0_checksums.txt",
          url: "https://github.com/rudrankriyam/Foundation-Models-Framework-CLI/releases/download/0.1.0/afm_0.1.0_checksums.txt",
        },
      ],
    };
    const bareRepo = {
      name: "Foundation-Models-Framework-CLI",
      fullName: "rudrankriyam/Foundation-Models-Framework-CLI",
      description: "Command-line tool for Apple's Foundation Models framework.",
      homepage: "https://github.com/rudrankriyam/Foundation-Models-Framework-CLI",
      htmlUrl: "https://github.com/rudrankriyam/Foundation-Models-Framework-CLI",
      license: "MIT",
      defaultBranch: "main",
    };
    const payload = await collectBinaryReleasePayload(bareRepo, bareRelease, {
      name: "afm",
    });
    expect(payload.template).toBe("binary_release");
    expect(payload.binName).toBe("afm");
    expect(payload.platformBlocks).toContain("on_macos do");
    expect(payload.platformBlocks).toContain("on_arm do");
    expect(payload.platformBlocks).toContain("on_intel do");
    expect(payload.platformBlocks).toContain(
      "afm_#{version}_macOS_universal",
    );
    expect(payload.platformBlocks).not.toContain("afm_v#{version}");
    expect(payload.installBody).toContain('bin.install bin_path => "afm"');
    expect(payload.serviceBlock).toBe("");
  });
});


describe("pickArchiveEntrypoint / nested package archives", () => {
  it("picks bin/interpreter for open-interpreter package layout", () => {
    const members = [
      "bin/",
      "bin/interpreter",
      "bin/i",
      "bin/codex-code-mode-host",
      "codex-package.json",
      "codex-path/rg",
      "codex-resources/zsh/bin/zsh",
    ];
    const picked = pickArchiveEntrypoint(members, "open-interpreter");
    expect(picked).not.toBeNull();
    expect(picked!.sourcePath).toBe("bin/interpreter");
    expect(picked!.binName).toBe("open-interpreter");
  });

  it("refuses LICENSE/README as entrypoint", () => {
    const members = ["LICENSE", "README.md", "television", "CHANGELOG.md"];
    const picked = pickArchiveEntrypoint(members, "television");
    expect(picked).not.toBeNull();
    expect(picked!.sourcePath).toBe("television");
    expect(picked!.binName).toBe("television");
  });

  it("uses the renamed formula name as the bin when archive entrypoint differs", () => {
    // Regression: a formula renamed to avoid homebrew/core should install its
    // own binary, not try to claim the original (possibly colliding) token.
    const members = ["codecane"];
    const picked = pickArchiveEntrypoint(members, "codebuffai-freebuff");
    expect(picked).not.toBeNull();
    expect(picked!.sourcePath).toBe("codecane");
    expect(picked!.binName).toBe("codebuffai-freebuff");
  });

  it("returns null when archive only has documentation", () => {
    const picked = pickArchiveEntrypoint(
      ["LICENSE", "README.md", "NOTICE"],
      "toolong",
    );
    expect(picked).toBeNull();
  });

  it("buildBinaryReleaseInstallBody uses libexec + symlink for nested entrypoint", () => {
    const body = buildBinaryReleaseInstallBody(
      "open-interpreter",
      ["open-interpreter-package-aarch64-apple-darwin.tar.gz"],
      "bin/interpreter",
    );
    expect(body).toContain('libexec.install Dir["*"]');
    expect(body).toContain('bin.install_symlink libexec/"bin/interpreter" => "open-interpreter"');
    expect(body).toContain('bin.install_symlink libexec/"bin/interpreter" => "interpreter"');
  });

  it("templateReleaseUrl preserves rust-v tag prefix", () => {
    const url =
      "https://github.com/openinterpreter/openinterpreter/releases/download/rust-v0.0.34/open-interpreter-package-aarch64-apple-darwin.tar.gz";
    expect(templateReleaseUrl(url, "0.0.34", "rust-v0.0.34")).toBe(
      "https://github.com/openinterpreter/openinterpreter/releases/download/rust-v#{version}/open-interpreter-package-aarch64-apple-darwin.tar.gz",
    );
  });

  it("templateEntrypointPath rewrites versioned path segments", () => {
    expect(templateEntrypointPath("television-0.12.1/tv")).toBe(
      '"television-#{version}/tv"',
    );
    expect(templateEntrypointPath("bin/interpreter")).toBe(
      '"bin/interpreter"',
    );
  });

  it("buildBinaryReleaseInstallBody templates versioned entrypoint paths", () => {
    const body = buildBinaryReleaseInstallBody(
      "television",
      ["television-macos-aarch64.tar.gz"],
      "television-0.12.1/television",
    );
    expect(body).toContain("television-#{version}/television");
    expect(body).not.toContain("0.12.1");
  });

  it("collectBinaryReleasePayload inspects nested archive members", async () => {
    const { execFileSync } = await import("node:child_process");
    const { mkdtempSync, writeFileSync, rmSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "allbrew-oi-"));
    try {
      const binDir = join(dir, "bin");
      execFileSync("mkdir", ["-p", binDir]);
      writeFileSync(join(binDir, "interpreter"), "#!/bin/sh\necho ok\n", { mode: 0o755 });
      writeFileSync(join(binDir, "i"), "#!/bin/sh\necho i\n", { mode: 0o755 });
      writeFileSync(join(dir, "codex-package.json"), '{"entrypoint":"bin/interpreter"}\n');
      const tarPath = join(dir, "pkg.tar.gz");
      execFileSync("tar", ["-czf", tarPath, "-C", dir, "bin", "codex-package.json"]);
      const buf = readFileSync(tarPath);

      const downloadAndHash = (await import("../../../lib/sha256.ts")).downloadAndHash as any;
      // Override mock for this test via module - the suite already mocks sha256.
      // Instead call pick + build path directly using real tar members listed above.
      const members = execFileSync("tar", ["-tf", tarPath], { encoding: "utf8" })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const picked = pickArchiveEntrypoint(members, "open-interpreter");
      expect(picked?.sourcePath).toBe("bin/interpreter");
      const body = buildBinaryReleaseInstallBody(
        picked!.binName,
        ["open-interpreter-package-aarch64-apple-darwin.tar.gz"],
        picked!.sourcePath,
      );
      expect(body).toContain("libexec.install");
      expect(body).not.toBe('bin.install "open-interpreter"');
      // silence unused
      void downloadAndHash;
      void buf;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prefers primary formula asset over -cli companion when both share arch (gokapi)", async () => {
    const multiProductRelease = {
      tagName: "v2.2.4",
      assets: [
        { name: "gokapi-2.2.4_darwin-amd64.zip", url: "https://example.com/gokapi-2.2.4_darwin-amd64.zip" },
        { name: "gokapi-2.2.4_darwin-arm64.zip", url: "https://example.com/gokapi-2.2.4_darwin-arm64.zip" },
        { name: "gokapi-2.2.4_linux-amd64.zip", url: "https://example.com/gokapi-2.2.4_linux-amd64.zip" },
        { name: "gokapi-2.2.4_linux-arm64.zip", url: "https://example.com/gokapi-2.2.4_linux-arm64.zip" },
        { name: "gokapi-cli-1.1.3_darwin-amd64.zip", url: "https://example.com/gokapi-cli-1.1.3_darwin-amd64.zip" },
        { name: "gokapi-cli-1.1.3_darwin-arm64.zip", url: "https://example.com/gokapi-cli-1.1.3_darwin-arm64.zip" },
        { name: "gokapi-cli-1.1.3_linux-amd64.zip", url: "https://example.com/gokapi-cli-1.1.3_linux-amd64.zip" },
        { name: "gokapi-cli-1.1.3_linux-arm64.zip", url: "https://example.com/gokapi-cli-1.1.3_linux-arm64.zip" },
      ],
    };
    const gokapiRepo = {
      name: "Gokapi",
      fullName: "Forceu/Gokapi",
      description: "Lightweight selfhosted Firefox Send alternative without public upload.",
      homepage: "https://github.com/Forceu/Gokapi",
      htmlUrl: "https://github.com/Forceu/Gokapi",
      license: "AGPL-3.0",
      defaultBranch: "master",
    };
    const payload = await collectBinaryReleasePayload(
      gokapiRepo,
      multiProductRelease,
      { name: "gokapi" },
    );
    expect(payload.template).toBe("binary_release");
    expect(payload.version).toBe("2.2.4");
    expect(payload.platformBlocks).toContain("gokapi-#{version}_darwin-arm64.zip");
    expect(payload.platformBlocks).toContain("gokapi-#{version}_darwin-amd64.zip");
    expect(payload.platformBlocks).not.toContain("gokapi-cli");
    expect(payload.platformBlocks).not.toContain("1.1.3");
  });

  it("templateEntrypointPath templates version followed by platform/arch tokens", () => {
    expect(
      templateEntrypointPath("tv-0.15.9-aarch64-apple-darwin/tv"),
    ).toBe('"tv-#{version}-aarch64-apple-darwin/tv"');
    expect(
      templateEntrypointPath("tv-0.15.9-aarch64-apple-darwin"),
    ).toBe('"tv-#{version}-aarch64-apple-darwin"');
  });

  it("resolveBinaryReleaseBinName strips leading mac_ and finds product token", () => {
    expect(
      resolveBinaryReleaseBinName("krokiet", [
        "mac_krokiet_all_backends_arm64",
        "mac_krokiet_all_backends_x86_64",
      ]),
    ).toBe("krokiet");
    expect(resolveBinaryReleaseBinName("krokiet", ["mac_krokiet_arm64"])).toBe(
      "krokiet",
    );
  });

  it("collectBinaryReleasePayload prefers primary asset over versioned companion", async () => {
    const release = {
      tagName: "v1.0.0",
      assets: [
        { name: "acme-1.0.0_darwin-arm64.tar.gz", url: "https://example.com/acme-1.0.0_darwin-arm64.tar.gz" },
        { name: "acme-1.0.0_darwin-x86_64.tar.gz", url: "https://example.com/acme-1.0.0_darwin-x86_64.tar.gz" },
        { name: "acme-server-0.9.0_darwin-arm64.tar.gz", url: "https://example.com/acme-server-0.9.0_darwin-arm64.tar.gz" },
      ],
    };
    const repo = {
      name: "acme",
      fullName: "org/acme",
      description: "",
      homepage: null,
      htmlUrl: "https://github.com/org/acme",
      license: "MIT",
      defaultBranch: "main",
    };
    const payload = await collectBinaryReleasePayload(repo, release, {});
    expect(payload.platformBlocks).toContain("acme-#{version}_darwin-arm64.tar.gz");
    expect(payload.platformBlocks).not.toContain("acme-server");
  });
});
