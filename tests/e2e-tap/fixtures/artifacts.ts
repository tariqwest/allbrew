import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const execFileAsync = promisify(execFile);

const FIXED_MTIME = new Date("2024-01-01T00:00:00Z");

export type ArtifactResult = {
  buffer: Buffer;
  sha256: string;
  filename: string;
};

async function makeTempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function normalizeMtimes(dir: string, mtime = FIXED_MTIME) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    await utimes(fullPath, mtime, mtime);
    if (entry.isDirectory()) {
      await normalizeMtimes(fullPath, mtime);
    }
  }
}

async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(fullPath, base));
    } else {
      results.push("." + fullPath.slice(base.length));
    }
  }
  return results;
}

async function createTarball(srcDir: string, filename: string): Promise<ArtifactResult> {
  const tmpDir = await makeTempDir("allbrew-artifact-");
  const archivePath = join(tmpDir, filename);
  const listPath = join(tmpDir, "filelist.txt");

  await normalizeMtimes(srcDir);
  const files = (await listFilesRecursive(srcDir)).sort();
  await writeFile(listPath, files.join("\n") + "\n");

  const tarPath = join(tmpDir, "archive.tar");
  await execFileAsync("tar", [
    "--numeric-owner",
    "--format=ustar",
    "-cf",
    tarPath,
    "-C",
    srcDir,
    "-T",
    listPath,
  ]);
  await execFileAsync("gzip", ["-n", tarPath]);

  const buffer = await readFile(`${tarPath}.gz`);
  await rm(tmpDir, { recursive: true, force: true });
  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    filename,
  };
}

async function createZip(srcDir: string, filename: string): Promise<ArtifactResult> {
  const tmpDir = await makeTempDir("allbrew-artifact-");
  const archivePath = join(tmpDir, filename);

  await normalizeMtimes(srcDir);
  const files = (await listFilesRecursive(srcDir)).sort();
  await execFileAsync("zip", ["-r", "-q", archivePath, ...files], { cwd: srcDir });

  const buffer = await readFile(archivePath);
  await rm(tmpDir, { recursive: true, force: true });
  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    filename,
  };
}

export async function buildBinaryTarball(
  name: string,
  version: string,
  archSuffix: string,
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-bin-");
  await writeFile(
    join(srcDir, name),
    `#!/bin/sh\necho "${name} ${version}"\n`,
    { mode: 0o755 },
  );
  const filename = `${name}-${version}-${archSuffix}.tar.gz`;
  return createTarball(srcDir, filename);
}

export async function buildServiceBinaryTarball(
  name: string,
  version: string,
  archSuffix: string,
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-svc-bin-");
  await writeFile(
    join(srcDir, name),
    `#!/bin/sh\nPORT="\${1:-\${PORT:-8080}}"\npython3 -c 'import http.server,socketserver,sys\nport=int(sys.argv[1])\nclass H(http.server.BaseHTTPRequestHandler):\n def do_GET(self):\n  self.send_response(200)\n  self.end_headers()\n  self.wfile.write(b"ok")\n def log_message(self,*a):pass\nsocketserver.TCPServer(("127.0.0.1",port),H).serve_forever()' "$PORT"\n`,
    { mode: 0o755 },
  );
  const filename = `${name}-${version}-${archSuffix}.tar.gz`;
  return createTarball(srcDir, filename);
}

export async function buildSourceTarball(
  name: string,
  version: string,
  buildSystem: string = "make",
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-src-");
  const topDir = `${name}-${version}`;
  const innerDir = join(srcDir, topDir);
  await mkdir(innerDir, { recursive: true });

  await mkdir(join(innerDir, "bin"), { recursive: true });
  await writeFile(
    join(innerDir, "bin", name),
    `#!/bin/sh\necho "${name} ${version}"\n`,
    { mode: 0o755 },
  );

  if (buildSystem === "make") {
    await writeFile(
      join(innerDir, "Makefile"),
      `PREFIX ?= /usr/local\ninstall:\n\tmkdir -p $(DESTDIR)$(PREFIX)/bin\n\tcp bin/${name} $(DESTDIR)$(PREFIX)/bin/${name}\n\tchmod +x $(DESTDIR)$(PREFIX)/bin/${name}\n`,
    );
  } else if (buildSystem === "cmake") {
    await writeFile(
      join(innerDir, "CMakeLists.txt"),
      `cmake_minimum_required(VERSION 3.10)\nproject(${name} VERSION ${version})\ninstall(PROGRAMS bin/${name} DESTINATION bin)\n`,
    );
  } else if (buildSystem === "autotools") {
    await writeFile(join(innerDir, "configure"), `#!/bin/sh\nmkdir -p "$PREFIX/bin"\ncp bin/${name} "$PREFIX/bin/${name}"\nchmod +x "$PREFIX/bin/${name}"\n`, { mode: 0o755 });
    await writeFile(join(innerDir, "Makefile"), `PREFIX ?= /usr/local\ninstall:\n\tmkdir -p $(DESTDIR)$(PREFIX)/bin\n\tcp bin/${name} $(DESTDIR)$(PREFIX)/bin/${name}\n\tchmod +x $(DESTDIR)$(PREFIX)/bin/${name}\n`);
  }

  const filename = `${topDir}.tar.gz`;
  return createTarball(srcDir, filename);
}

