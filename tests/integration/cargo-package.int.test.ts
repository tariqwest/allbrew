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

  const mangaTuiRepoInfo = {
    name: "manga-tui",
    fullName: "josueBarretogit/manga-tui",
    description: "TUI manga reader and downloader",
    homepage: "https://github.com/josueBarretogit/manga-tui",
    htmlUrl: "https://github.com/josueBarretogit/manga-tui",
    license: "MIT",
    defaultBranch: "main",
  };

  const tickrsRepoInfo = {
    name: "tickrs",
    fullName: "tarkah/tickrs",
    description: "Realtime ticker data in the terminal",
    homepage: "https://github.com/tarkah/tickrs",
    htmlUrl: "https://github.com/tarkah/tickrs",
    license: "MIT",
    defaultBranch: "main",
  };

  const nostuiRepoInfo = {
    name: "nostui",
    fullName: "akiellor/nostui",
    description: "TUI Nostr client",
    homepage: "https://github.com/akiellor/nostui",
    htmlUrl: "https://github.com/akiellor/nostui",
    license: "MIT",
    defaultBranch: "main",
  };

  it("manga-tui: generates valid formula (head-only)", async () => {
    const payload = await collectCargoPackagePayload(mangaTuiRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class MangaTui < Formula");
    expect(payload.livecheckBlock).toContain("manga-tui");
  });

  it("tickrs: generates valid formula (head-only)", async () => {
    const payload = await collectCargoPackagePayload(tickrsRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Tickrs < Formula");
  });

  it("nostui: generates valid formula (head-only)", async () => {
    const payload = await collectCargoPackagePayload(nostuiRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Nostui < Formula");
  });

  const oculanteRepoInfo = {
    name: "oculante",
    fullName: "woelper/oculante",
    description: "A minimalistic crossplatform image viewer written in Rust",
    homepage: "https://github.com/woelper/oculante",
    htmlUrl: "https://github.com/woelper/oculante",
    license: "MIT",
    defaultBranch: "main",
  };

  const emulsionRepoInfo = {
    name: "emulsion",
    fullName: "ArturKovacs/emulsion",
    description: "A fast and minimalistic image viewer written in Rust",
    homepage: "https://arturkovacs.github.io/emulsion/",
    htmlUrl: "https://github.com/ArturKovacs/emulsion",
    license: "MIT",
    defaultBranch: "master",
  };

  const krokietRepoInfo = {
    name: "krokiet",
    fullName: "qarmin/czkawka",
    description: "Multi functional app to find duplicates, empty folders, similar images etc.",
    homepage: "https://github.com/qarmin/czkawka",
    htmlUrl: "https://github.com/qarmin/czkawka",
    license: "MIT",
    defaultBranch: "master",
  };

  const rerunRepoInfo = {
    name: "rerun-cli",
    fullName: "rerun-io/rerun",
    description: "Visualize streams of multimodal data",
    homepage: "https://rerun.io",
    htmlUrl: "https://github.com/rerun-io/rerun",
    license: "MIT",
    defaultBranch: "main",
  };

  const gobangRepoInfo = {
    name: "gobang",
    fullName: "TaKO8Ki/gobang",
    description: "A cross-platform TUI database management tool written in Rust",
    homepage: "https://github.com/TaKO8Ki/gobang",
    htmlUrl: "https://github.com/TaKO8Ki/gobang",
    license: "MIT",
    defaultBranch: "main",
  };

  it("oculante: generates valid formula (Rust GUI)", async () => {
    const payload = await collectCargoPackagePayload(oculanteRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Oculante < Formula");
  });

  it("emulsion: generates valid formula (Rust GUI)", async () => {
    const payload = await collectCargoPackagePayload(emulsionRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Emulsion < Formula");
  });

  it("krokiet: generates valid formula (Rust TUI)", async () => {
    const payload = await collectCargoPackagePayload(krokietRepoInfo, null, {
      crateName: "krokiet",
    });
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.livecheckBlock).toContain("krokiet");
  });

  it("rerun-cli: generates valid formula (Rust CLI)", async () => {
    const payload = await collectCargoPackagePayload(rerunRepoInfo, null, {
      crateName: "rerun-cli",
    });
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.livecheckBlock).toContain("rerun-cli");
  });

  it("gobang: generates valid formula (Rust TUI DB tool)", async () => {
    const payload = await collectCargoPackagePayload(gobangRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Gobang < Formula");
  });

  it("custom crateName in options overrides livecheck", async () => {
    const payload = await collectCargoPackagePayload(wanderRepoInfo, null, {
      crateName: "wander-tui",
    });
    expect(payload.livecheckBlock).toContain("wander-tui");
  });
});
