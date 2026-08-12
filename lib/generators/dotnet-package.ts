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

  const toolCommand = await fetchDotnetToolCommand(packageName, version, downloadUrl);

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

  const testBinName = options.binName || name;
  const resolvedToolCommand = toolCommand || testBinName;

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
    testBinName: rubyEscape(testBinName),
    toolCommand: rubyEscape(resolvedToolCommand),
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
  return { version: versions[versions.length - 1] };
}

async function fetchDotnetToolCommand(packageName: string, version: string, downloadUrl: string): Promise<string | null> {
  try {
    const res = await fetch(downloadUrl, { headers: { "User-Agent": "allbrew/1.0" } });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const text = new TextDecoder().decode(bytes);
    const m = text.match(/DotnetToolSettings\.xml[\s\S]*?<Command\s+Name="([^"]+)"/);
    if (m) return m[1];
    const m2 = text.match(/<Command\s+Name="([^"]+)"/);
    if (m2) return m2[1];
    return null;
  } catch {
    return null;
  }
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