export async function buildInstallScript(
  name: string,
  version: string,
): Promise<ArtifactResult> {
  const script = `#!/bin/sh\nset -e\nmkdir -p "$PREFIX/bin"\ncat > "$PREFIX/bin/${name}" << 'BINARY_EOF'\n#!/bin/sh\necho "${name} ${version}"\nBINARY_EOF\nchmod +x "$PREFIX/bin/${name}"\n`;
  const buffer = Buffer.from(script, "utf-8");
  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    filename: `${name}-${version}.sh`,
  };
}

export async function buildNpmTarball(
  packageName: string,
  version: string,
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-npm-");
  const pkgDir = join(srcDir, "package");
  await mkdir(pkgDir, { recursive: true });

  await writeFile(
    join(pkgDir, "package.json"),
    JSON.stringify({
      name: packageName,
      version,
      description: `Fake npm package ${packageName}`,
      bin: { [packageName]: `${packageName}.sh` },
      license: "MIT",
    }, null, 2),
  );

  await writeFile(
    join(pkgDir, `${packageName}.sh`),
    `#!/bin/sh\necho "${packageName} ${version}"\n`,
    { mode: 0o755 },
  );

  const filename = `${packageName}-${version}.tgz`;
  return createTarball(pkgDir, filename);
}

export async function buildPipSdist(
  packageName: string,
  version: string,
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-pip-");
  const topDir = `${packageName}-${version}`;
  const innerDir = join(srcDir, topDir);
  await mkdir(innerDir, { recursive: true });

  await writeFile(
    join(innerDir, "setup.py"),
    `from setuptools import setup\nsetup(\n    name="${packageName}",\n    version="${version}",\n    py_modules=["${packageName.replace(/-/g, "_")}"],\n    entry_points={"console_scripts": ["${packageName}=${packageName.replace(/-/g, "_")}:main"]},\n)\n`,
  );

  await writeFile(
    join(innerDir, `${packageName.replace(/-/g, "_")}.py`),
    `def main():\n    print("${packageName} ${version}")\n`,
  );

  const filename = `${topDir}.tar.gz`;
  return createTarball(srcDir, filename);
}

export async function buildCrateTarball(
  crateName: string,
  version: string,
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-crate-");
  const crateDir = join(srcDir, crateName);
  await mkdir(join(crateDir, "src"), { recursive: true });

  await writeFile(
    join(crateDir, "Cargo.toml"),
    `[package]\nname = "${crateName}"\nversion = "${version}"\nedition = "2021"\n\n[dependencies]\n`,
  );

  await writeFile(
    join(crateDir, "src", "main.rs"),
    `fn main() {\n    println!("${crateName} ${version}");\n}\n`,
  );

  const filename = `${crateName}-${version}.crate`;
  return createTarball(crateDir, filename);
}

export async function buildGoModuleZip(
  modulePath: string,
  version: string,
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-go-");
  const modDir = modulePath.replace(/\/$/, "");
  const dirStructure = join(srcDir, modDir, "@v");
  await mkdir(dirStructure, { recursive: true });

  await writeFile(
    join(dirStructure, "go.mod"),
    `module ${modDir}\n\ngo 1.21\n`,
  );

  await mkdir(join(dirStructure, "src"), { recursive: true });
  await writeFile(
    join(dirStructure, "main.go"),
    `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("${modDir.split("/").pop()} ${version}")\n}\n`,
  );

  const filename = `${version}.zip`;
  return createZip(dirStructure, filename);
}

