import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectBinaryDirectPayload, buildInstallBody, detectHomebrewStagePrefix } from "../../../lib/generators/binary-direct.ts";

describe("collectBinaryDirectPayload", () => {
  beforeEach(() => {
    mock.restore();
  });

  const archiveInfo = {
    downloadUrl: "https://example.com/tool-1.2.3.tar.gz",
    sha256: "rawbin_sha256_64chars_pad_abcdef0123456789abcdef0123456789abcdef01",
    binaries: ["tool"],
    extras: {},
  };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectBinaryDirectPayload(archiveInfo);
    expect(payload.template).toBe("binary_direct");
  });

  it("derives name from download URL filename", async () => {
    const payload = await collectBinaryDirectPayload(archiveInfo);
    expect(payload.name).toBe("tool");
  });

  it("uses download URL as homepage", async () => {
    const payload = await collectBinaryDirectPayload(archiveInfo);
    expect(payload.homepage).toContain("example.com/tool-1.2.3.tar.gz");
  });

  it("uses provided SHA256", async () => {
    const payload = await collectBinaryDirectPayload(archiveInfo);
    expect(payload.sha256).toContain("rawbin_sha256");
  });

  it("generates install body with bin.install", async () => {
    const payload = await collectBinaryDirectPayload(archiveInfo);
    expect(payload.installBody).toContain('bin.install "tool"');
  });

  it("uses first binary as testBinName", async () => {
    const payload = await collectBinaryDirectPayload(archiveInfo);
    expect(payload.testBinName).toBe("tool");
  });

  it("handles multiple binaries", async () => {
    const multi = { ...archiveInfo, binaries: ["foo", "bar", "baz"] };
    const payload = await collectBinaryDirectPayload(multi);
    expect(payload.installBody).toContain("foo");
    expect(payload.installBody).toContain("bar");
    expect(payload.installBody).toContain("baz");
  });

  it("handles binaries with path prefixes", async () => {
    const withPath = { ...archiveInfo, binaries: ["bin/mytool"] };
    const payload = await collectBinaryDirectPayload(withPath);
    expect(payload.testBinName).toBe("mytool");
  });

  it("respects name override", async () => {
    const payload = await collectBinaryDirectPayload(archiveInfo, null, {
      name: "custom-tool",
    });
    expect(payload.name).toBe("custom-tool");
  });

  it("respects selectedBinaries override", async () => {
    const payload = await collectBinaryDirectPayload(archiveInfo, ["othertool"]);
    expect(payload.installBody).toContain("othertool");
  });

  it("throws when no binaries found", async () => {
    const noBins = { ...archiveInfo, binaries: [] };
    await expect(collectBinaryDirectPayload(noBins)).rejects.toThrow(
      "No binary executables found",
    );
  });

  it("generates livecheck block", async () => {
    const payload = await collectBinaryDirectPayload(archiveInfo);
    expect(payload.livecheckBlock).toContain("livecheck do");
  });

  it("omits allbrew dependency", async () => {
    const payload = await collectBinaryDirectPayload(archiveInfo);
    expect(payload.allbrewDependency).toBe("");
  });

  it("strips versioned top-level archive dir for Homebrew stage (gitu)", async () => {
    const gitu = {
      ...archiveInfo,
      downloadUrl:
        "https://github.com/altsem/gitu/releases/download/v0.43.0/gitu-v0.43.0-aarch64-apple-darwin.zip",
      binaries: ["gitu-v0.43.0-aarch64-apple-darwin/gitu"],
      extras: {
        licenses: ["gitu-v0.43.0-aarch64-apple-darwin/LICENSE"],
      },
    };
    const payload = await collectBinaryDirectPayload(gitu);
    expect(payload.installBody).toContain('bin.install "gitu"');
    expect(payload.installBody).not.toContain("gitu-v0.43.0-aarch64-apple-darwin/");
    expect(payload.installBody).toContain('share.install "LICENSE"');
    expect(payload.testBinName).toBe("gitu");
  });

  it("keeps bin/ prefix when top-level is FHS bin", async () => {
    const withPath = { ...archiveInfo, binaries: ["bin/mytool"] };
    const payload = await collectBinaryDirectPayload(withPath);
    expect(payload.installBody).toContain('bin.install "bin/mytool" => "mytool"');
    expect(payload.testBinName).toBe("mytool");
  });
});

describe("detectHomebrewStagePrefix", () => {
  it("returns versioned wrapper prefix", () => {
    expect(
      detectHomebrewStagePrefix([
        "gitu-v0.43.0-aarch64-apple-darwin/gitu",
        "gitu-v0.43.0-aarch64-apple-darwin/LICENSE",
      ]),
    ).toBe("gitu-v0.43.0-aarch64-apple-darwin/");
  });

  it("returns null for flat paths", () => {
    expect(detectHomebrewStagePrefix(["tool", "LICENSE"])).toBeNull();
  });

  it("returns null for FHS bin top-level", () => {
    expect(detectHomebrewStagePrefix(["bin/mytool"])).toBeNull();
  });
});

describe("buildInstallBody", () => {
  it("strips common non-FHS wrapper from bins and licenses", () => {
    const body = buildInstallBody(
      ["pkg-1.0.0-darwin/bin/app"],
      { licenses: ["pkg-1.0.0-darwin/LICENSE"] },
    );
    expect(body).toContain('bin.install "bin/app" => "app"');
    expect(body).toContain('share.install "LICENSE"');
    expect(body).not.toContain("pkg-1.0.0-darwin/");
  });
});
