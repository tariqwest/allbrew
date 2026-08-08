import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inspectArchive, listDmgAppNames, listZipEntries } from "../../lib/archive-inspector.ts";

const execFileAsync = promisify(execFile);

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "allbrew-archive-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function fakeDownloader(archivePath: string) {
  return async () => ({
    path: archivePath,
    dir: tempDir,
    sha256: "00",
    cleanup: async () => {},
  });
}

describe("inspectArchive", () => {
  it("classifies a safe tar.gz source archive", async () => {
    const archivePath = join(tempDir, "safe.tar.gz");
    await writeFile(join(tempDir, "README.md"), "A tool\n");
    await writeFile(join(tempDir, "main.c"), "int main(){}\n");
    await execFileAsync("tar", [
      "-czf",
      archivePath,
      "-C",
      tempDir,
      "README.md",
      "main.c",
    ]);

    const result = await inspectArchive(
      "file:///ignored/safe.tar.gz",
      fakeDownloader(archivePath),
    );
    expect(result.type).toBe("source");
    expect(result.files).toContain("README.md");
    expect(result.files).toContain("main.c");
  });

  it("rejects a zip with path traversal entries", async () => {
    const archivePath = join(tempDir, "bad.zip");
    await execFileAsync("python3", [
      "-c",
      `import zipfile; z=zipfile.ZipFile('${archivePath}','w'); z.writestr('../evil.txt','evil'); z.close()`,
    ]);

    await expect(
      inspectArchive("file:///ignored/bad.zip", fakeDownloader(archivePath)),
    ).rejects.toThrow(/dangerous paths/);
  });

  it("rejects unsupported archive formats", async () => {
    const archivePath = join(tempDir, "test.7z");
    await writeFile(archivePath, "");

    await expect(
      inspectArchive("file:///ignored/test.7z", fakeDownloader(archivePath)),
    ).rejects.toThrow(/Unsupported archive format/);
  });

  it("prefers outer .app over nested Sparkle Updater.app", async () => {
    const zipRoot = join(tempDir, "popclip-layout");
    await execFileAsync("mkdir", [
      "-p",
      join(zipRoot, "PopClip.app/Contents"),
      join(
        zipRoot,
        "PopClip.app/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app/Contents",
      ),
    ]);
    await writeFile(join(zipRoot, "PopClip.app/Contents/Info.plist"), "<?xml?>\n");
    await writeFile(
      join(
        zipRoot,
        "PopClip.app/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app/Contents/Info.plist",
      ),
      "<?xml?>\n",
    );
    // Walk order often lists Frameworks subtree before sibling Info.plist; force
    // nested plist to appear first in zip entry order.
    const archivePath = join(tempDir, "popclip-sparkle.zip");
    await execFileAsync("python3", [
      "-c",
      `import zipfile, os
root = ${JSON.stringify(zipRoot)}
out = ${JSON.stringify(archivePath)}
nested = "PopClip.app/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app/Contents/Info.plist"
outer = "PopClip.app/Contents/Info.plist"
with zipfile.ZipFile(out, "w") as z:
    z.write(os.path.join(root, nested), nested)
    z.write(os.path.join(root, outer), outer)
`,
    ]);

    const result = await inspectArchive(
      "file:///ignored/popclip-sparkle.zip",
      fakeDownloader(archivePath),
    );
    expect(result.type).toBe("app");
    expect(result.appName).toBe("PopClip.app");
  });
});

describe("listZipEntries", () => {
  it("lists entries from a zip file", async () => {
    const archivePath = join(tempDir, "list.zip");
    await execFileAsync("python3", [
      "-c",
      `import zipfile; z=zipfile.ZipFile('${archivePath}','w'); z.writestr('TestApp.app/Contents/Info.plist',''); z.close()`,
    ]);

    const entries = await listZipEntries(archivePath);
    expect(entries).toContain("TestApp.app/Contents/Info.plist");
  });
});

describe("listDmgAppNames", () => {
  it("returns empty array for a non-existent path", async () => {
    const apps = await listDmgAppNames(join(tempDir, "missing.dmg"));
    expect(apps).toEqual([]);
  });

  it("reads .app bundle name from a real DMG", async () => {
    const srcDir = join(tempDir, "dmg-src");
    const appDir = join(srcDir, "MCP Router.app", "Contents");
    await execFileAsync("mkdir", ["-p", appDir]);
    await writeFile(join(appDir, "Info.plist"), "<?xml version=\"1.0\"?>\n");
    const dmgPath = join(tempDir, "MCP-Router.dmg");
    await execFileAsync("hdiutil", [
      "create",
      "-volname",
      "MCP Router",
      "-srcfolder",
      srcDir,
      "-ov",
      "-format",
      "UDRO",
      dmgPath,
    ]);

    const apps = await listDmgAppNames(dmgPath);
    expect(apps).toContain("MCP Router.app");
  }, 30_000);
});
