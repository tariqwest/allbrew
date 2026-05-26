import { toFormulaName, toClassName, extractVersionFromTag, rubyString, guessLicenseIdentifier, writeFormula } from '../utils.js';
import { hashUrl } from '../sha256.js';

export async function generateCargoPackage(repoInfo, release = null, options = {}) {
  const name = options.name || toFormulaName(repoInfo.name);
  const className = toClassName(name);
  const desc = options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const license = guessLicenseIdentifier(repoInfo.license);
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;

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

  ruby += `  depends_on "rust" => :build\n\n`;

  ruby += `  def install\n`;
  ruby += `    system "cargo", "install", *std_cargo_args\n`;
  ruby += `  end\n\n`;

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${name} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  const filePath = await writeFormula(name, ruby, options.tapPath);
  return { filePath, name, className, type: 'formula' };
}
