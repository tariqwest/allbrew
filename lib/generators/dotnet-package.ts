import { execFileSync } from "node:child_process";
import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { downloadToTemp } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { DotnetPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

/** Matches `<packageType name="DotnetTool" />` (and attribute-order variants). */
const DOTNET_TOOL_PACKAGE_TYPE_RE =
  /<packageType\b[^>]*\bname\s*=\s*["']DotnetTool["'][^>]*\/?>/i;

/** Extracts the first `<Command Name="..." />` from a DotnetToolSettings.xml. */
const COMMAND_NAME_RE = /<Command\s+Name\s*=\s*["']([^"']+)["']/i;

/** Extracts a `<repository url="..." />` hint from a nuspec. */
const REPOSITORY_URL_RE = /<repository\b[^>]*\burl\s*=\s*["']([^"']+)["']/i;

/** NuGet stable versions have no pre-release suffix (no `-...`). */
const STABLE_VERSION_RE = /^\d+(?:\.\d+)+$/;

/** macOS RIDs that make a .NET global tool runnable on Apple Silicon / Intel. */
const MACOS_RIDS = new Set(["any", "osx-x64", "osx-arm64"]);

export async function collectDotnetPackagePayload(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<DotnetPackagePayload> {
  const id = packageName.toLowerCase();
  const { version } = await fetchNugetData(packageName);

  const flatBase = getNugetFlatBase();
  const nuspec = await fetchNuspec(packageName, version, flatBase);
  const repoUrl = nuspec.match(REPOSITORY_URL_RE)?.[1] || "";

  if (!DOTNET_TOOL_PACKAGE_TYPE_RE.test(nuspec)) {
    const binaryHint = repoUrl
      ? ` If a CLI binary is published on GitHub Releases, try the release URL instead (${repoUrl}).`
      : "";
    throw new Error(
      `NuGet package ${packageName}@${version} is not a .NET global tool ` +
        `(missing packageType DotnetTool). allbrew only supports DotnetTool ` +
        `packages from nuget.org; libraries and other package types cannot be ` +
        `installed via \`dotnet tool install\`.${binaryHint}`,
    );
  }

  const nugetBase = process.env.NUGET_URL || "https://www.nuget.org";
  const downloadUrl = `${nugetBase}/api/v2/package/${encodeURIComponent(id)}/${version}`;

  const { sha256, path, cleanup } = await downloadToTemp(
    downloadUrl,
    `${id}-${version}.nupkg`,
  );

  let toolCommand: string | null = null;
  let supportedRids: string[] = [];
  try {
    ({ toolCommand, supportedRids } = extractDotnetToolSettings(path));
  } catch {
    /* extraction is best-effort; formula install has a fallback */
  } finally {
    await cleanup();
  }

  const hasMacSupport =
    supportedRids.length === 0 ||
    supportedRids.some((rid) => MACOS_RIDS.has(rid));
  if (!hasMacSupport) {
    throw new Error(
      `NuGet package ${packageName}@${version} does not provide a macOS ` +
        `runtime identifier (expected any, osx-x64, or osx-arm64). allbrew can ` +
        `only package .NET global tools that run on macOS.`,
    );
  }

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

  const urlLines =
    `  url ${rubyString(downloadUrl)}\n  sha256 ${rubyString(sha256)}\n  version ${rubyString(version)}\n`;

  const resolvedToolCommand =
    toolCommand ||
    options.binName ||
    name;

  return {
    template: "dotnet_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    packageName: rubyString(packageName),
    packageId: rubyString(id),
    version: rubyEscape(version),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    livecheckBlock: nugetLivecheckBlock(packageName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(options.binName || name),
    toolCommand: rubyString(resolvedToolCommand),
    rollForward: "LatestMajor",
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateDotnetPackage(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
) {
  const payload = await collectDotnetPackagePayload(
    packageName,
    repoInfo,
    options,
  );
  return writeRenderedFormula(payload, options.tapPath);
}

function getNugetFlatBase(): string {
  return (
    process.env.NUGET_FLAT_URL ||
    process.env.NUGET_URL ||
    "https://api.nuget.org"
  );
}

function resolveDotnetVersion(versions: string[]): string {
  if (!versions || versions.length === 0) {
    throw new Error("No versions found");
  }
  const stable = versions.filter((v) => STABLE_VERSION_RE.test(v));
  if (stable.length > 0) {
    return stable[stable.length - 1];
  }
  return versions[versions.length - 1];
}

async function fetchNugetData(packageName: string) {
  const base = getNugetFlatBase();
  const id = packageName.toLowerCase();
  const url = `${base}/v3-flatcontainer/${encodeURIComponent(id)}/index.json`;
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
  return { version: resolveDotnetVersion(versions) };
}

async function fetchNuspec(
  packageName: string,
  version: string,
  base: string,
): Promise<string> {
  const id = packageName.toLowerCase();
  const nuspecUrl =
    `${base}/v3-flatcontainer/${encodeURIComponent(id)}/` +
    `${encodeURIComponent(version)}/${encodeURIComponent(id)}.nuspec`;
  const response = await fetch(nuspecUrl, {
    headers: {
      Accept: "application/xml, text/xml, */*",
      "User-Agent": "allbrew/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(
      `NuGet nuspec lookup failed for ${packageName}@${version}: ${response.status}`,
    );
  }
  return response.text();
}

function extractDotnetToolSettings(nupkgPath: string): {
  toolCommand: string | null;
  supportedRids: string[];
} {
  const xml = readZipEntry(nupkgPath, "*/DotnetToolSettings.xml");
  if (!xml) {
    return { toolCommand: null, supportedRids: [] };
  }

  const commandMatch = xml.match(COMMAND_NAME_RE);
  const toolCommand = commandMatch ? commandMatch[1] : null;

  const rids: string[] = [];
  const ridRe =
    /<RuntimeIdentifierPackage\s+RuntimeIdentifier\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = ridRe.exec(xml)) !== null) {
    rids.push(m[1]);
  }

  return { toolCommand, supportedRids: rids };
}

function readZipEntry(nupkgPath: string, pattern: string): string | null {
  try {
    const out = execFileSync("unzip", ["-p", nupkgPath, pattern], {
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 2_000_000,
    });
    return out.replace(/^\uFEFF/, "").trim() || null;
  } catch {
    return null;
  }
}

function nugetLivecheckBlock(packageName: string) {
  const base = getNugetFlatBase();
  const url =
    `${base}/v3-flatcontainer/${encodeURIComponent(packageName.toLowerCase())}/index.json`;
  return (
    `  livecheck do\n` +
    `    url ${rubyString(url)}\n` +
    `    regex(/"([^"\\d]+)?v?(\\d+(?:\\.\\d+)+)"/)\n` +
    `  end\n\n`
  );
}
