import type { PackageManifest } from "./manifest.ts";
import { getRepoInfo, getLatestRelease } from "./github.ts";
import { inspectArchive } from "./archive-inspector.ts";
import { extractVersionFromTag } from "./utils.ts";

function parseFullName(fullName: string) {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub full name: ${fullName}`);
  }
  return { owner, repo };
}

async function githubContext(source: Record<string, unknown>) {
  const fullName = String(source.fullName || "");
  const { owner, repo } = parseFullName(fullName);
  const repoInfo = await getRepoInfo(owner, repo);
  const release = await getLatestRelease(owner, repo);
  if (!release) {
    throw new Error(`No GitHub release found for ${fullName}`);
  }
  return { repoInfo, release };
}

async function optionalRepoInfo(source: Record<string, unknown>) {
  const fullName = String(source.fullName || "");
  if (!fullName) return null;
  const { owner, repo } = parseFullName(fullName);
  return getRepoInfo(owner, repo);
}

export type UpdateResult = {
  name: string;
  filePath: string;
  kind: "formula" | "cask";
  recordedVersion: string;
};

export async function updateManagedPackage(
  manifest: PackageManifest,
): Promise<UpdateResult> {
  const opts = { ...manifest.options, tapPath: manifest.tapPath, name: manifest.name };

  switch (manifest.generator) {
    case "npm-package": {
      const { collectNpmPackagePayload } = await import("./generators/npm-package.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const payload = await collectNpmPackagePayload(
        String(manifest.source.packageName),
        null,
        opts,
      );
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: await npmLatestVersion(String(manifest.source.packageName)),
      };
    }
    case "pip-package": {
      const { collectPipPackagePayload } = await import("./generators/pip-package.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const payload = await collectPipPackagePayload(
        String(manifest.source.packageName),
        null,
        opts,
      );
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: await pypiLatestVersion(String(manifest.source.packageName)),
      };
    }
    case "cargo-package": {
      const { collectCargoPackagePayload } = await import("./generators/cargo-package.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const { repoInfo, release } = await githubContext(manifest.source);
      const payload = await collectCargoPackagePayload(repoInfo, release, {
        ...opts,
        crateName: manifest.source.crateName,
      });
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: extractVersionFromTag(release.tagName),
      };
    }
    case "go-package": {
      const { collectGoPackagePayload } = await import("./generators/go-package.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const { repoInfo, release } = await githubContext(manifest.source);
      const payload = await collectGoPackagePayload(repoInfo, release, {
        ...opts,
        goModule: manifest.source.goModule,
      });
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: extractVersionFromTag(release.tagName),
      };
    }
    case "binary-release": {
      const { collectBinaryReleasePayload } = await import("./generators/binary-release.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const { repoInfo, release } = await githubContext(manifest.source);
      const payload = await collectBinaryReleasePayload(repoInfo, release, opts);
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: extractVersionFromTag(release.tagName),
      };
    }
    case "source-build": {
      const { collectSourceBuildPayload } = await import("./generators/source-build.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const { repoInfo, release } = await githubContext(manifest.source);
      const payload = await collectSourceBuildPayload(
        repoInfo,
        release,
        manifest.source.buildSystem,
        opts,
      );
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: extractVersionFromTag(release.tagName),
      };
    }
    case "cask-app-release": {
      const { collectCaskAppReleasePayload } = await import("./generators/cask-app-release.ts");
      const { writeRenderedCask } = await import("./template-renderer.ts");
      const { repoInfo, release } = await githubContext(manifest.source);
      const payload = await collectCaskAppReleasePayload(repoInfo, release, {
        ...opts,
        appName: manifest.source.appName,
      });
      const result = await writeRenderedCask(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "cask",
        recordedVersion: extractVersionFromTag(release.tagName),
      };
    }
    case "install-script": {
      const { collectInstallScriptPayload } = await import("./generators/install-script.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const payload = await collectInstallScriptPayload(String(manifest.source.url), opts);
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: manifest.recordedVersion,
      };
    }
    case "archive-build": {
      const { collectArchiveBuildPayload } = await import("./generators/archive-build.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const inspected = await inspectArchive(String(manifest.source.downloadUrl));
      const archiveInfo = {
        ...inspected,
        ...(manifest.source.forcedBuildSystem
          ? { forcedBuildSystem: manifest.source.forcedBuildSystem }
          : {}),
      };
      const payload = await collectArchiveBuildPayload(archiveInfo, opts);
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: manifest.recordedVersion,
      };
    }
    case "binary-direct": {
      const { collectBinaryDirectPayload } = await import("./generators/binary-direct.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const archiveInfo = await inspectArchive(String(manifest.source.downloadUrl));
      const payload = await collectBinaryDirectPayload(
        archiveInfo,
        manifest.source.selectedBinaries,
        opts,
      );
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: manifest.recordedVersion,
      };
    }
    case "cask-app": {
      const { collectCaskAppPayload } = await import("./generators/cask-app.ts");
      const { writeRenderedCask } = await import("./template-renderer.ts");
      const payload = await collectCaskAppPayload(String(manifest.source.url), {
        ...opts,
        appName: manifest.source.appName,
      });
      const result = await writeRenderedCask(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "cask",
        recordedVersion: manifest.recordedVersion,
      };
    }
    case "cask-app-mas": {
      const { collectCaskAppMasPayload } = await import("./generators/cask-app-mas.ts");
      const { writeRenderedCask } = await import("./template-renderer.ts");
      const payload = await collectCaskAppMasPayload(String(manifest.source.appStoreUrl), opts);
      const result = await writeRenderedCask(payload, manifest.tapPath);
      const appId = String(manifest.source.appStoreUrl).match(/\/id(\d+)/)?.[1];
      const version = appId ? await masLatestVersion(appId) : payload.version;
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "cask",
        recordedVersion: version,
      };
    }
    case "cask-app-setapp": {
      const { collectCaskAppSetappPayload, extractSetappSlug, setappLatestVersion } = await import("./generators/cask-app-setapp.ts");
      const { writeRenderedCask } = await import("./template-renderer.ts");
      const setappUrl = String(manifest.source.setappUrl);
      const payload = await collectCaskAppSetappPayload(setappUrl, opts);
      const result = await writeRenderedCask(payload, manifest.tapPath);
      const slug = extractSetappSlug(setappUrl);
      const version = slug ? await setappLatestVersion(slug) : payload.version;
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "cask",
        recordedVersion: version,
      };
    }
    case "spm-package": {
      const { collectSpmPackagePayload } = await import("./generators/spm-package.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const { repoInfo, release } = await githubContext(manifest.source);
      const payload = await collectSpmPackagePayload(repoInfo, release, opts);
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: extractVersionFromTag(release.tagName),
      };
    }
    case "dotnet-package": {
      const { collectDotnetPackagePayload } = await import("./generators/dotnet-package.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const repoInfo = await optionalRepoInfo(manifest.source);
      const payload = await collectDotnetPackagePayload(
        String(manifest.source.packageName),
        repoInfo,
        opts,
      );
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: payload.version,
      };
    }
    case "gem-package": {
      const { collectGemPackagePayload } = await import("./generators/gem-package.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const repoInfo = await optionalRepoInfo(manifest.source);
      const payload = await collectGemPackagePayload(
        String(manifest.source.gemName),
        repoInfo,
        opts,
      );
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: payload.version,
      };
    }
    case "mint-package": {
      const { collectMintPackagePayload } = await import("./generators/mint-package.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const { repoInfo, release } = await githubContext(manifest.source);
      const payload = await collectMintPackagePayload(repoInfo, release, opts);
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: extractVersionFromTag(release.tagName),
      };
    }
    default:
      throw new Error(`Unknown generator: ${manifest.generator}`);
  }
}

async function npmLatestVersion(packageName: string) {
  const base = process.env.NPM_REGISTRY_URL || "https://registry.npmjs.org";
  const response = await fetch(
    `${base}/${encodeURIComponent(packageName)}/latest`,
    { headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" } },
  );
  if (!response.ok) throw new Error(`npm lookup failed: ${response.status}`);
  const data = await response.json();
  return String(data.version || "");
}

async function pypiLatestVersion(packageName: string) {
  const base = process.env.PYPI_URL || "https://pypi.org";
  const response = await fetch(
    `${base}/pypi/${encodeURIComponent(packageName)}/json`,
    { headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" } },
  );
  if (!response.ok) throw new Error(`PyPI lookup failed: ${response.status}`);
  const data = await response.json();
  return String(data.info?.version || "");
}

async function masLatestVersion(appId: string) {
  const response = await fetch(`https://itunes.apple.com/lookup?id=${appId}`, {
    headers: { "User-Agent": "allbrew/1.0" },
  });
  if (!response.ok) throw new Error(`iTunes lookup failed: ${response.status}`);
  const data = await response.json();
  return String(data.results?.[0]?.version || "");
}
