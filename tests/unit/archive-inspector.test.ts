import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inspectArchive, listZipEntries } from "../../lib/archive-inspector.ts";

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
