import {
  toFormulaName,
  toClassName,
  extractVersionFromTag,
  rubyString,
  guessLicenseIdentifier,
  writeFormula,
} from "../utils.js";
import { hashUrl } from "../sha256.js";
import { buildServiceBlock, serviceFromOptions } from "./service.js";

export async function generateBuildFromSource(
  repoInfo,
  release,
  buildSystem,
  options = {},
) {
  const name = options.name || toFormulaName(repoInfo.name);
  const className = toClassName(name);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const license = guessLicenseIdentifier(repoInfo.license);
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;

  let sourceUrl, version;
  if (release) {
    version = extractVersionFromTag(release.tagName);
    sourceUrl =
      release.tarballUrl ||
      `https://github.com/${repoInfo.fullName}/archive/refs/tags/${release.tagName}.tar.gz`;
  } else {
    version = "HEAD";
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

  if (sourceUrl && version !== "HEAD") {
    ruby += `  url ${rubyString(sourceUrl)}\n`;
    ruby += `  sha256 ${rubyString(sha256)}\n`;
  }

  ruby += `  head "https://github.com/${repoInfo.fullName}.git", branch: "${repoInfo.defaultBranch}"\n\n`;

  const system = buildSystem?.system || "make";

  const deps = getDependencies(system);
  for (const dep of deps) {
    ruby += `  depends_on ${dep}\n`;
  }
  if (deps.length > 0) ruby += `\n`;

  ruby += `  def install\n`;
  ruby += getInstallBlock(system, name);
  ruby += `  end\n\n`;

  ruby += buildServiceBlock(serviceFromOptions(options, name), name);

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${name} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  const filePath = await writeFormula(name, ruby, options.tapPath);
  return { filePath, name, className, type: "formula" };
}

function getDependencies(system) {
  switch (system) {
    case "cmake":
      return ['"cmake" => :build', '"pkg-config" => :build'];
    case "autotools":
      return [
        '"autoconf" => :build',
        '"automake" => :build',
        '"pkg-config" => :build',
      ];
    case "meson":
      return [
        '"meson" => :build',
        '"ninja" => :build',
        '"pkg-config" => :build',
      ];
    case "go":
      return ['"go" => :build'];
    default:
      return [];
  }
}

function getInstallBlock(system, name) {
  switch (system) {
    case "cmake":
      return (
        `    system "cmake", "-S", ".", "-B", "build", *std_cmake_args\n` +
        `    system "cmake", "--build", "build"\n` +
        `    system "cmake", "--install", "build"\n`
      );
    case "autotools":
      return (
        `    system "./configure", "--disable-silent-rules", *std_configure_args\n` +
        `    system "make", "install"\n`
      );
    case "meson":
      return (
        `    system "meson", "setup", "build", *std_meson_args\n` +
        `    system "meson", "compile", "-C", "build"\n` +
        `    system "meson", "install", "-C", "build"\n`
      );
    case "go":
      return `    system "go", "build", *std_go_args(ldflags: "-s -w")\n`;
    default:
      return `    system "make", "PREFIX=#{prefix}", "install"\n`;
  }
}
