import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { githubLatestLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { SpmPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectSpmPackagePayload(
  repoInfo: any,
  release: any,
  options: any = {},
): Promise<SpmPackagePayload> {
  const name = options.name || toFormulaName(repoInfo.name);
  const className = toClassName(name);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const license = guessLicenseIdentifier(repoInfo.license);
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;

  let sourceUrl: string | null = null;
  let version: string;
  if (release) {
    version = release.tagName.replace(/^v/, "");
    sourceUrl =
      release.tarballUrl ||
      `https://github.com/${repoInfo.fullName}/archive/refs/tags/${release.tagName}.tar.gz`;
  } else {
    version = "HEAD";
  }

  let urlLines = "";
  if (sourceUrl && version !== "HEAD") {
    const sha256 = await hashUrl(sourceUrl);
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  }

  const binTarget = options.binName || repoInfo.name || name;
  const binInstallPaths = rubyString(`.build/release/${binTarget}`);

  return {
    template: "spm_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    fullName: rubyEscape(repoInfo.fullName),
    defaultBranch: rubyEscape(repoInfo.defaultBranch),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    binInstallPaths,
    livecheckBlock: githubLatestLivecheckBlock(),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(binTarget),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateSpmPackage(
  repoInfo: any,
  release: any,
  options: any = {},
) {
  const payload = await collectSpmPackagePayload(repoInfo, release, options);
  return writeRenderedFormula(payload, options.tapPath);
}
