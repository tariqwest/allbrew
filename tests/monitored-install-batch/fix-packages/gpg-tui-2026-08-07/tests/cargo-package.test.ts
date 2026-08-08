import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectCargoPackagePayload, inferCargoBrewDependencies } from "../../../lib/generators/cargo-package.ts";
import managarrFixture from "../../fixtures/github/managarr.json";
import wanderFixture from "../../fixtures/github/wander.json";
import aichatFixture from "../../fixtures/github/aichat.json";

mock.module("../../../lib/github.ts", () => ({
  getFileContent: mock().mockResolvedValue(null),
  getReadme: mock().mockResolvedValue(null),
}));

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("cargo_mocked_sha256_64chars_padding_abcdef0123456789abcdef0123"),
  downloadAndHash: mock().mockResolvedValue({ sha256: "mocked_sha256" }),
}));

describe("collectCargoPackagePayload", () => {
  beforeEach(() => {
    mock.restore();
  });

  const repoInfo = managarrFixture.repo;
  const release = managarrFixture.release;

  it("returns payload with correct template identifier", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.template).toBe("cargo_package");
  });

  it("derives name from repo name", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.name).toBe("managarr");
    expect(payload.className).toBe("Managarr");
  });

  it("uses repo description", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("Servarr");
  });

  it("uses repo homepage or htmlUrl", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.homepage).toContain("github.com/Dark-Viper/managarr");
  });

  it("generates source archive URL from release tag", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/Dark-Viper/managarr/archive/refs/tags/v0.5.0.tar.gz",
    );
  });

  it("computes SHA256 for source archive", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain("sha256");
  });

  it("generates license line", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates crates.io livecheck block", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.livecheckBlock).toContain("crates.io/api/v1/crates/managarr");
  });

  it("uses crateName from options when provided", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release, {
      crateName: "managarr-cli",
    });
    expect(payload.livecheckBlock).toContain("managarr-cli");
  });

  it("includes head reference to default branch", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.defaultBranch).toBe("main");
    expect(payload.fullName).toBe("Dark-Viper/managarr");
  });

  it("handles null release (no urlLines)", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, null);
    expect(payload.urlLines).toBe("");
  });

  it("respects name override", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release, {
      name: "custom-managarr",
    });
    expect(payload.name).toBe("custom-managarr");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.serviceBlock).toBe("");
  });
});

describe("collectCargoPackagePayload — wander", () => {
  beforeEach(() => {
    mock.restore();
  });

  const repoInfo = wanderFixture.repo;
  const release = wanderFixture.release;

  it("returns payload with correct template identifier", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.template).toBe("cargo_package");
  });

  it("derives name from repo name", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.name).toBe("wander");
    expect(payload.className).toBe("Wander");
  });

  it("uses repo description", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("Nomad");
  });

  it("uses htmlUrl as homepage when homepage is empty", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.homepage).toContain("github.com/robinovitch61/wander");
  });

  it("generates source archive URL from release tag", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/robinovitch61/wander/archive/refs/tags/v0.22.0.tar.gz",
    );
  });

  it("generates MIT license line", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates crates.io livecheck block", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.livecheckBlock).toContain("crates.io/api/v1/crates/wander");
  });

  it("includes head reference to default branch", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.defaultBranch).toBe("main");
    expect(payload.fullName).toBe("robinovitch61/wander");
  });
});

describe("collectCargoPackagePayload — aichat", () => {
  beforeEach(() => {
    mock.restore();
  });

  const repoInfo = aichatFixture.repo;
  const release = aichatFixture.release;

  it("returns payload with correct template identifier", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.template).toBe("cargo_package");
  });

  it("derives name and class from repo name", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.name).toBe("aichat");
    expect(payload.className).toBe("Aichat");
  });

  it("uses repo description", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("LLM");
  });

  it("uses repo homepage", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.homepage).toContain("github.com/sigoden/aichat");
  });

  it("generates source archive URL from release tag", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/sigoden/aichat/archive/refs/tags/v0.30.0.tar.gz",
    );
  });

  it("computes SHA256 for source archive", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain("sha256");
  });

  it("includes Apache-2.0 license line", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("Apache-2.0");
  });

  it("generates crates.io livecheck block", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.livecheckBlock).toContain("crates.io/api/v1/crates/aichat");
  });

  it("includes head reference to default branch", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.defaultBranch).toBe("main");
    expect(payload.fullName).toBe("sigoden/aichat");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.serviceBlock).toBe("");
  });
});


describe("inferCargoBrewDependencies", () => {
  it("maps gpgme crate to gpgme/gnupg/libgpg-error/pkgconf", () => {
    const toml = `[package]
name = "gpg-tui"
[dependencies]
gpgme = "0.11.0"
arboard = { version = "3.6.1", features = ["wayland-data-control"] }
`;
    const lines = inferCargoBrewDependencies(toml);
    const joined = lines.join("");
    expect(joined).toContain('depends_on "gpgme"');
    expect(joined).toContain('depends_on "gnupg"');
    expect(joined).toContain('depends_on "libgpg-error"');
    expect(joined).toContain('depends_on "pkgconf" => :build');
    expect(joined).toContain('depends_on "libxcb"');
  });

  it("returns empty for pure rust crate", () => {
    const toml = `[dependencies]
serde = "1.0"
clap = "4.0"
`;
    expect(inferCargoBrewDependencies(toml)).toEqual([]);
  });
});

describe("collectCargoPackagePayload native deps", () => {
  beforeEach(() => {
    mock.restore();
  });

  it("accepts cargoToml option without network", async () => {
    const repoInfo = {
      name: "gpg-tui",
      fullName: "orhun/gpg-tui",
      description: "TUI",
      homepage: "https://github.com/orhun/gpg-tui",
      htmlUrl: "https://github.com/orhun/gpg-tui",
      defaultBranch: "master",
      license: "MIT",
    };
    const payload = await collectCargoPackagePayload(repoInfo, null, {
      cargoToml: `[dependencies]
gpgme = "0.11.0"
`,
    });
    expect(payload.dependenciesLines).toContain('depends_on "gpgme"');
  });
});
