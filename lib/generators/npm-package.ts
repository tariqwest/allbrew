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
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
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

  return {
    template: "npm_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    url: rubyEscape(tarballUrl),
    sha256: rubyEscape(tarballSha),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(name),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    livecheckBlock: npmLivecheckBlock(packageName),
    serviceBlock: buildServiceBlock(service, name),
  };
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
