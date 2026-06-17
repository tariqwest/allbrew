import {
  toFormulaName,
  toClassName,
  extractVersionFromTag,
  rubyString,
  guessLicenseIdentifier,
  writeFormula,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { goModuleLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";

export async function generateGoPackage(
  repoInfo: any,
  release: any = null,
  options: any = {},
) {
  const name = options.name || toFormulaName(repoInfo.name);
  const className = toClassName(name);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const license = guessLicenseIdentifier(repoInfo.license);
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;
  const goModule = options.goModule || `github.com/${repoInfo.fullName}`;

  let sourceUrl, version;
  if (release) {
    version = extractVersionFromTag(release.tagName);
    sourceUrl = `https://github.com/${repoInfo.fullName}/archive/refs/tags/${release.tagName}.tar.gz`;
  } else {
    version = null;
    sourceUrl = null;
  }

  let sha256 = null;
  if (sourceUrl) {
    sha256 = await hashUrl(sourceUrl);
  }

  let ruby = `class ${className} < Formula\n`;
  ruby += `  desc ${rubyString(desc)}\n`;
  ruby += `  homepage ${rubyString(homepage)}\n`;
  if (license) ruby += `  license ${rubyString(license)}\n`;

  if (sourceUrl) {
    ruby += `  url ${rubyString(sourceUrl)}\n`;
    ruby += `  sha256 ${rubyString(sha256)}\n`;
  }

  ruby += `  head "https://github.com/${repoInfo.fullName}.git", branch: "${repoInfo.defaultBranch}"\n\n`;

  ruby += goModuleLivecheckBlock(goModule);
  ruby += `  depends_on "go" => :build\n\n`;

  ruby += `  def install\n`;
  ruby += `    system "go", "install", *std_go_args(ldflags: "-s -w")\n`;
  ruby += `  end\n\n`;

  ruby += buildServiceBlock(serviceFromOptions(options, name), name);

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${name} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  const filePath = await writeFormula(name, ruby, options.tapPath);
  return { filePath, name, className, type: "formula" };
}
