import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectCargoPackagePayload } from "../../../lib/generators/cargo-package.ts";
import managarrFixture from "../../fixtures/github/managarr.json";
import wanderFixture from "../../fixtures/github/wander.json";
import aichatFixture from "../../fixtures/github/aichat.json";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("cargo_mocked_sha256_64chars_padding_abcdef0123456789abcdef0123"),
  downloadAndHash: mock().mockResolvedValue({ sha256: "mocked_sha256" }),
}));

mock.module("../../../lib/github.ts", () => ({
  getFileContent: mock().mockResolvedValue(null),
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

  it("uses github_latest livecheck for GitHub-sourced cargo formulas", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.livecheckBlock).toContain("strategy :github_latest");
  });

  it("uses crateName from options when provided", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release, {
      crateName: "managarr-cli",
    });
    expect(payload.name).toBe("managarr-cli");
  });

  it("defaults cargoInstallArgs to *std_cargo_args", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.cargoInstallArgs).toBe("*std_cargo_args");
    expect(payload.cargoInstallArgsUnlocked).toBe(
      '*std_cargo_args.reject { |arg| arg == "--locked" }',
    );
  });

  it("cargoStdInstallArgs supports locked:false", async () => {
    const { cargoStdInstallArgs } = await import(
      "../../../lib/generators/cargo-package.ts"
    );
    expect(cargoStdInstallArgs(null, { locked: false })).toBe(
      '*std_cargo_args.reject { |arg| arg == "--locked" }',
    );
    expect(cargoStdInstallArgs("crates/x", { locked: false })).toBe(
      '*std_cargo_args(path: "crates/x").reject { |arg| arg == "--locked" }',
    );
  });

  it("renders std_cargo_args path for workspace member installs", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release, {
      cargoPath: "crates/all-in-one",
    });
    expect(payload.cargoInstallArgs).toContain('path: "crates/all-in-one"');
    expect(payload.cargoInstallArgsUnlocked).toContain("reject");
    expect(payload.cargoInstallArgsUnlocked).toContain(
      'path: "crates/all-in-one"',
    );
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

