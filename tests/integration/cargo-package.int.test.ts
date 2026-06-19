import { describe, it, expect } from "vitest";
import { collectCargoPackagePayload } from "../../lib/generators/cargo-package.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: uses real GitHub tarballs + crates.io livecheck URLs.
 * Supplies pre-shaped repoInfo/release directly (no GitHub API token required).
 * Run: bun run test:int
 */

// wander: a Nomad TUI written in Rust (robinovitch61/wander)
const wanderRepoInfo = {
  name: "wander",
  fullName: "robinovitch61/wander",
  description: "A Nomad TUI",
  homepage: "https://github.com/robinovitch61/wander",
  htmlUrl: "https://github.com/robinovitch61/wander",
  license: "MIT",
  defaultBranch: "main",
};

const oatmealRepoInfo = {
  name: "oatmeal",
  fullName: "dustinblackman/oatmeal",
  description: "Terminal UI to chat with large language models",
  homepage: "https://dustinblackman.com/posts/oatmeal/",
  htmlUrl: "https://github.com/dustinblackman/oatmeal",
  license: "MIT",
  defaultBranch: "main",
};

describe.concurrent("cargo-package integration", () => {
  it("wander: payload fields are well-formed (head-only, no release)", async () => {
    const payload = await collectCargoPackagePayload(wanderRepoInfo, null);
    expect(payload.template).toBe("cargo_package");
    expect(payload.name).toBe("wander");
    expect(payload.urlLines).toBe("");
    expect(payload.livecheckBlock).toContain("crates.io/api/v1/crates/wander");
    expect(payload.fullName).toBe("robinovitch61/wander");
    expect(payload.defaultBranch).toBe("main");
  });

  it("wander: generates structurally valid Ruby formula (head-only)", async () => {
    const payload = await collectCargoPackagePayload(wanderRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain('depends_on "rust" => :build');
    expect(ruby).toContain('system "cargo", "install"');
    expect(ruby).toContain('head "https://github.com/robinovitch61/wander.git"');
  });

  it("wander: with release v1.1.0, downloads real tarball and computes SHA256", async () => {
    const release = { tagName: "v1.1.0" };
    const payload = await collectCargoPackagePayload(wanderRepoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/robinovitch61/wander/archive/refs/tags/v1.1.0.tar.gz",
    );
    expect(payload.urlLines).toMatch(/sha256 "[a-f0-9]{64}"/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
  });

  it("oatmeal: generates valid formula (head-only)", async () => {
    const payload = await collectCargoPackagePayload(oatmealRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Oatmeal < Formula");
    expect(payload.livecheckBlock).toContain("crates.io/api/v1/crates/oatmeal");
  });

  it("custom crateName in options overrides livecheck", async () => {
    const payload = await collectCargoPackagePayload(wanderRepoInfo, null, {
      crateName: "wander-tui",
    });
    expect(payload.livecheckBlock).toContain("wander-tui");
  });
});
