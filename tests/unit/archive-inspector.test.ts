import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  inspectArchive,
  listDmgAppNames,
  listZipEntries,
  pickPrimaryAppBundleName,
  findAppBundleNameInMembers,
} from "../../lib/archive-inspector.ts";

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
});

describe("pickPrimaryAppBundleName", () => {
  it("prefers product app over Updater/Metadata siblings (iA Writer class)", () => {
    const paths = [
      "Updater.app/Contents/Info.plist",
      "Metadata.app/Contents/Info.plist",
      "iA Writer.app/Contents/Info.plist",
    ];
    expect(pickPrimaryAppBundleName(paths)).toBe("iA Writer.app");
  });

  it("prefers top-level app over nested helper", () => {
    const paths = [
      "Foo.app/Contents/Frameworks/Sparkle.framework/Updater.app/Contents/Info.plist",
      "Foo.app/Contents/Info.plist",
    ];
    expect(pickPrimaryAppBundleName(paths)).toBe("Foo.app");
  });
});

describe("findAppBundleNameInMembers", () => {
  it("detects top-level .app dir entries (go2tv-style zip listing)", () => {
    const members = [
      "go2tv.app/",
      "go2tv.app/Contents/",
      "go2tv.app/Contents/MacOS/go2tv",
      "go2tv.app/Contents/Info.plist",
      "LICENSE",
      "README.md",
    ];
    expect(findAppBundleNameInMembers(members)).toBe("go2tv.app");
  });

  it("detects nested .app/Contents paths without a bare .app/ entry", () => {
    expect(
      findAppBundleNameInMembers([
        "go2tv.app/Contents/MacOS/go2tv",
        "go2tv.app/Contents/Info.plist",
        "LICENSE",
      ]),
    ).toBe("go2tv.app");
  });

  it("returns null for CLI binary archives", () => {
    expect(
      findAppBundleNameInMembers([
        "gogs",
        "LICENSE",
        "README.md",
        "templates/home.tmpl",
      ]),
    ).toBeNull();
  });

  it("skips secondary helper app names when a product app is present", () => {
    expect(
      findAppBundleNameInMembers([
        "Updater.app/",
        "go2tv.app/",
        "go2tv.app/Contents/Info.plist",
      ]),
    ).toBe("go2tv.app");
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
