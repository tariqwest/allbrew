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

  const gokapiRepoInfo = {
    name: "Gokapi",
    fullName: "Forceu/Gokapi",
    description: "Lightweight selfhosted Firefox Send alternative without public upload",
    homepage: "https://github.com/Forceu/Gokapi",
    htmlUrl: "https://github.com/Forceu/Gokapi",
    license: "AGPL-3.0",
    defaultBranch: "master",
  };

  it("gokapi: generates valid formula (go:embed web app)", async () => {
    const payload = await collectGoPackagePayload(gokapiRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("gokapi");
    expect(payload.className).toBe("Gokapi");
    expect(ruby).toContain("class Gokapi < Formula");
    expect(payload.licenseLine).toContain("AGPL-3.0");
  });

  const gottyRepoInfo = {
    name: "gotty",
    fullName: "sorenisanerd/gotty",
    description: "Share your terminal as a web application",
    homepage: "https://github.com/sorenisanerd/gotty",
    htmlUrl: "https://github.com/sorenisanerd/gotty",
    license: "MIT",
    defaultBranch: "master",
  };

  it("gotty: generates valid formula (terminal sharing web app)", async () => {
    const payload = await collectGoPackagePayload(gottyRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("gotty");
    expect(ruby).toContain("class Gotty < Formula");
  });

  const updoRepoInfo = {
    name: "updo",
    fullName: "Owloops/updo",
    description: "Uptime monitoring CLI tool with alerting and TUI",
    homepage: "https://github.com/Owloops/updo",
    htmlUrl: "https://github.com/Owloops/updo",
    license: "MIT",
    defaultBranch: "main",
  };

  it("updo: generates valid formula (uptime monitor TUI)", async () => {
    const payload = await collectGoPackagePayload(updoRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("updo");
    expect(ruby).toContain("class Updo < Formula");
  });

  const supersonicRepoInfo = {
    name: "supersonic",
    fullName: "dweymouth/supersonic",
    description: "A lightweight cross-platform desktop client for Subsonic music servers",
    homepage: "https://github.com/dweymouth/supersonic",
    htmlUrl: "https://github.com/dweymouth/supersonic",
    license: "GPL-3.0",
    defaultBranch: "main",
  };

  it("supersonic: generates valid formula (Fyne desktop GUI)", async () => {
    const payload = await collectGoPackagePayload(supersonicRepoInfo, null);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("supersonic");
    expect(payload.className).toBe("Supersonic");
    expect(ruby).toContain("class Supersonic < Formula");
    expect(payload.licenseLine).toContain("GPL-3.0");
  });

  it("goatcounter: generates valid formula (CGO/SQLite web analytics)", async () => {
    const goatcounterRepoInfo = {
      name: "goatcounter",
      fullName: "arp242/goatcounter",
      description: "Easy web analytics. No tracking of personal data.",
      homepage: "https://www.goatcounter.com",
      htmlUrl: "https://github.com/arp242/goatcounter",
      license: "EUPL-1.2",
      defaultBranch: "master",
    };
    const payload = await collectGoPackagePayload(goatcounterRepoInfo, null, {
      goModule: "zgo.at/goatcounter/v2",
    });
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(payload.name).toBe("goatcounter");
    expect(payload.livecheckBlock).toContain("goatcounter/v2/@latest");
  });
});
