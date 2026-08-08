import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { DotnetPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectDotnetPackagePayload(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<DotnetPackagePayload> {
  const nugetData = await fetchNugetData(packageName);
  const version = nugetData.version;
  const nugetBase = process.env.NUGET_URL || "https://www.nuget.org";
  const downloadUrl = `${nugetBase}/api/v2/package/${encodeURIComponent(packageName)}/${version}`;
  const sha256 = await hashUrl(downloadUrl);

  const name = options.name || toFormulaName(packageName);
  const className = toClassName(name);
  const desc =
    options.desc ||
    repoInfo?.description ||
    `Install ${packageName} .NET global tool`;
  const homepage =
    repoInfo?.homepage ||
    repoInfo?.htmlUrl ||
    `https://www.nuget.org/packages/${encodeURIComponent(packageName)}/`;
  const license = guessLicenseIdentifier(repoInfo?.license);

  const urlLines = `  url ${rubyString(downloadUrl)}\n  sha256 ${rubyString(sha256)}\n  version ${rubyString(version)}\n`;

  return {
    template: "dotnet_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    packageName: rubyString(packageName),
    version: rubyEscape(version),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    livecheckBlock: nugetLivecheckBlock(packageName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(options.binName || name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateDotnetPackage(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
) {
  const payload = await collectDotnetPackagePayload(packageName, repoInfo, options);
  return writeRenderedFormula(payload, options.tapPath);
}

/** NuGet SemVer2 prerelease: version contains a hyphen after the numeric core. */
export function isNugetPrerelease(version: string): boolean {
  return typeof version === "string" && version.includes("-");
}

/** Prefer latest stable (non-prerelease); fall back to absolute latest if only prereleases exist. */
export function pickNugetVersion(versions: string[]): string {
  if (!versions || versions.length === 0) {
    throw new Error("No versions found on NuGet");
  }
  for (let i = versions.length - 1; i >= 0; i--) {
    if (!isNugetPrerelease(versions[i])) return versions[i];
  }
  return versions[versions.length - 1];
}

async function fetchNugetData(packageName: string) {
  const base = process.env.NUGET_FLAT_URL || process.env.NUGET_URL || "https://api.nuget.org";
  const url = `${base}/v3-flatcontainer/${encodeURIComponent(packageName.toLowerCase())}/index.json`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" },
  });
  if (!response.ok) {
    throw new Error(`NuGet lookup failed for ${packageName}: ${response.status}`);
  }
  const data = await response.json();
  const versions = data.versions;
  if (!versions || versions.length === 0) {
    throw new Error(`No versions found for ${packageName} on NuGet`);
  }
  return { version: pickNugetVersion(versions) };
}

function nugetLivecheckBlock(packageName: string) {
  const base = process.env.NUGET_FLAT_URL || process.env.NUGET_URL || "https://api.nuget.org";
  const url = `${base}/v3-flatcontainer/${encodeURIComponent(packageName.toLowerCase())}/index.json`;
  return (
    `  livecheck do\n` +
    `    url ${rubyString(url)}\n` +
    `    regex(/"([^"\\d]+)?v?(\\d+(?:\\.\\d+)+)"/)\n` +
    `  end\n\n`
  );
}