describe("collectCargoPackagePayload — crates.io registry path", () => {
  it("uses cratesMeta .crate url without GitHub release", async () => {
    const cratesMeta = {
      crateName: "krokiet",
      version: "12.0.1",
      description: "Slint frontend of Czkawka Core",
      homepage: "https://github.com/qarmin/czkawka",
      repository: "https://github.com/qarmin/czkawka",
      license: "GPL-3.0-only",
      checksum: "20e0fe56aac95ac8fd55b84bad22ad9a865d0901343658e75fd9b5eb742a1ffc",
      crateUrl: "https://static.crates.io/crates/krokiet/krokiet-12.0.1.crate",
      binNames: ["krokiet"],
    };
    const payload = await collectCargoPackagePayload(null, null, {
      crateName: "krokiet",
      cratesMeta,
      fromCratesIo: true,
    });
    expect(payload.template).toBe("cargo_package");
    expect(payload.name).toBe("krokiet");
    expect(payload.urlLines).toContain(
      "https://static.crates.io/crates/krokiet/krokiet-12.0.1.crate",
    );
    expect(payload.urlLines).toContain(
      "20e0fe56aac95ac8fd55b84bad22ad9a865d0901343658e75fd9b5eb742a1ffc",
    );
    expect(payload.urlLines).toContain('version "12.0.1"');
    expect(payload.fullName).toBe("qarmin/czkawka");
    expect(payload.livecheckBlock).toContain("crates.io/api/v1/crates/krokiet");
    expect(payload.testBinName).toBe("krokiet");
    expect(payload.serviceBlock).toBe("");
  });

  it("githubFullNameFromRepoUrl extracts owner/repo", async () => {
    const { githubFullNameFromRepoUrl } = await import(
      "../../../lib/generators/cargo-package.ts"
    );
    expect(githubFullNameFromRepoUrl("https://github.com/qarmin/czkawka")).toBe(
      "qarmin/czkawka",
    );
    expect(githubFullNameFromRepoUrl("https://github.com/qarmin/czkawka.git")).toBe(
      "qarmin/czkawka",
    );
    expect(githubFullNameFromRepoUrl(null)).toBe(null);
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

  it("uses github_latest livecheck for GitHub-sourced cargo formulas", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.livecheckBlock).toContain("strategy :github_latest");
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

  it("uses github_latest livecheck for GitHub-sourced cargo formulas", async () => {
    const payload = await collectCargoPackagePayload(repoInfo, release);
    expect(payload.livecheckBlock).toContain("strategy :github_latest");
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

describe("cargo toml helpers", () => {
  it("parseCargoPackageName reads [package] name", async () => {
    const { parseCargoPackageName } = await import(
      "../../../lib/generators/cargo-package.ts"
    );
    expect(
      parseCargoPackageName('[package]\nname = "deputui"\nversion = "0.1.0"\n'),
    ).toBe("deputui");
  });

  it("parseCargoWorkspaceMembers and isCargoWorkspaceRoot", async () => {
    const {
      parseCargoWorkspaceMembers,
      isCargoWorkspaceRoot,
      parseCargoPackageName,
      cargoStdInstallArgs,
    } = await import("../../../lib/generators/cargo-package.ts");
    const ws = `[workspace]\nresolver = "2"\nmembers = [\n  "crates/common",\n  "crates/all-in-one",\n]\n`;
    expect(isCargoWorkspaceRoot(ws)).toBe(true);
    expect(parseCargoPackageName(ws)).toBeNull();
    expect(parseCargoWorkspaceMembers(ws)).toEqual([
      "crates/common",
      "crates/all-in-one",
    ]);
    expect(cargoStdInstallArgs("crates/all-in-one")).toBe(
      '*std_cargo_args(path: "crates/all-in-one")',
    );
    expect(cargoStdInstallArgs(".")).toBe("*std_cargo_args");
  });
});

describe("cargo path dependency helpers", () => {
  it("parseCargoPathDependencies finds inline and section paths", async () => {
    const { parseCargoPathDependencies } = await import(
      "../../../lib/generators/cargo-package.ts"
    );
    const toml = `
[package]
name = "x"
[dependencies]
foo = { path = "./crates/foo" }
[dependencies.tes3]
path = "E:/GitHub/tes3conv/libs/tes3"
`;
    expect(parseCargoPathDependencies(toml)).toEqual([
      "crates/foo",
      "E:/GitHub/tes3conv/libs/tes3",
    ]);
  });

  it("isUnusableCargoPathDep flags absolute and Windows paths", async () => {
    const { isUnusableCargoPathDep } = await import(
      "../../../lib/generators/cargo-package.ts"
    );
    expect(isUnusableCargoPathDep("E:/GitHub/tes3conv/libs/tes3")).toBe(true);
    expect(isUnusableCargoPathDep("/opt/local/lib")).toBe(true);
    expect(isUnusableCargoPathDep("../sibling")).toBe(true);
    expect(isUnusableCargoPathDep("tes3")).toBe(false);
    expect(isUnusableCargoPathDep("crates/foo")).toBe(false);
  });

  it("cargoGithubTarballUnusable for absolute path deps", async () => {
    const { cargoGithubTarballUnusable } = await import(
      "../../../lib/generators/cargo-package.ts"
    );
    const broken = `[package]\nname = "x"\n[dependencies.tes3]\npath = "E:/GitHub/tes3conv/libs/tes3"\n`;
    expect(cargoGithubTarballUnusable(broken, null)).toBe(true);
  });

  it("cargoGithubTarballUnusable for submodule path deps", async () => {
    const { cargoGithubTarballUnusable } = await import(
      "../../../lib/generators/cargo-package.ts"
    );
    const toml = `[dependencies.tes3]\npath = "tes3"\n`;
    const gm = `[submodule "tes3"]\npath = tes3\nurl = https://github.com/rfuzzo/tes3\n`;
    expect(cargoGithubTarballUnusable(toml, gm)).toBe(true);
    expect(cargoGithubTarballUnusable(toml, null)).toBe(false);
  });

  it("drops unusable GitHub release and emits head-only with submodule init", async () => {
    const { collectCargoPackagePayload } = await import(
      "../../../lib/generators/cargo-package.ts"
    );
    const repoInfo = {
      name: "tes3edit",
      fullName: "rfuzzo/tes3edit",
      description: "Morrowind ESP editor",
      homepage: "https://rfuzzo.github.io/tes3edit/",
      htmlUrl: "https://github.com/rfuzzo/tes3edit",
      defaultBranch: "main",
      license: null,
    };
    const release = {
      tagName: "v0.1",
      tarballUrl: "https://api.github.com/repos/rfuzzo/tes3edit/tarball/v0.1",
    };
    const payload = await collectCargoPackagePayload(repoInfo, release, {
      cargoTomlAtRelease:
        '[package]\nname = "tes3edit"\n[dependencies.tes3]\npath = "E:/GitHub/tes3conv/libs/tes3"\n',
      gitmodulesAtRelease: null,
    });
    expect(payload.urlLines).toBe("");
    expect(payload.installPreamble).toContain("git");
    expect(payload.installPreamble).toContain("submodule");
  });
});

