import { describe, it, expect } from "bun:test";
import { collectSourceBuildPayload } from "../../lib/generators/source-build.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: downloads real GitHub source tarballs, validates SHA + Ruby output.
 * Run: bun run test:int
 */

const slidesRepoInfo = {
  name: "slides",
  fullName: "maaslalani/slides",
  description: "Terminal based presentation tool",
  homepage: "https://github.com/maaslalani/slides",
  htmlUrl: "https://github.com/maaslalani/slides",
  license: "MIT",
  defaultBranch: "main",
};

const slidesRelease = {
  tagName: "v0.9.0",
  tarballUrl: "https://github.com/maaslalani/slides/archive/refs/tags/v0.9.0.tar.gz",
};

const authsecBridgeRepoInfo = {
  name: "authsec-bridge",
  fullName: "authsec-ai/authsec-bridge",
  description: "Session bridge for Claude Code, Codex, and Gemini CLI",
  homepage: "https://github.com/authsec-ai/authsec-bridge",
  htmlUrl: "https://github.com/authsec-ai/authsec-bridge",
  license: "MIT",
  defaultBranch: "main",
};

describe.concurrent("source-build integration", () => {
  it("authsec-bridge: generates Python pip install payload", async () => {
    const payload = await collectSourceBuildPayload(
      authsecBridgeRepoInfo,
      null,
      { system: "python" },
    );
    expect(payload.template).toBe("source_build");
    expect(payload.name).toBe("authsec-bridge");
    expect(payload.className).toBe("AuthsecBridge");
    expect(payload.isPython).toBe(true);
    expect(payload.urlLines).toBe("");
  });

  it("authsec-bridge: generates structurally valid Ruby formula with virtualenv", async () => {
    const payload = await collectSourceBuildPayload(
      authsecBridgeRepoInfo,
      null,
      { system: "python" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class AuthsecBridge < Formula");
    expect(ruby).toContain("include Language::Python::Virtualenv");
    expect(ruby).toContain('depends_on "python@3.13"');
    expect(ruby).not.toContain('=> :build');
    expect(ruby).toContain('virtualenv_create(libexec, "python3.13")');
    expect(ruby).toContain('system libexec/"bin/pip", "install", "-v", "--no-deps", "--ignore-installed", "."');
  });

  it("slides: payload fields are well-formed", async () => {
    const payload = await collectSourceBuildPayload(
      slidesRepoInfo,
      slidesRelease,
      { system: "go" },
    );
    expect(payload.template).toBe("source_build");
    expect(payload.name).toBe("slides");
    expect(payload.className).toBe("Slides");
    expect(payload.urlLines).toContain("github.com/maaslalani/slides/archive/refs/tags/v0.9.0.tar.gz");
    expect(payload.urlLines).toMatch(/sha256 "[a-f0-9]{64}"/);
  });

  it("slides: generates structurally valid Ruby formula", async () => {
    const payload = await collectSourceBuildPayload(
      slidesRepoInfo,
      slidesRelease,
      { system: "go" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Slides < Formula");
    expect(ruby).toContain('depends_on "go" => :build');
    expect(ruby).toContain('system "go", "build"');
  });

  it("slides: cmake build system emits cmake deps", async () => {
    const payload = await collectSourceBuildPayload(
      slidesRepoInfo,
      slidesRelease,
      { system: "cmake" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain('depends_on "cmake" => :build');
    expect(ruby).toContain('system "cmake"');
  });

  it("slides: HEAD release omits url and uses head stanza", async () => {
    const payload = await collectSourceBuildPayload(
      slidesRepoInfo,
      null,
      { system: "go" },
    );
    expect(payload.urlLines).toBe("");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain('head "https://github.com/maaslalani/slides.git"');
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

  it("jockey: generates HEAD-only make payload for Tauri app", async () => {
    const payload = await collectSourceBuildPayload(
      jockeyRepoInfo,
      null,
      { system: "make" },
    );
    expect(payload.template).toBe("source_build");
    expect(payload.name).toBe("jockey");
    expect(payload.className).toBe("Jockey");
    expect(payload.urlLines).toBe("");
  });

  it("jockey: generates structurally valid Ruby formula with head stanza", async () => {
    const payload = await collectSourceBuildPayload(
      jockeyRepoInfo,
      null,
      { system: "make" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Jockey < Formula");
    expect(ruby).toContain('head "https://github.com/recailai/jockey.git"');
    expect(ruby).toContain("make");
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

  const openNotebookRelease = {
    tagName: "v1.10.0",
    tarballUrl: "https://github.com/lfnovo/open-notebook/archive/refs/tags/v1.10.0.tar.gz",
  };

  it("open-notebook: payload fields are well-formed (Python web app, source-build)", async () => {
    const payload = await collectSourceBuildPayload(
      openNotebookRepoInfo,
      openNotebookRelease,
      { system: "python" },
    );
    expect(payload.template).toBe("source_build");
    expect(payload.name).toBe("open-notebook");
    expect(payload.className).toBe("OpenNotebook");
    expect(payload.isPython).toBe(true);
    expect(payload.urlLines).toContain("lfnovo/open-notebook/archive/refs/tags/v1.10.0.tar.gz");
    expect(payload.urlLines).toMatch(/sha256 "[a-f0-9]{64}"/);
    expect(payload.licenseLine).toContain("MIT");
    expect(payload.allbrewDependency).toBe("");
  });

  it("open-notebook: generates structurally valid Ruby formula with virtualenv", async () => {
    const payload = await collectSourceBuildPayload(
      openNotebookRepoInfo,
      openNotebookRelease,
      { system: "python" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class OpenNotebook < Formula");
    expect(ruby).toContain("include Language::Python::Virtualenv");
    expect(ruby).toContain('depends_on "python@3.13"');
    expect(ruby).toContain('head "https://github.com/lfnovo/open-notebook.git"');
  });

  const libreChatRepoInfo = {
    name: "LibreChat",
    fullName: "danny-avila/LibreChat",
    description: "Enhanced ChatGPT Clone with support for multiple AI providers",
    homepage: "https://librechat.ai/",
    htmlUrl: "https://github.com/danny-avila/LibreChat",
    license: "MIT",
    defaultBranch: "main",
  };

  const libreChatRelease = {
    tagName: "v0.8.7",
    tarballUrl:
      "https://github.com/danny-avila/LibreChat/archive/refs/tags/v0.8.7.tar.gz",
  };

  it("LibreChat: downloads the released source archive into a make fallback payload", async () => {
    const payload = await collectSourceBuildPayload(
      libreChatRepoInfo,
      libreChatRelease,
      { system: "make" },
    );
    expect(payload.template).toBe("source_build");
    expect(payload.name).toBe("librechat");
    expect(payload.className).toBe("Librechat");
    expect(payload.urlLines).toContain(
      "github.com/danny-avila/LibreChat/archive/refs/tags/v0.8.7.tar.gz",
    );
    expect(payload.urlLines).toMatch(/sha256 "[a-f0-9]{64}"/);
    expect(payload.licenseLine).toContain("MIT");
  });

  it("LibreChat: renders a structurally valid source-build formula", async () => {
    const payload = await collectSourceBuildPayload(
      libreChatRepoInfo,
      libreChatRelease,
      { system: "make" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Librechat < Formula");
    expect(ruby).toContain('head "https://github.com/danny-avila/LibreChat.git"');
    expect(ruby).toContain('system "make", "PREFIX=#{prefix}", "install"');
  });
});
