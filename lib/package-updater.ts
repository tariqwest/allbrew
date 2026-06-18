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
    case "build-from-source": {
      const { collectBuildFromSourcePayload } = await import("./generators/build-from-source.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const { repoInfo, release } = await githubContext(manifest.source);
      const payload = await collectBuildFromSourcePayload(
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
    case "github-release-cask": {
      const { collectGithubReleaseCaskPayload } = await import("./generators/github-release-cask.ts");
      const { writeRenderedCask } = await import("./template-renderer.ts");
      const { repoInfo, release } = await githubContext(manifest.source);
      const payload = await collectGithubReleaseCaskPayload(repoInfo, release, {
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
    case "script-install": {
      const { collectScriptInstallPayload } = await import("./generators/script-install.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const payload = await collectScriptInstallPayload(String(manifest.source.url), opts);
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: manifest.recordedVersion,
      };
    }
    case "source-archive": {
      const { collectSourceArchivePayload } = await import("./generators/source-archive.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const inspected = await inspectArchive(String(manifest.source.downloadUrl));
      const archiveInfo = {
        ...inspected,
        ...(manifest.source.forcedBuildSystem
          ? { forcedBuildSystem: manifest.source.forcedBuildSystem }
          : {}),
      };
      const payload = await collectSourceArchivePayload(archiveInfo, opts);
      const result = await writeRenderedFormula(payload, manifest.tapPath);
      return {
        name: result.name,
        filePath: result.filePath,
        kind: "formula",
        recordedVersion: manifest.recordedVersion,
      };
    }
    case "raw-binary": {
      const { collectRawBinaryPayload } = await import("./generators/raw-binary.ts");
      const { writeRenderedFormula } = await import("./template-renderer.ts");
      const archiveInfo = await inspectArchive(String(manifest.source.downloadUrl));
      const payload = await collectRawBinaryPayload(
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
    case "mas-app": {
      const { collectMasAppPayload } = await import("./generators/mas-app.ts");
      const { writeRenderedCask } = await import("./template-renderer.ts");
      const payload = await collectMasAppPayload(String(manifest.source.appStoreUrl), opts);
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
    default:
      throw new Error(`Unknown generator: ${manifest.generator}`);
  }
}

async function npmLatestVersion(packageName: string) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
    { headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" } },
  );
  if (!response.ok) throw new Error(`npm lookup failed: ${response.status}`);
  const data = await response.json();
  return String(data.version || "");
}

async function pypiLatestVersion(packageName: string) {
  const response = await fetch(
    `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`,
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
