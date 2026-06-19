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
import type { MintPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectMintPayload(
  repoInfo: any,
  release: any,
  options: any = {},
): Promise<MintPayload> {
  const name = options.name || toFormulaName(repoInfo.name);
  const className = toClassName(name);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const license = guessLicenseIdentifier(repoInfo.license);
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;

  let sourceUrl: string | null = null;
  if (release) {
    sourceUrl =
      release.tarballUrl ||
      `https://github.com/${repoInfo.fullName}/archive/refs/tags/${release.tagName}.tar.gz`;
  }

  let urlLines = "";
  if (sourceUrl) {
    const sha256 = await hashUrl(sourceUrl);
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  }

  const binName = options.binName || repoInfo.name || name;

  return {
    template: "mint",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    fullName: rubyEscape(repoInfo.fullName),
    defaultBranch: rubyEscape(repoInfo.defaultBranch),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    binName: rubyEscape(binName),
    livecheckBlock: githubLatestLivecheckBlock(),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(binName),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateMint(
  repoInfo: any,
  release: any,
  options: any = {},
) {
  const payload = await collectMintPayload(repoInfo, release, options);
  return writeRenderedFormula(payload, options.tapPath);
}
