import { describe, it, expect } from "vitest";
import { collectScriptInstallPayload } from "../../lib/generators/script-install.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: downloads real install scripts, validates SHA + Ruby output.
 * Run: bun run test:int
 */

describe.concurrent("script-install integration", () => {
  it("starship install.sh: payload is well-formed", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
      { name: "starship", desc: "The minimal, blazing-fast, and infinitely customizable prompt" },
    );
    expect(payload.template).toBe("script_install");
    expect(payload.name).toBe("starship");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.scriptFilename).toBe("install.sh");
    expect(payload.url).toBe("https://starship.rs/install.sh");
  });

  it("starship: generates structurally valid Ruby formula", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
      { name: "starship" },
    );
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Starship < Formula");
    expect(ruby).toContain('system "bash", "install.sh"');
    expect(ruby).toContain('ENV["PREFIX"]');
  });

  it("starship: livecheck block references the script URL", async () => {
    const payload = await collectScriptInstallPayload(
      "https://starship.rs/install.sh",
    );
    expect(payload.livecheckBlock).toContain("starship.rs/install.sh");
  });

  it("raw github install script: resolves to valid payload", async () => {
    const payload = await collectScriptInstallPayload(
      "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh",
      { name: "ohmyzsh" },
    );
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
  });

  it("uv: installer script resolves to valid payload", async () => {
    const payload = await collectScriptInstallPayload(
      "https://astral.sh/uv/install.sh",
      { name: "uv" },
    );
    expect(payload.template).toBe("script_install");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Uv < Formula");
  });

  it("devbox: launcher script (no .sh) resolves to valid payload", async () => {
    const payload = await collectScriptInstallPayload(
      "https://get.jetify.com/devbox",
      { name: "devbox" },
    );
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
  });

  it("volta: no .sh extension resolves to valid payload", async () => {
    const payload = await collectScriptInstallPayload(
      "https://get.volta.sh",
      { name: "volta" },
    );
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
  });
});
