import {
  toFormulaName,
  toClassName,
  extractVersionFromTag,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import { githubLatestLivecheckBlock } from "./livecheck.ts";
import type { SourceBuildPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export async function collectSourceBuildPayload(
  repoInfo: any,
  release: any,
  buildSystem: any,
  options: any = {},
): Promise<SourceBuildPayload> {
  const name = options.name || toFormulaName(repoInfo.name);
  const className = toClassName(name);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const license = guessLicenseIdentifier(repoInfo.license);
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;

  let sourceUrl: string | null = null;
  let version: string;
  if (release) {
    version = extractVersionFromTag(release.tagName);
    sourceUrl =
      release.tarballUrl ||
      `https://github.com/${repoInfo.fullName}/archive/refs/tags/${release.tagName}.tar.gz`;
  } else {
    version = "HEAD";
  }

  let urlLines = "";
  if (sourceUrl && version !== "HEAD") {
    const sha256 = await hashUrl(sourceUrl);
    // Branch archives (refs/heads/...) do not embed a version Homebrew can parse —
    // always emit an explicit version stanza when we have one from the release tag.
    urlLines =
      `  url ${rubyString(sourceUrl)}\n` +
      `  version ${rubyString(version)}\n` +
      `  sha256 ${rubyString(sha256)}\n`;
  }

  const system = buildSystem?.system || "make";

  const testBinName = options.binName || name;
  return {
    template: "source_build",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    fullName: rubyEscape(repoInfo.fullName),
    defaultBranch: rubyEscape(repoInfo.defaultBranch),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    dependenciesLines: buildDependenciesLines(system),
    installBody: buildInstallBody(system, testBinName, options.pipExtras),
    livecheckBlock: githubLatestLivecheckBlock(repoInfo.fullName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(testBinName),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
    isPython: system === "python",
  };
}

function buildDependenciesLines(system: string) {
  const deps = getDependencies(system);
  if (deps.length === 0) return "";
  return deps.map((dep) => `  depends_on ${dep}\n`).join("") + "\n";
}

function buildInstallBody(system: string, binName?: string, pipExtras?: string) {
  return getInstallBlock(system, binName, pipExtras);
}

function getDependencies(system: string): string[] {
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
    case "python":
      return ['"python@3.12"'];
    default:
      return [];
  }
}

function getInstallBlock(system: string, binName?: string, pipExtras?: string) {
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
    case "python": {
      // Prefer stdlib venv (includes pip) over virtualenv_create (--without-pip +
      // Homebrew pip_install forces --no-deps). Only symlink the package console
      // script so we do not collide with python@*/bin/python3.x.
      // pipExtras: optional-dependency groups (e.g. "evaluation") for packages
      // that import optional deps at module load (trae-agent → docker).
      const script = rubyEscape(binName || "python");
      const extras = String(pipExtras || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const pipTarget =
        extras.length > 0
          ? `"#{buildpath}[${extras.join(",")}]"`
          : "buildpath";
      return (
        `    system "python3.12", "-m", "venv", libexec\n` +
        `    system libexec/"bin/pip", "install", "-v", ${pipTarget}\n` +
        `    bin.install_symlink libexec/"bin/${script}"\n`
      );
    }
    default:
      return `    system "make", "PREFIX=#{prefix}", "install"\n`;
  }
}

export async function generateSourceBuild(
  repoInfo: any,
  release: any,
  buildSystem: any,
  options: any = {},
) {
  const payload = await collectSourceBuildPayload(
    repoInfo,
    release,
    buildSystem,
    options,
  );
  return writeRenderedFormula(payload, options.tapPath);
}