export async function buildGemFile(
  gemName: string,
  version: string,
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-gem-");
  const gemDir = join(srcDir, gemName);
  await mkdir(gemDir, { recursive: true });

  await writeFile(
    join(gemDir, `${gemName}.gemspec`),
    `Gem::Specification.new do |s|\n  s.name = "${gemName}"\n  s.version = "${version}"\n  s.summary = "Fake gem"\n  s.files = ["lib/${gemName}.rb"]\n  s.executables = ["${gemName}"]\nend\n`,
  );

  await mkdir(join(gemDir, "lib"), { recursive: true });
  await writeFile(
    join(gemDir, "lib", `${gemName}.rb`),
    `puts "${gemName} ${version}"\n`,
  );

  await mkdir(join(gemDir, "bin"), { recursive: true });
  await writeFile(
    join(gemDir, "bin", gemName),
    `#!/usr/bin/env ruby\nputs "${gemName} ${version}"\n`,
    { mode: 0o755 },
  );

  await execFileAsync("gem", ["build", `${gemName}.gemspec`], { cwd: gemDir });
  const gemPath = join(gemDir, `${gemName}-${version}.gem`);
  const buffer = await readFile(gemPath);
  await rm(srcDir, { recursive: true, force: true });
  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    filename: `${gemName}-${version}.gem`,
  };
}

export async function buildNupkg(
  packageName: string,
  version: string,
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-nuget-");
  const pkgDir = join(srcDir, "package");
  await mkdir(pkgDir, { recursive: true });

  await writeFile(
    join(pkgDir, `${packageName}.nuspec`),
    `<?xml version="1.0"?>\n<package>\n  <metadata>\n    <id>${packageName}</id>\n    <version>${version}</version>\n    <description>Fake NuGet package</description>\n  </metadata>\n</package>\n`,
  );

  const filename = `${packageName}.${version}.nupkg`;
  return createZip(pkgDir, filename);
}

export async function buildDmg(
  appName: string,
  version: string,
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-dmg-");
  const appBundle = join(srcDir, `${appName}.app`);
  const contentsDir = join(appBundle, "Contents");
  const macosDir = join(contentsDir, "MacOS");
  await mkdir(macosDir, { recursive: true });

  await writeFile(
    join(contentsDir, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>CFBundleName</key>\n  <string>${appName}</string>\n  <key>CFBundleShortVersionString</key>\n  <string>${version}</string>\n  <key>CFBundleIdentifier</key>\n  <string>com.fake.${appName.toLowerCase()}</string>\n</dict>\n</plist>\n`,
  );

  await writeFile(
    join(macosDir, appName),
    `#!/bin/sh\necho "${appName} ${version}"\n`,
    { mode: 0o755 },
  );

  const dmgPath = join(srcDir, `${appName}-${version}.dmg`);
  await execFileAsync("hdiutil", [
    "create", "-volname", appName, "-srcfolder", appBundle,
    "-fs", "HFS+", "-format", "UDZO", dmgPath,
  ]);

  const buffer = await readFile(dmgPath);
  await rm(srcDir, { recursive: true, force: true });
  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    filename: `${appName}-${version}.dmg`,
  };
}

export async function buildZipApp(
  appName: string,
  version: string,
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-zipapp-");
  const appBundle = join(srcDir, `${appName}.app`);
  const contentsDir = join(appBundle, "Contents");
  const macosDir = join(contentsDir, "MacOS");
  await mkdir(macosDir, { recursive: true });

  await writeFile(
    join(contentsDir, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>CFBundleName</key>\n  <string>${appName}</string>\n  <key>CFBundleShortVersionString</key>\n  <string>${version}</string>\n  <key>CFBundleIdentifier</key>\n  <string>com.fake.${appName.toLowerCase()}</string>\n</dict>\n</plist>\n`,
  );

  await writeFile(
    join(macosDir, appName),
    `#!/bin/sh\necho "${appName} ${version}"\n`,
    { mode: 0o755 },
  );

  const filename = `${appName}-${version}-macos.zip`;
  return createZip(srcDir, filename);
}

export async function buildGenericArchive(
  name: string,
  version: string,
  ext: string = "tar.gz",
): Promise<ArtifactResult> {
  const srcDir = await makeTempDir("allbrew-gen-");
  await mkdir(join(srcDir, "bin"), { recursive: true });
  await writeFile(
    join(srcDir, "bin", name),
    `#!/bin/sh\necho "${name} ${version}"\n`,
    { mode: 0o755 },
  );
  await writeFile(
    join(srcDir, "Makefile"),
    `PREFIX ?= /usr/local\ninstall:\n\tmkdir -p $(DESTDIR)$(PREFIX)/bin\n\tcp bin/${name} $(DESTDIR)$(PREFIX)/bin/${name}\n\tchmod +x $(DESTDIR)$(PREFIX)/bin/${name}\n`,
  );

  const filename = `${name}-${version}.${ext}`;
  if (ext === "zip") {
    return createZip(srcDir, filename);
  }
  return createTarball(srcDir, filename);
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
