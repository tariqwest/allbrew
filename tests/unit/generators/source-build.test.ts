import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectSourceBuildPayload } from "../../../lib/generators/source-build.ts";

mock.module("../../../lib/sha256.ts", () => ({
  hashUrl: mock().mockResolvedValue("bfs_sha256_mock_64chars_padding_abcdef0123456789abcdef01234567"),
  downloadAndHash: mock().mockResolvedValue({ sha256: "mocked_sha256" }),
}));

describe("collectSourceBuildPayload", () => {
  beforeEach(() => {
    mock.restore();
  });

  const repoInfo = {
    name: "myproject",
    fullName: "user/myproject",
    description: "A source-build project",
    homepage: "https://myproject.dev",
    htmlUrl: "https://github.com/user/myproject",
    license: "MIT",
    defaultBranch: "main",
  };

  const release = {
    tagName: "v1.5.0",
    tarballUrl: null,
  };

  const buildSystem = { system: "cmake" };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.template).toBe("source_build");
  });

  it("derives name from repo name", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.name).toBe("myproject");
    expect(payload.className).toBe("Myproject");
  });

  it("generates source URL from release tag", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.urlLines).toContain(
      "https://github.com/user/myproject/archive/refs/tags/v1.5.0.tar.gz",
    );
  });

  it("generates cmake install body for cmake build system", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.installBody).toContain("cmake");
  });

  it("generates empty urlLines when no release", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      null,
      buildSystem,
    );
    expect(payload.urlLines).toBe("");
  });

  it("uses repo description", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.desc).toBe("A source-build project");
  });

  it("includes license line", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.licenseLine).toContain("MIT");
  });

  it("includes head reference", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      buildSystem,
    );
    expect(payload.fullName).toBe("user/myproject");
    expect(payload.defaultBranch).toBe("main");
  });

  it("respects name override", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      buildSystem,
      { name: "custom-name" },
    );
    expect(payload.name).toBe("custom-name");
  });
});

describe("collectSourceBuildPayload — slides", () => {
  beforeEach(() => {
    mock.restore();
  });

  const repoInfo = {
    name: "slides",
    fullName: "maaslalani/slides",
    description: "Terminal based presentation tool",
    homepage: "https://github.com/maaslalani/slides",
    htmlUrl: "https://github.com/maaslalani/slides",
    license: "MIT",
    defaultBranch: "main",
  };

  const release = {
    tagName: "v0.9.0",
    tarballUrl: "https://github.com/maaslalani/slides/archive/refs/tags/v0.9.0.tar.gz",
  };

  it("returns payload with correct template identifier", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      { system: "cmake" },
    );
    expect(payload.template).toBe("source_build");
  });

  it("derives name from repo name", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      { system: "cmake" },
    );
    expect(payload.name).toBe("slides");
    expect(payload.className).toBe("Slides");
  });

  it("uses repo description", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      { system: "cmake" },
    );
    expect(payload.desc).toBe("Terminal based presentation tool");
  });

  it("generates source archive URL from release tag", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      { system: "cmake" },
    );
    expect(payload.urlLines).toContain(
      "https://github.com/maaslalani/slides/archive/refs/tags/v0.9.0.tar.gz",
    );
  });

  it("generates MIT license line", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      release,
      { system: "cmake" },
    );
    expect(payload.licenseLine).toContain("MIT");
  });

  it("head stanza when no release", async () => {
    const payload = await collectSourceBuildPayload(
      repoInfo,
      null,
      { system: "cmake" },
    );
    expect(payload.urlLines).toBe("");
  });
});

