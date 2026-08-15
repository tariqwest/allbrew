import { describe, it, expect, mock } from "bun:test";
import { collectCaskAppPayload } from "../../../lib/generators/cask-app.ts";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("cask_sha256_64chars_padding_abcdef0123456789abcdef0123456789ab"),
  downloadAndHash: mock()
    .mockResolvedValue({ sha256: "cask_sha256_64chars_padding_abcdef0123456789abcdef0123456789ab" }),
  downloadToTemp: mock().mockResolvedValue({
    path: "/tmp/mock.dmg",
    sha256: "cask_sha256_64chars_padding_abcdef0123456789abcdef0123456789ab",
    cleanup: mock(),
    finalUrl: "https://cdn.example.com/external/Xirp-0.14.0-arm64-external.dmg",
    serverFilename: null,
  }),
}));

mock.module("../../../lib/archive-inspector.ts", () => ({
  listZipEntries: mock().mockResolvedValue([]),
  listDmgAppNames: mock().mockResolvedValue(["Xirp.app"]),
}));

describe("collectCaskAppPayload finalUrl version extraction", () => {
  it("extracts version from the redirect final URL when the input URL has none", async () => {
    const payload = await collectCaskAppPayload(
      "https://xirp.spotify.com/api/latest-download?arch=arm64",
      { name: "xirp" },
    );
    expect(payload.versionLine).toContain("0.14.0");
    expect(payload.appOrPkgBlock).toContain("Xirp.app");
  });
});
