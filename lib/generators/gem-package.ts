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
import type { GemPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectGemPackagePayload(
  gemName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<GemPackagePayload> {
  const gemData = await fetchRubyGemsData(gemName);
  const version = gemData.version;
  const downloadUrl = gemData.gemUri;
  const sha256 = await hashUrl(downloadUrl);

  const name = options.name || toFormulaName(gemName);
  const className = toClassName(name);
  const desc =
    options.desc ||
    gemData.info ||
    repoInfo?.description ||
    `Install ${gemName} Ruby gem`;
  const homepage =
    gemData.homepageUri ||
    repoInfo?.homepage ||
    repoInfo?.htmlUrl ||
    `https://rubygems.org/gems/${gemName}`;
  const license = guessLicenseIdentifier(
    gemData.licenses?.[0] || repoInfo?.license,
  );

  const urlLines = `  url ${rubyString(downloadUrl)}\n  sha256 ${rubyString(sha256)}\n  version ${rubyString(version)}\n`;

  // Gem executables usually match the gem name (underscores), not the
  // hyphenated Homebrew formula token (e.g. license_finder vs license-finder).
  const primaryBin = options.binName || gemName || name;
  // When formula token ≠ gem bin (underscore/hyphen), also expose formula name
  // so `brew install license-finder` ⇒ `license-finder --version` works for users
  // and for batch strictVerify (command -v $formulaName).
  const binAliasBlock =
    primaryBin && name && primaryBin !== name
      ? `    bin.install_symlink ${rubyString(primaryBin)} => ${rubyString(name)} if (bin/${rubyString(primaryBin)}).exist?\n`
      : "";

  return {
    template: "gem_package",
    name,
    className,
    desc: rubyEscape(collapseDescWhitespace(desc)),
    homepage: rubyEscape(homepage),
    gemName: rubyString(gemName),
    version: rubyEscape(version),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    livecheckBlock: rubyGemsLivecheckBlock(gemName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(primaryBin),
    binAliasBlock,
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

/** Collapse RubyGems multi-line indented `info` into a single-line formula desc. */
function collapseDescWhitespace(text: string): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateGemPackage(
  gemName: string,
  repoInfo: any = null,
  options: any = {},
) {
  const payload = await collectGemPackagePayload(gemName, repoInfo, options);
  return writeRenderedFormula(payload, options.tapPath);
}

async function fetchRubyGemsData(gemName: string) {
  const base = process.env.RUBYGEMS_URL || "https://rubygems.org";
  const url = `${base}/api/v1/gems/${encodeURIComponent(gemName)}.json`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" },
  });
  if (!response.ok) {
    throw new Error(`RubyGems lookup failed for ${gemName}: ${response.status}`);
  }
  const data = await response.json();
  if (!data.version || !data.gem_uri) {
    throw new Error(`Incomplete gem data for ${gemName}`);
  }
  return {
    version: data.version,
    gemUri: data.gem_uri,
    info: data.info,
    homepageUri: data.homepage_uri,
    licenses: data.licenses,
  };
}

function rubyGemsLivecheckBlock(gemName: string) {
  const base = process.env.RUBYGEMS_URL || "https://rubygems.org";
  const url = `${base}/api/v1/gems/${encodeURIComponent(gemName)}.json`;
  return (
    `  livecheck do\n` +
    `    url ${rubyString(url)}\n` +
    `    regex(/"version"\\s*:\\s*"v?([^"\\\\]+)"/i)\n` +
    `  end\n\n`
  );
}
