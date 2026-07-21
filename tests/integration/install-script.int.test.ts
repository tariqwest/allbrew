import { describe, it, expect } from "vitest";
import { collectInstallScriptPayload } from "../../lib/generators/install-script.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: downloads real install scripts, validates SHA + Ruby output.
 * Run: bun run test:int
 */

describe.concurrent("install-script integration", () => {
  it("starship install.sh: payload is well-formed", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
      { name: "starship", desc: "The minimal, blazing-fast, and infinitely customizable prompt" },
    );
    expect(payload.template).toBe("install_script");
    expect(payload.name).toBe("starship");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.scriptFilename).toBe("install.sh");
    expect(payload.url).toBe("https://starship.rs/install.sh");
  });

  it("starship: generates structurally valid Ruby formula", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
      { name: "starship" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Starship < Formula");
    expect(ruby).toContain('system "bash", cached_download.to_s');
    expect(ruby).toContain('ENV["PREFIX"]');
  });

  it("starship: livecheck block references the script URL", async () => {
    const payload = await collectInstallScriptPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.livecheckBlock).toContain("starship.rs/install.sh");
  });

  it("raw github install script: resolves to valid payload", async () => {
    const payload = await collectInstallScriptPayload(
      "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh",
      { name: "ohmyzsh" },
    );
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
  });

  it("uv: installer script resolves to valid payload", async () => {
    const payload = await collectInstallScriptPayload(
      "https://astral.sh/uv/install.sh",
      { name: "uv" },
    );
    expect(payload.template).toBe("install_script");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Uv < Formula");
  });

  it("devbox: launcher script (no .sh) resolves to valid payload", async () => {
    const payload = await collectInstallScriptPayload(
      "https://get.jetify.com/devbox",
      { name: "devbox" },
    );
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
  });

  it("volta: no .sh extension resolves to valid payload", async () => {
    const payload = await collectInstallScriptPayload(
      "https://get.volta.sh",
      { name: "volta" },
    );
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
  });

  it("mise: bare domain URL resolves to valid payload", async () => {
    const payload = await collectInstallScriptPayload(
      "https://mise.run",
      { name: "mise" },
    );
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Mise < Formula");
  });

  it("nvm: version in URL path resolves to valid payload", async () => {
    const payload = await collectInstallScriptPayload(
      "https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh",
      { name: "nvm" },
    );
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.scriptFilename).toBe("install.sh");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Nvm < Formula");
  });

  it("sdkman: get. subdomain + no extension resolves to valid payload", async () => {
    const payload = await collectInstallScriptPayload(
      "https://get.sdkman.io",
      { name: "sdkman" },
    );
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Sdkman < Formula");
  });

  it("poetry: Python script (not bash) resolves to valid payload", async () => {
    const payload = await collectInstallScriptPayload(
      "https://install.python-poetry.org",
      { name: "poetry" },
    );
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Poetry < Formula");
  });

  it("qoder: install script URL resolves to valid payload (requires auth)", async () => {
    const payload = await collectInstallScriptPayload(
      "https://qoder.com/install",
      { name: "qoder" },
    );
    expect(payload.template).toBe("install_script");
    expect(payload.name).toBe("qoder");
    expect(payload.scriptFilename).toBe("install");
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Qoder < Formula");
  });

  it("cua-driver: install script payload is well-formed", async () => {
    const payload = await collectInstallScriptPayload(
      "https://cua.ai/driver/install.sh",
      { name: "cua-driver", desc: "Background computer-use driver for agents" },
    );
    expect(payload.template).toBe("install_script");
    expect(payload.name).toBe("cua-driver");
    expect(payload.className).toBe("CuaDriver");
    expect(payload.scriptFilename).toBe("install.sh");
    expect(payload.url).toBe("https://cua.ai/driver/install.sh");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.desc).toContain("computer-use driver");
  });

  it("cua-driver: generates structurally valid Ruby formula", async () => {
    const payload = await collectInstallScriptPayload(
      "https://cua.ai/driver/install.sh",
      { name: "cua-driver" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class CuaDriver < Formula");
    expect(ruby).toContain('system "bash", cached_download.to_s');
    expect(ruby).toContain('ENV["PREFIX"]');
  });

  it("cua-driver: livecheck references the install script URL", async () => {
    const payload = await collectInstallScriptPayload(
      "https://cua.ai/driver/install.sh",
      { name: "cua-driver" },
    );
    expect(payload.livecheckBlock).toContain("livecheck do");
    expect(payload.livecheckBlock).toContain("cua.ai/driver/install.sh");
  });
});
