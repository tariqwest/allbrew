import { describe, it, expect } from "bun:test";
import { inspectArchive } from "../../lib/archive-inspector.ts";
import { collectBinaryDirectPayload } from "../../lib/generators/binary-direct.ts";
import { renderFormula } from "../../lib/template-renderer.ts";
import { assertValidFormula } from "./helpers/validate-ruby.ts";

/**
 * Tier 2 — Integration: downloads a real prebuilt binary archive, inspects it, validates formula.
 * Run: bun run test:int
 */

const starshipBinaryUrl =
  "https://github.com/starship/starship/releases/download/v1.19.0/starship-aarch64-apple-darwin.tar.gz";

describe.concurrent("binary-direct integration", () => {
  it("starship: archive inspection classifies as binary", async () => {
    const archiveInfo = await inspectArchive(starshipBinaryUrl);
    expect(archiveInfo.type).toBe("binary");
    expect(archiveInfo.binaries?.length ?? 0).toBeGreaterThan(0);
    expect(archiveInfo.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("starship: payload fields are well-formed", async () => {
    const archiveInfo = await inspectArchive(starshipBinaryUrl);
    const payload = await collectBinaryDirectPayload(archiveInfo, null, {
      name: "starship",
    });
    expect(payload.template).toBe("binary_direct");
    expect(payload.name).toBe("starship");
    expect(payload.className).toBe("Starship");
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.installBody).toContain("bin.install");
  });

  it("starship: generates structurally valid Ruby formula", async () => {
    const archiveInfo = await inspectArchive(starshipBinaryUrl);
    const payload = await collectBinaryDirectPayload(archiveInfo, null, {
      name: "starship",
    });
    const ruby = renderFormula(payload);
    assertValidFormula(ruby);
    expect(ruby).toContain("class Starship < Formula");
    expect(ruby).toContain("bin.install");
  });
});
