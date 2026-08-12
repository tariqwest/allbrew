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
    discover: _discover,
    noDiscover: _noDiscover,
    ...rest
  } = opts;
  // Preserve discovery provenance when present (page → resolved artifact).
  return rest;
}

function withDiscoveryFields(
  source: Record<string, unknown>,
  opts: Record<string, unknown>,
) {
  const out: Record<string, unknown> = { ...source };
  if (opts.sourceUrl) out.sourceUrl = opts.sourceUrl;
  if (opts.resolvedUrl) out.resolvedUrl = opts.resolvedUrl;
  if (opts.discoverMethod) out.discoverMethod = opts.discoverMethod;
  return out;
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
    case "source-build":
      return {
        fullName: repoInfo?.fullName,
        defaultBranch: repoInfo?.defaultBranch || "main",
        buildSystem: params.buildSystem,
        releaseTag: release?.tagName || null,
      };
    case "cask-app-release":
      return {
        fullName: repoInfo?.fullName,
        releaseTag: release?.tagName,
        appName: opts.appName || params.appName || null,
      };
    case "install-script":
      return withDiscoveryFields({ url: params.url }, opts);
    case "archive-build":
      return withDiscoveryFields(
        {
          downloadUrl: archiveInfo?.downloadUrl,
          forcedBuildSystem: archiveInfo?.forcedBuildSystem || null,
        },
        opts,
      );
    case "binary-direct":
      return withDiscoveryFields(
        {
          downloadUrl: archiveInfo?.downloadUrl,
          selectedBinaries:
            params.selectedBinaries || archiveInfo?.binaries || null,
        },
        opts,
      );
    case "cask-app":
      return withDiscoveryFields(
        {
          url: params.url,
          appName: params.appName || opts.appName || null,
        },
        opts,
      );
    case "cask-app-mas":
      return { appStoreUrl: params.url };
    case "cask-app-setapp":
      return {
        setappUrl: params.url,
        appName: params.appName || null,
      };

    case "homebrew-formula":
      return withDiscoveryFields(
        { name: params.name, source: "homebrew" },
        opts,
      );

    case "homebrew-cask":
      return withDiscoveryFields(
        { name: params.name, source: "homebrew" },
        opts,
      );

    case "spm-package":
      return {
        fullName: repoInfo?.fullName,
        defaultBranch: repoInfo?.defaultBranch || "main",
        releaseTag: release?.tagName || null,
      };
    case "dotnet-package":
      return {
        packageName: params.packageName,
        fullName: repoInfo?.fullName || null,
      };
    case "gem-package":
      return {
        gemName: params.gemName,
        fullName: repoInfo?.fullName || null,
      };
    case "mint-package":
      return {
        fullName: repoInfo?.fullName,
        defaultBranch: repoInfo?.defaultBranch || "main",
        releaseTag: release?.tagName || null,
      };
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
  if (
    (generatorName === "cask-app-mas" ||
      generatorName === "cask-app-setapp" ||
      generatorName === "homebrew-formula" ||
      generatorName === "homebrew-cask") &&
    params.version
  ) {
    return String(params.version);
  }
  return "";
}
