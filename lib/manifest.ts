import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, readdir, writeFile, unlink, rename } from "node:fs/promises";

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
  | "homebrew-formula"
  | "homebrew-cask"
  | "spm-package"
  | "dotnet-package"
  | "gem-package"
  | "mint-package";

/** Extra provenance captured when page discovery resolved an artifact URL. */
export type DiscoveryFields = {
  sourceUrl?: string;
  resolvedUrl?: string;
  discoverMethod?: string;
};

type GithubRepoSource = {
  fullName?: string | null;
  defaultBranch?: string | null;
  releaseTag?: string | null;
};

/** Per-generator re-generation inputs persisted with each manifest. */
export type ManifestSourceMap = {
  "npm-package": { packageName?: string | null };
  "pip-package": { packageName?: string | null };
  "cargo-package": GithubRepoSource & { crateName?: string | null };
  "go-package": GithubRepoSource & { goModule?: string | null };
  "binary-release": { fullName?: string | null; releaseTag?: string | null };
  "source-build": GithubRepoSource & { buildSystem?: string | null };
  "cask-app-release": {
    fullName?: string | null;
    releaseTag?: string | null;
    appName?: string | null;
  };
  "install-script": { url?: string | null } & DiscoveryFields;
  "archive-build": {
    downloadUrl?: string | null;
    forcedBuildSystem?: string | null;
  } & DiscoveryFields;
  "binary-direct": {
    downloadUrl?: string | null;
    selectedBinaries?: string[] | null;
  } & DiscoveryFields;
  "cask-app": { url?: string | null; appName?: string | null } & DiscoveryFields;
  "cask-app-mas": { appStoreUrl?: string | null };
  "cask-app-setapp": { setappUrl?: string | null; appName?: string | null };
  "homebrew-formula": { name?: string | null; source?: string | null } & DiscoveryFields;
  "homebrew-cask": { name?: string | null; source?: string | null } & DiscoveryFields;
  "spm-package": GithubRepoSource;
  "dotnet-package": { packageName?: string | null; fullName?: string | null };
  "gem-package": { gemName?: string | null; fullName?: string | null };
  "mint-package": GithubRepoSource;
};

export type ManifestSource = ManifestSourceMap[GeneratorName];

export type PackageManifest = {
  name: string;
  kind: PackageKind;
  tapPath: string;
  options: Record<string, unknown>;
  recordedVersion: string;
  recordedAt: string;
} & {
  [G in GeneratorName]: { generator: G; source: ManifestSourceMap[G] };
}[GeneratorName];

const DEFAULT_PACKAGES_DIR = join(homedir(), ".config", "allbrew", "packages");

let _packagesDir = DEFAULT_PACKAGES_DIR;

function manifestPath(name: string) {
  return join(_packagesDir, `${name}.json`);
}

export async function saveManifest(manifest: PackageManifest) {
  await mkdir(_packagesDir, { recursive: true });
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
  } catch (err) {
    if (err instanceof SyntaxError) {
      const backupPath = `${manifestPath(name)}.corrupted`;
      await rename(manifestPath(name), backupPath).catch(() => {});
      console.warn(
        `[allbrew] Warning: manifest for "${name}" is corrupted and has been moved to ${backupPath}. ` +
          `It will no longer be managed. Error: ${err.message}`,
      );
    }
    return null;
  }
}

export async function listManifests(): Promise<PackageManifest[]> {
  try {
    const files = await readdir(_packagesDir);
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
  return _packagesDir;
}

/** @internal Test-only: override the packages directory. */
export function _setPackagesDirForTesting(dir: string) {
  _packagesDir = dir;
}

/** @internal Test-only: restore the default packages directory. */
export function _resetPackagesDirForTesting() {
  _packagesDir = DEFAULT_PACKAGES_DIR;
}