describe("collectSourceBuildPayload — open-notebook (Python web app, no PyPI, source-build)", () => {
  beforeEach(() => {
    mock.restore();
  });

  const openNotebookRepoInfo = {
    name: "open-notebook",
    fullName: "lfnovo/open-notebook",
    description: "An open source implementation of a research assistant, inspired by Google Notebook LM",
    homepage: "https://www.open-notebook.ai",
    htmlUrl: "https://github.com/lfnovo/open-notebook",
    license: "MIT",
    defaultBranch: "main",
  };

  const release = {
    tagName: "v1.10.0",
    tarballUrl: "https://github.com/lfnovo/open-notebook/archive/refs/tags/v1.10.0.tar.gz",
  };

  it("returns correct template identifier", async () => {
    const payload = await collectSourceBuildPayload(
      openNotebookRepoInfo,
      release,
      { system: "python" },
    );
    expect(payload.template).toBe("source_build");
  });

  it("derives name and className from repo name", async () => {
    const payload = await collectSourceBuildPayload(
      openNotebookRepoInfo,
      release,
      { system: "python" },
    );
    expect(payload.name).toBe("open-notebook");
    expect(payload.className).toBe("OpenNotebook");
  });

  it("uses repo description", async () => {
    const payload = await collectSourceBuildPayload(
      openNotebookRepoInfo,
      release,
      { system: "python" },
    );
    expect(payload.desc).toContain("research assistant");
  });

  it("uses homepage from repo info", async () => {
    const payload = await collectSourceBuildPayload(
      openNotebookRepoInfo,
      release,
      { system: "python" },
    );
    expect(payload.homepage).toBe("https://www.open-notebook.ai");
  });

  it("generates source archive URL from release tag", async () => {
    const payload = await collectSourceBuildPayload(
      openNotebookRepoInfo,
      release,
      { system: "python" },
    );
    expect(payload.urlLines).toContain(
      "https://github.com/lfnovo/open-notebook/archive/refs/tags/v1.10.0.tar.gz",
    );
  });

  it("marks payload as Python (isPython true)", async () => {
    const payload = await collectSourceBuildPayload(
      openNotebookRepoInfo,
      release,
      { system: "python" },
    );
    expect(payload.isPython).toBe(true);
  });

  it("includes MIT license line", async () => {
    const payload = await collectSourceBuildPayload(
      openNotebookRepoInfo,
      release,
      { system: "python" },
    );
    expect(payload.licenseLine).toContain("MIT");
  });

  it("generates head stanza fields", async () => {
    const payload = await collectSourceBuildPayload(
      openNotebookRepoInfo,
      release,
      { system: "python" },
    );
    expect(payload.fullName).toBe("lfnovo/open-notebook");
    expect(payload.defaultBranch).toBe("main");
  });
});

describe("collectSourceBuildPayload — Jockey (Tauri, no releases)", () => {
  beforeEach(() => {
    mock.restore();
  });

  const jockeyRepoInfo = {
    name: "jockey",
    fullName: "recailai/jockey",
    description:
      "A high-performance, open-source Multi-Agent Collaboration Platform built with Tauri, Rust, and SolidJS",
    homepage: "https://github.com/recailai/jockey",
    htmlUrl: "https://github.com/recailai/jockey",
    license: "MIT",
    defaultBranch: "main",
  };

  it("returns correct template identifier", async () => {
    const payload = await collectSourceBuildPayload(
      jockeyRepoInfo,
      null,
      { system: "make" },
    );
    expect(payload.template).toBe("source_build");
  });

  it("derives name from repo name", async () => {
    const payload = await collectSourceBuildPayload(
      jockeyRepoInfo,
      null,
      { system: "make" },
    );
    expect(payload.name).toBe("jockey");
    expect(payload.className).toBe("Jockey");
  });

  it("generates empty urlLines for HEAD-only repo", async () => {
    const payload = await collectSourceBuildPayload(
      jockeyRepoInfo,
      null,
      { system: "make" },
    );
    expect(payload.urlLines).toBe("");
  });

  it("generates make install body for default build system", async () => {
    const payload = await collectSourceBuildPayload(
      jockeyRepoInfo,
      null,
      { system: "make" },
    );
    expect(payload.installBody).toContain("make");
  });

  it("uses repo description", async () => {
    const payload = await collectSourceBuildPayload(
      jockeyRepoInfo,
      null,
      { system: "make" },
    );
    expect(payload.desc).toContain("Multi-Agent Collaboration Platform");
  });

  it("includes MIT license line", async () => {
    const payload = await collectSourceBuildPayload(
      jockeyRepoInfo,
      null,
      { system: "make" },
    );
    expect(payload.licenseLine).toContain("MIT");
  });

  it("includes head reference fields", async () => {
    const payload = await collectSourceBuildPayload(
      jockeyRepoInfo,
      null,
      { system: "make" },
    );
    expect(payload.fullName).toBe("recailai/jockey");
    expect(payload.defaultBranch).toBe("main");
  });
});
