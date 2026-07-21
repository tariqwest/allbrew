import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { goModuleLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { GoPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectGoPackagePayload(
  repoInfo: any,
  release: any = null,
  options: any = {},
): Promise<GoPackagePayload> {
  const name = options.name || toFormulaName(repoInfo.name);
  const className = toClassName(name);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const license = guessLicenseIdentifier(repoInfo.license);
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;
  const goModule = options.goModule || `github.com/${repoInfo.fullName}`;

  let urlLines = "";
  if (release) {
    const sourceUrl = release.tarballUrl || `https://github.com/${repoInfo.fullName}/archive/refs/tags/${release.tagName}.tar.gz`;
    const sha256 = await hashUrl(sourceUrl);
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  }

  return {
    template: "go_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    fullName: rubyEscape(repoInfo.fullName),
    defaultBranch: rubyEscape(repoInfo.defaultBranch),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    livecheckBlock: goModuleLivecheckBlock(goModule),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(options.binName || name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateGoPackage(
  repoInfo: any,
  release: any = null,
  options: any = {},
) {
  const payload = await collectGoPackagePayload(repoInfo, release, options);
  return writeRenderedFormula(payload, options.tapPath);
}
