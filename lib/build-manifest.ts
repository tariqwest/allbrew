import type { GeneratorName, PackageKind, PackageManifest } from "./manifest.ts";
import { extractVersionFromTag } from "./utils.ts";

type BuildManifestInput = {
  generatorName: GeneratorName;
  params: Record<string, unknown>;
  opts: Record<string, unknown>;
  result: { name: string; type: PackageKind; recordedVersion?: string };
};

export function buildManifest(input: BuildManifestInput): PackageManifest {
  const { generatorName, params, opts, result } = input;
  const source = buildSource(generatorName, params, opts);
  const options = buildOptions(opts);
  const recordedVersion =
    result.recordedVersion || inferRecordedVersion(generatorName, params);

  return {
    name: result.name,
    kind: result.type,
    generator: generatorName,
    tapPath: String(opts.tapPath || ""),
    source,
    options,
    recordedVersion,
    recordedAt: new Date().toISOString(),
  };
}

function buildOptions(opts: Record<string, unknown>) {
  const {
    tapPath: _tapPath,
    token: _token,
    verbose: _verbose,
    manual: _manual,
    ...rest
  } = opts;
  return rest;
}

function buildSource(
  generatorName: GeneratorName,
  params: Record<string, unknown>,
  opts: Record<string, unknown>,
) {
  const repoInfo = params.repoInfo as Record<string, unknown> | undefined;
  const release = params.release as Record<string, unknown> | undefined;
  const archiveInfo = params.archiveInfo as Record<string, unknown> | undefined;

  switch (generatorName) {
    case "npm-package":
      return { packageName: params.packageName };
    case "pip-package":
      return { packageName: params.packageName };
    case "cargo-package":
      return {
        fullName: repoInfo?.fullName,
        crateName: params.crateName || opts.crateName || repoInfo?.name,
        defaultBranch: repoInfo?.defaultBranch || "main",
        releaseTag: release?.tagName || null,
      };
    case "go-package":
      return {
        fullName: repoInfo?.fullName,
        goModule:
          params.goModule ||
          opts.goModule ||
          (repoInfo ? `github.com/${repoInfo.fullName}` : null),
        defaultBranch: repoInfo?.defaultBranch || "main",
        releaseTag: release?.tagName || null,
      };
    case "binary-release":
      return {
        fullName: repoInfo?.fullName,
        releaseTag: release?.tagName,
      };
    case "build-from-source":
      return {
        fullName: repoInfo?.fullName,
        defaultBranch: repoInfo?.defaultBranch || "main",
        buildSystem: params.buildSystem,
        releaseTag: release?.tagName || null,
      };
    case "github-release-cask":
      return {
        fullName: repoInfo?.fullName,
        releaseTag: release?.tagName,
        appName: opts.appName || params.appName || null,
      };
    case "script-install":
      return { url: params.url };
    case "source-archive":
      return {
        downloadUrl: archiveInfo?.downloadUrl,
        forcedBuildSystem: archiveInfo?.forcedBuildSystem || null,
      };
    case "raw-binary":
      return {
        downloadUrl: archiveInfo?.downloadUrl,
        selectedBinaries:
          params.selectedBinaries || archiveInfo?.binaries || null,
      };
    case "cask-app":
      return {
        url: params.url,
        appName: params.appName || opts.appName || null,
      };
    case "mas-app":
      return { appStoreUrl: params.url };
    default:
      return {};
  }
}

function inferRecordedVersion(
  generatorName: GeneratorName,
  params: Record<string, unknown>,
) {
  const release = params.release as Record<string, unknown> | undefined;
  if (release?.tagName) {
    return extractVersionFromTag(String(release.tagName));
  }
  if (generatorName === "mas-app" && params.version) {
    return String(params.version);
  }
  return "";
}
