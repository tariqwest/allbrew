import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";

export type PackageKind = "formula" | "cask";

export type GeneratorName =
  | "binary-release"
  | "source-build"
  | "npm-package"
  | "pip-package"
  | "cargo-package"
  | "go-package"
  | "install-script"
  | "archive-build"
  | "binary-direct"
  | "cask-app"
  | "cask-app-release"
  | "cask-app-mas"
  | "cask-app-setapp"
  | "spm-package"
  | "dotnet-package"
  | "gem-package"
  | "mint-package";

export type PackageManifest = {
  name: string;
  kind: PackageKind;
  generator: GeneratorName;
  tapPath: string;
  source: Record<string, unknown>;
  options: Record<string, unknown>;
  recordedVersion: string;
  recordedAt: string;
};

const PACKAGES_DIR = join(homedir(), ".config", "allbrew", "packages");

function manifestPath(name: string) {
  return join(PACKAGES_DIR, `${name}.json`);
}

export async function saveManifest(manifest: PackageManifest) {
  await mkdir(PACKAGES_DIR, { recursive: true });
  await writeFile(
    manifestPath(manifest.name),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}

export async function loadManifest(
  name: string,
): Promise<PackageManifest | null> {
  try {
    const data = await readFile(manifestPath(name), "utf-8");
    return JSON.parse(data) as PackageManifest;
  } catch {
    return null;
  }
}

export async function listManifests(): Promise<PackageManifest[]> {
  try {
    const files = await readdir(PACKAGES_DIR);
    const manifests: PackageManifest[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const manifest = await loadManifest(file.replace(/\.json$/, ""));
      if (manifest) manifests.push(manifest);
    }
    return manifests;
  } catch {
    return [];
  }
}

export async function deleteManifest(name: string) {
  try {
    await unlink(manifestPath(name));
  } catch {
    // ignore
  }
}

export function getPackagesDir() {
  return PACKAGES_DIR;
}
