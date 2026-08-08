import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { inspectArchive } from "../../lib/archive-inspector.ts";

describe("archive-inspector Sparkle nested Updater", () => {
  it("prefers outer SaneBar.app over nested Updater.app", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sanebar-ai-"));
    try {
      const nested = join(
        dir,
        "SaneBar.app/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app/Contents",
      );
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(nested, "Info.plist"), "<plist/>");
      writeFileSync(join(dir, "SaneBar.app/Contents/Info.plist"), "<plist/>");
      const zip = join(dir, "SaneBar.zip");
      execFileSync("zip", ["-r", "-q", zip, "SaneBar.app"], { cwd: dir });

      const result = await inspectArchive(`file://${zip}`, async () => ({
        path: zip,
        dir,
        sha256: "a".repeat(64),
        cleanup: async () => {},
      }));
      expect(result.type).toBe("app");
      expect(result.appName).toBe("SaneBar.app");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
