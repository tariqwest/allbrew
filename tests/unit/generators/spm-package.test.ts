import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  collectSpmPackagePayload,
  parseSpmExecutableProducts,
  preferSpmBinName,
} from "../../../lib/generators/spm-package.ts";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("mocked_sha256_hash_64chars_padding_abcdef0123456789abcdef012345"),
  downloadAndHash: mock().mockResolvedValue({ sha256: "mocked_sha256_hash" }),
}));

describe("collectSpmPackagePayload", () => {
  beforeEach(() => {
    mock.restore();
  });

  const repoInfo = {
    name: "Rugby",
    fullName: "swiftyfinch/Rugby",
    description: "Cache CocoaPods for faster rebuild and indexing",
    homepage: "",
    htmlUrl: "https://github.com/swiftyfinch/Rugby",
    license: "MIT",
    defaultBranch: "main",
  };

  const release = { tagName: "v2.3.1" };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.template).toBe("spm_package");
  });

  it("derives name from repo name (lowercased)", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.name).toBe("rugby");
  });

  it("derives className from name", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.className).toBe("Rugby");
  });

  it("strips v prefix from version", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain("v2.3.1.tar.gz");
    expect(payload.urlLines).not.toContain("version");
  });

  it("uses repo description", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("Cache CocoaPods");
  });

  it("preserves fullName", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.fullName).toBe("swiftyfinch/Rugby");
  });

  it("generates urlLines with release tarball URL and sha256", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/swiftyfinch/Rugby/archive/refs/tags/v2.3.1.tar.gz",
    );
    expect(payload.urlLines).toContain("sha256");
  });

  it("generates empty urlLines when release is null", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, null);
    expect(payload.urlLines).toBe("");
  });

  it("includes binInstallPaths with .build/release path", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.binInstallPaths).toContain(".build/release/Rugby");
  });

  it("changes binInstallPaths when binName is overridden", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release, {
      binName: "rugby-cli",
    });
    expect(payload.binInstallPaths).toContain(".build/release/rugby-cli");
  });

  it("respects name override", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release, {
      name: "my-rugby",
    });
    expect(payload.name).toBe("my-rugby");
  });

  it("generates license line", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("MIT");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.serviceBlock).toBe("");
  });
});

describe("parseSpmExecutableProducts / preferSpmBinName", () => {
  const packageSwift = `
// swift-tools-version: 6.2
let package = Package(
  name: "TurboFieldfare",
  products: [
    .library(name: "TurboFieldfare", targets: ["TurboFieldfare"]),
    .executable(name: "TurboFieldfareRepack", targets: ["TurboFieldfareRepack"]),
    .executable(name: "TurboFieldfareCLI", targets: ["TurboFieldfareCLI"]),
    .executable(name: "TurboFieldfareMac", targets: ["TurboFieldfareMac"]),
    .executable(name: "TurboFieldfareDecodeService", targets: ["TurboFieldfareDecodeService"]),
    .executable(name: "TurboFieldfareServer", targets: ["TurboFieldfareServer"]),
  ],
  targets: [
    .executableTarget(name: "TurboFieldfareCLI", dependencies: ["TurboFieldfare"]),
  ]
)
`;

  it("parses executable products from Package.swift", () => {
    const bins = parseSpmExecutableProducts(packageSwift);
    expect(bins).toContain("TurboFieldfareCLI");
    expect(bins).toContain("TurboFieldfareServer");
    expect(bins).not.toContain("TurboFieldfare");
  });

  it("prefers CLI product for turbo-fieldfare", () => {
    const bins = parseSpmExecutableProducts(packageSwift);
    expect(preferSpmBinName(bins, "turbo-fieldfare", "turbo-fieldfare")).toBe(
      "TurboFieldfareCLI",
    );
  });

  it("installs all parsed executables with CLI as test bin", async () => {
    const payload = await collectSpmPackagePayload(
      {
        name: "turbo-fieldfare",
        fullName: "drumih/turbo-fieldfare",
        description: "Gemma inference",
        homepage: "",
        htmlUrl: "https://github.com/drumih/turbo-fieldfare",
        license: "Apache-2.0",
        defaultBranch: "main",
      },
      { tagName: "0.3" },
      { packageSwiftText: packageSwift, name: "turbo-fieldfare" },
    );
    expect(payload.testBinName).toBe("TurboFieldfareCLI");
    expect(payload.binInstallPaths).toContain(
      ".build/release/TurboFieldfareCLI",
    );
    expect(payload.binInstallPaths).toContain(
      ".build/release/TurboFieldfareServer",
    );
    expect(payload.serviceBlock).toBe("");
  });
});

describe("collectSpmPackagePayload — utiluti", () => {
  beforeEach(() => {
    mock.restore();
  });

  const repoInfo = {
    name: "utiluti",
    fullName: "scriptingosx/utiluti",
    description: "Query and set the default handler for URL schemes and UTIs",
    homepage: "",
    htmlUrl: "https://github.com/scriptingosx/utiluti",
    license: "MIT",
    defaultBranch: "main",
  };

  const release = { tagName: "v2.0.0" };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.template).toBe("spm_package");
  });

  it("derives name as utiluti (already lowercase)", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.name).toBe("utiluti");
  });

  it("derives className as Utiluti", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.className).toBe("Utiluti");
  });

  it("strips v prefix from version in tarball URL", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain("v2.0.0.tar.gz");
  });

  it("uses repo description", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("URL schemes");
  });

  it("sets binInstallPaths to .build/release/utiluti", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.binInstallPaths).toContain(".build/release/utiluti");
  });

  it("head-only mode produces empty urlLines", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, null);
    expect(payload.urlLines).toBe("");
  });

  it("generates license line", async () => {
    const payload = await collectSpmPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("MIT");
  });
});
