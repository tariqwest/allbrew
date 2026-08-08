import {
  toFormulaName,
  toClassName,
  extractVersionFromTag,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
  matchAssetToArch,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import { githubLatestLivecheckBlock } from "./livecheck.ts";
import type { SourceBuildPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

/** Prefer uploaded release source archives (with configure/dist files) over API tarballs. */
export function pickReleaseSourceArchiveUrl(
  release: any,
  repoInfo: any,
): string | null {
  if (!release) return null;
  const version = extractVersionFromTag(release.tagName || "");
  const project = String(repoInfo?.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const assets = Array.isArray(release.assets) ? release.assets : [];

  const sourceExt = /\.(tar\.gz|tgz|tar\.bz2|tar\.xz)$/i;
  const platformToken =
    /(?:^|[^a-z])(?:linux|darwin|macos|osx|windows|win32|win64|freebsd|android|iphoneos)(?:[^a-z]|$)/i;
  const cpuToken =
    /(?:^|[^a-z])(?:amd64|arm64|aarch64|x86_64|x64|i386|i686|armv\d+)(?:[^a-z]|$)/i;

  const candidates = assets.filter((a: any) => {
    const name = String(a?.name || "");
    if (!sourceExt.test(name)) return false;
    if (matchAssetToArch(name)) return false;
    if (platformToken.test(name) && cpuToken.test(name)) return false;
    if (cpuToken.test(name)) return false;
    // Skip pure checksum sidecar names if they slipped through
    if (/\.(sha256|sha512|sig|asc)$/i.test(name)) return false;
    return Boolean(a.url);
  });

  if (candidates.length === 0) {
    return (
      release.tarballUrl ||
      (repoInfo?.fullName && release.tagName
        ? `https://github.com/${repoInfo.fullName}/archive/refs/tags/${release.tagName}.tar.gz`
        : null)
    );
  }

  const score = (name: string) => {
    const lower = name.toLowerCase();
    let s = 0;
    const compact = lower.replace(/[^a-z0-9]+/g, "");
    if (project && compact.includes(project)) s += 50;
    if (version && lower.includes(version.toLowerCase())) s += 30;
    // Prefer project-version style dist tarballs over generic names
    if (new RegExp(`${project}[-_.]?${version}`, "i").test(lower)) s += 40;
    if (platformToken.test(lower)) s -= 20;
    return s;
  };

  candidates.sort(
    (a: any, b: any) => score(b.name) - score(a.name) || a.name.localeCompare(b.name),
  );
  return candidates[0].url;
}

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
    sourceUrl = pickReleaseSourceArchiveUrl(release, repoInfo);
  } else {
    version = "HEAD";
  }

  let urlLines = "";
  if (sourceUrl && version !== "HEAD") {
    const sha256 = await hashUrl(sourceUrl);
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  }

  const system = buildSystem?.system || "make";

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
    installBody: buildInstallBody(system),
    livecheckBlock: githubLatestLivecheckBlock(repoInfo.fullName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(options.binName || name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
    isPython: system === "python",
  };
}

function buildDependenciesLines(system: string) {
  const deps = getDependencies(system);
  if (deps.length === 0) return "";
  return deps.map((dep) => `  depends_on ${dep}\n`).join("") + "\n";
}

function buildInstallBody(system: string) {
  return getInstallBlock(system);
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
      return ['"python@3.13"'];
    default:
      return [];
  }
}

function getInstallBlock(system: string) {
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
    case "python":
      return (
        `    venv = virtualenv_create(libexec, "python3.13")\n` +
        `    system libexec/"bin/pip", "install", "-v", "--no-deps", "--ignore-installed", "."\n` +
        `    bin.install_symlink Dir["#{libexec}/bin/*"]\n`
      );
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
