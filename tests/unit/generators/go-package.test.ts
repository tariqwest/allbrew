import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectGoPackagePayload } from "../../../lib/generators/go-package.ts";
import wakapiFixture from "../../fixtures/github/wakapi.json";
import processComposeFixture from "../../fixtures/github/process-compose.json";
import ugmFixture from "../../fixtures/github/ugm.json";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("go_mocked_sha256_64chars_padding_abcdef0123456789abcdef01234"),
  downloadAndHash: mock().mockResolvedValue({ sha256: "mocked_sha256" }),
}));

describe("collectGoPackagePayload", () => {
  beforeEach(() => {
    mock.restore();
  });

  const repoInfo = wakapiFixture.repo;
  const release = wakapiFixture.release;

  it("returns payload with correct template identifier", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.template).toBe("go_package");
  });

  it("derives name from repo name", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.name).toBe("wakapi");
    expect(payload.className).toBe("Wakapi");
  });

  it("uses repo description", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("WakaTime");
  });

  it("uses repo homepage", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.homepage).toBe("https://wakapi.dev");
  });

  it("generates source archive URL from release tag", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/muety/wakapi/archive/refs/tags/v2.12.2.tar.gz",
    );
  });

  it("generates Go module proxy livecheck block", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.livecheckBlock).toContain(
      "proxy.golang.org/github.com/muety/wakapi/@latest",
    );
  });

  it("uses goModule from options when provided", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release, {
      goModule: "github.com/muety/wakapi/v2",
    });
    expect(payload.livecheckBlock).toContain("wakapi/v2/@latest");
  });

  it("includes head reference to default branch", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.defaultBranch).toBe("master");
    expect(payload.fullName).toBe("muety/wakapi");
  });

  it("handles null release (no urlLines)", async () => {
    const payload = await collectGoPackagePayload(repoInfo, null);
    expect(payload.urlLines).toBe("");
  });

  it("respects name override", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release, {
      name: "my-wakapi",
    });
    expect(payload.name).toBe("my-wakapi");
  });

  it("generates license line from repo info", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("MIT");
  });

  it("includes empty service block by default", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.serviceBlock).toBe("");
  });

  it("includes service block when configured", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release, {
      service: true,
      serviceCommand: "wakapi",
    });
    expect(payload.serviceBlock).toContain("service do");
  });
});

describe("collectGoPackagePayload — process-compose", () => {
  beforeEach(() => {
    mock.restore();
  });

  const repoInfo = processComposeFixture.repo;
  const release = processComposeFixture.release;

  it("returns payload with correct template identifier", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.template).toBe("go_package");
  });

  it("derives name from repo name", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.name).toBe("process-compose");
    expect(payload.className).toBe("ProcessCompose");
  });

  it("uses repo description", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("scheduler and orchestrator");
  });

  it("uses repo homepage", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.homepage).toBe("https://f1bonacc1.github.io/process-compose/");
  });

  it("generates source archive URL from release tag", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/F1bonacc1/process-compose/archive/refs/tags/v1.116.0.tar.gz",
    );
  });

  it("generates Go module proxy livecheck block", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.livecheckBlock).toContain(
      "proxy.golang.org/github.com/F1bonacc1/process-compose/@latest",
    );
  });

  it("includes head reference to default branch", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.defaultBranch).toBe("main");
    expect(payload.fullName).toBe("F1bonacc1/process-compose");
  });

  it("generates Apache-2.0 license line", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("Apache-2.0");
  });
});

describe("collectGoPackagePayload — ugm", () => {
  beforeEach(() => {
    mock.restore();
  });

  const repoInfo = ugmFixture.repo;
  const release = ugmFixture.release;

  it("returns payload with correct template identifier", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.template).toBe("go_package");
  });

  it("derives name from repo name", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.name).toBe("ugm");
    expect(payload.className).toBe("Ugm");
  });

  it("uses repo description", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.desc).toContain("UNIX users and groups");
  });

  it("generates source archive URL from release tag", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.urlLines).toContain(
      "https://github.com/ariasmn/ugm/archive/refs/tags/v1.9.0.tar.gz",
    );
  });

  it("generates Go module proxy livecheck block", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.livecheckBlock).toContain(
      "proxy.golang.org/github.com/ariasmn/ugm/@latest",
    );
  });

  it("includes head reference to default branch", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.defaultBranch).toBe("main");
    expect(payload.fullName).toBe("ariasmn/ugm");
  });

  it("handles null release (no urlLines)", async () => {
    const payload = await collectGoPackagePayload(repoInfo, null);
    expect(payload.urlLines).toBe("");
  });

  it("generates MIT license line from repo info", async () => {
    const payload = await collectGoPackagePayload(repoInfo, release);
    expect(payload.licenseLine).toContain("MIT");
  });
});
