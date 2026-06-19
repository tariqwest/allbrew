import { describe, it, expect } from "vitest";
import { collectGoPackagePayload } from "../../lib/generators/go-package.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: uses real GitHub tarballs + Go module proxy livecheck.
 * Supplies pre-shaped repoInfo/release directly (no GitHub API token required).
 * Run: bun run test:int
 */

const wakapiRepoInfo = {
  name: "wakapi",
  fullName: "muety/wakapi",
  description: "A minimalist, self-hosted WakaTime-compatible backend for coding statistics",
  homepage: "https://wakapi.dev",
  htmlUrl: "https://github.com/muety/wakapi",
  license: "MIT",
  defaultBranch: "master",
};

const processComposeRepoInfo = {
  name: "process-compose",
  fullName: "F1bonacc1/process-compose",
  description: "process-compose is like docker-compose, but for processes",
  homepage: "https://f1bonacc1.github.io/process-compose/",
  htmlUrl: "https://github.com/F1bonacc1/process-compose",
  license: "Apache-2.0",
  defaultBranch: "main",
};

describe.concurrent("go-package integration", () => {
  it("wakapi: payload fields are well-formed (head-only)", async () => {
    const payload = await collectGoPackagePayload(wakapiRepoInfo, null);
    expect(payload.template).toBe("go_package");
    expect(payload.name).toBe("wakapi");
    expect(payload.urlLines).toBe("");
    expect(payload.livecheckBlock).toContain(
      "proxy.golang.org/github.com/muety/wakapi/@latest",
    );
    expect(payload.fullName).toBe("muety/wakapi");
    expect(payload.defaultBranch).toBe("master");
  });

  it("wakapi: generates structurally valid Ruby formula (head-only)", async () => {
    const payload = await collectGoPackagePayload(wakapiRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain('depends_on "go" => :build');
    expect(ruby).toContain('system "go", "install"');
    expect(ruby).toContain('head "https://github.com/muety/wakapi.git"');
  });

  it("wakapi: with release 2.17.4, downloads real tarball and computes SHA256", async () => {
    const release = { tagName: "2.17.4" };
    const payload = await collectGoPackagePayload(wakapiRepoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/muety/wakapi/archive/refs/tags/2.17.4.tar.gz",
    );
    expect(payload.urlLines).toMatch(/sha256 "[a-f0-9]{64}"/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
  });

  it("process-compose: generates valid formula with hyphenated name", async () => {
    const payload = await collectGoPackagePayload(processComposeRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("process-compose");
    expect(payload.className).toBe("ProcessCompose");
    expect(ruby).toContain("class ProcessCompose < Formula");
    expect(payload.licenseLine).toContain("Apache-2.0");
  });

  const planorRepoInfo = {
    name: "planor",
    fullName: "mrusme/planor",
    description: "A plane for cloud resources: TUI for AWS, Fly, Vultr",
    homepage: "https://github.com/mrusme/planor",
    htmlUrl: "https://github.com/mrusme/planor",
    license: "GPL-3.0",
    defaultBranch: "main",
  };

  const damonRepoInfo = {
    name: "damon",
    fullName: "hashicorp/damon",
    description: "A terminal UI for HashiCorp Nomad",
    homepage: "https://github.com/hashicorp/damon",
    htmlUrl: "https://github.com/hashicorp/damon",
    license: "MPL-2.0",
    defaultBranch: "main",
  };

  it("planor: generates valid formula with hyphenated name", async () => {
    const payload = await collectGoPackagePayload(planorRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("planor");
    expect(payload.className).toBe("Planor");
    expect(ruby).toContain("class Planor < Formula");
  });

  it("damon: generates valid formula (head-only)", async () => {
    const payload = await collectGoPackagePayload(damonRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Damon < Formula");
  });

  it("custom goModule in options overrides livecheck URL", async () => {
    const payload = await collectGoPackagePayload(wakapiRepoInfo, null, {
      goModule: "github.com/muety/wakapi/v2",
    });
    expect(payload.livecheckBlock).toContain("wakapi/v2/@latest");
  });
});
