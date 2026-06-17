import {
  toFormulaName,
  toClassName,
  rubyString,
  guessLicenseIdentifier,
  writeFormula,
} from "../utils.js";
import { hashUrl } from "../sha256.js";
import { buildServiceBlock, serviceFromOptions } from "./service.js";

export async function generateNpmPackage(
  packageName,
  repoInfo = null,
  options = {},
) {
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

  let ruby = `class ${className} < Formula\n`;
  ruby += `  desc ${rubyString(desc)}\n`;
  ruby += `  homepage ${rubyString(homepage)}\n`;
  ruby += `  url ${rubyString(tarballUrl)}\n`;
  ruby += `  sha256 ${rubyString(tarballSha)}\n`;
  if (license) ruby += `  license ${rubyString(license)}\n`;
  ruby += `\n`;
  ruby += `  depends_on "node"\n\n`;

  ruby += `  def install\n`;
  ruby += `    system "npm", "install", *std_npm_args\n`;
  ruby += `    bin.install_symlink libexec.glob("bin/*")\n`;
  ruby += `  end\n\n`;

  ruby += buildServiceBlock(serviceFromOptions(options, name), name);

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${name} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  const filePath = await writeFormula(name, ruby, options.tapPath);
  return { filePath, name, className, type: "formula" };
}
