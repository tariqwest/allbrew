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
import type { DotnetToolPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectDotnetToolPayload(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<DotnetToolPayload> {
  const nugetData = await fetchNugetData(packageName);
  const version = nugetData.version;
  const downloadUrl = `https://www.nuget.org/api/v2/package/${encodeURIComponent(packageName)}/${version}`;
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
    template: "dotnet_tool",
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
    testBinName: rubyEscape(name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateDotnetTool(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
) {
  const payload = await collectDotnetToolPayload(packageName, repoInfo, options);
  return writeRenderedFormula(payload, options.tapPath);
}

async function fetchNugetData(packageName: string) {
  const url = `https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(packageName.toLowerCase())}/index.json`;
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
  return { version: versions[versions.length - 1] };
}

function nugetLivecheckBlock(packageName: string) {
  const url = `https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(packageName.toLowerCase())}/index.json`;
  return (
    `  livecheck do\n` +
    `    url ${rubyString(url)}\n` +
    `    regex(/"([^"\\d]+)?v?(\\d+(?:\\.\\d+)+)"/)\n` +
    `  end\n\n`
  );
}
