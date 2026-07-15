import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectBinaryDirectPayload } from "../../../lib/generators/binary-direct.ts";

describe("collectBinaryDirectPayload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
