import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { npmLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { NpmPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectNpmPackagePayload(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<NpmPackagePayload> {
  const registryBase = process.env.NPM_REGISTRY_URL || "https://registry.npmjs.org";
  const registryUrl = `${registryBase}/${encodeURIComponent(packageName)}`;
  const response = await fetch(registryUrl, {
    headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" },
  });

  if (!response.ok) {
    throw new Error(
      `npm registry lookup failed for ${packageName}: ${response.status}`,
    );
  }

  const pkgData = await response.json();
  const latestVersion = pkgData["dist-tags"]?.latest;
  if (!latestVersion)
    throw new Error(`No latest version found for ${packageName}`);

  const versionData = pkgData.versions[latestVersion];
  const tarballUrl = versionData.dist.tarball;
  const tarballSha = await hashUrl(tarballUrl);

  const name = options.name || toFormulaName(packageName);
  const className = toClassName(name);
  const desc =
    options.desc ||
    pkgData.description ||
    repoInfo?.description ||
    `Install ${packageName}`;
  const homepage =
    pkgData.homepage ||
    repoInfo?.homepage ||
    `https://www.npmjs.com/package/${packageName}`;
  const license = guessLicenseIdentifier(
    versionData.license || pkgData.license || repoInfo?.license,
  );

  const service = serviceFromOptions(options, name);

  const binName = options.binName || extractNpmBinName(versionData, packageName) || name;

  const needsBun = npmPackageNeedsBun(versionData);
  const runtimeDependsLines = needsBun ? `  depends_on "bun"\n` : "";

  return {
    template: "npm_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    url: rubyEscape(tarballUrl),
    sha256: rubyEscape(tarballSha),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(binName),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    livecheckBlock: npmLivecheckBlock(packageName),
    serviceBlock: buildServiceBlock(service, name),
    runtimeDependsLines,
  };
}

/**
 * Extract the primary bin name from npm version data.
 *
 * npm `bin` can be:
 * - A string: `"bin": "cli.js"` → bin name is the package name (last segment
 *   of scoped packages)
 * - An object: `"bin": { "tb": "taskbook.js" }` → bin name is the key (`tb`)
 * - An object with multiple keys: prefer the key matching the package name,
 *   otherwise the first key
 * - Absent: return null (caller falls back to formula name)
 */
export function extractNpmBinName(versionData: any, packageName: string): string | null {
  const bin = versionData?.bin;
  if (!bin) return null;

  if (typeof bin === "string") {
    // When bin is a string, the binary is named after the package
    // (last segment for scoped packages like @org/pkg)
    const lastSegment = packageName.split("/").pop() || packageName;
    return lastSegment;
  }

  if (typeof bin === "object" && !Array.isArray(bin)) {
    const keys = Object.keys(bin);
    if (keys.length === 0) return null;

    // Prefer the key matching the package name (or its last segment)
    const lastSegment = packageName.split("/").pop() || packageName;
    const match = keys.find((k) => k === packageName || k === lastSegment);
    if (match) return match;

    // Otherwise, return the first key
    return keys[0];
  }

  return null;
}


/**
 * True when the package declares a Bun runtime requirement via engines.bun
 * (and does not also declare a Node engines floor that is the primary runtime).
 * Bun-first packages often ship shebangs of `#!/usr/bin/env bun` and fail under Node.
 */
export function npmPackageNeedsBun(versionData: any): boolean {
  const engines = versionData?.engines;
  if (!engines || typeof engines !== "object") return false;
  if (engines.bun == null || engines.bun === "") return false;
  // If node is also required, still add bun when bun is present — runtime shebang may be bun.
  return true;
}

export async function generateNpmPackage(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
) {
  const payload = await collectNpmPackagePayload(
    packageName,
    repoInfo,
    options,
  );
  return writeRenderedFormula(payload, options.tapPath);
}
