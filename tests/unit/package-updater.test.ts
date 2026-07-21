import { describe, it, expect, mock, beforeEach } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PackageManifest } from "../../lib/manifest.ts";
import { updateManagedPackage } from "../../lib/package-updater.ts";

const BARTENDER_HTML = `<!DOCTYPE html>
<html><head>
<meta name="description" content="Clean up and superpower your menu bar">
</head><body>
<h1>Bartender Pro</h1>
<p>Version 6.5.2</p>
</body></html>`;

describe("updateManagedPackage — cask-app-setapp", () => {
  let tapPath: string;

  beforeEach(async () => {
    mock.restore();
    tapPath = await mkdtemp(join(tmpdir(), "allbrew-tap-"));
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(BARTENDER_HTML),
      }),
    ) as any;
  });

  it("regenerates cask from manifest and returns latest version", async () => {
    const manifest: PackageManifest = {
      name: "bartender",
      kind: "cask",
      generator: "cask-app-setapp",
      tapPath,
      source: {
        setappUrl: "https://setapp.com/apps/bartender",
        appName: "Bartender Pro",
      },
      options: {},
      recordedVersion: "6.5.1",
      recordedAt: new Date().toISOString(),
    };

    const result = await updateManagedPackage(manifest);
    expect(result.kind).toBe("cask");
    expect(result.name).toBe("bartender");
    expect(result.recordedVersion).toBe("6.5.2");

    const ruby = await readFile(result.filePath, "utf-8");
    expect(ruby).toContain('cask "bartender" do');
    expect(ruby).toContain('depends_on formula: "setapp-cli"');
    expect(ruby).toContain('args: ["install", "Bartender Pro"]');
  });

  it("cleans up generated cask file", async () => {
    const manifest: PackageManifest = {
      name: "bartender",
      kind: "cask",
      generator: "cask-app-setapp",
      tapPath,
      source: { setappUrl: "https://setapp.com/apps/bartender" },
      options: {},
      recordedVersion: "6.5.1",
      recordedAt: new Date().toISOString(),
    };

    const result = await updateManagedPackage(manifest);
    await rm(result.filePath, { force: true });
    await rm(tapPath, { recursive: true, force: true });
    expect(result.filePath).toContain("bartender.rb");
  });
});
