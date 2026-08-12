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
import { getFileContent } from "../github.ts";
import {
  buildResourcesBlock,
  resolveRequirementLinesToResources,
} from "./pip-package.ts";

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
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  }

  const system = buildSystem?.system || "make";
  let resourcesBlock = "";
  let hasPythonResources = false;

  if (system === "python" && repoInfo?.fullName) {
    const [owner, repo] = String(repoInfo.fullName).split("/");
    if (owner && repo) {
      const reqText = await loadPythonRequirements(owner, repo, release);
      if (reqText) {
        const lines = reqText.split(/\r?\n/);
        try {
          const resources = await resolveRequirementLinesToResources(lines);
          if (resources.length > 0) {
            resourcesBlock = buildResourcesBlock(resources);
            hasPythonResources = true;
          }
        } catch {
          // fall back to no resources
        }
      }
    }
  }

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
    installBody: buildInstallBody(system, { hasPythonResources }),
    livecheckBlock: githubLatestLivecheckBlock(repoInfo.fullName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(options.binName || name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
    isPython: system === "python",
    resourcesBlock,
  };
}

/** Prefer packaged requirements paths; fall back to root requirements.txt. */
async function loadPythonRequirements(
  owner: string,
  repo: string,
  release: any,
): Promise<string | null> {
  const candidates = [
    "contrib/requirements/requirements.txt",
    "requirements.txt",
    "requirements/requirements.txt",
  ];
  // Prefer release-tag content when available (Octokit getContent supports ref).
  const ref = release?.tagName || undefined;
  for (const path of candidates) {
    try {
      const text = ref
        ? await getFileContentAtRef(owner, repo, path, ref)
        : await getFileContent(owner, repo, path);
      if (text && text.trim()) return text;
    } catch {
      // try next
    }
  }
  return null;
}

async function getFileContentAtRef(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    if (ref) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path}`;
      const res = await fetch(rawUrl);
      if (res.ok) return await res.text();
    }
    return await getFileContent(owner, repo, path);
  } catch {
    return await getFileContent(owner, repo, path);
  }
}

function buildDependenciesLines(system: string) {
  const deps = getDependencies(system);
  if (deps.length === 0) return "";
  return deps.map((dep) => `  depends_on ${dep}\n`).join("") + "\n";
}

function buildInstallBody(
  system: string,
  opts: { hasPythonResources?: boolean } = {},
) {
  return getInstallBlock(system, opts);
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
      // electrum_ecc etc. may compile bundled libsecp256k1 from sdist resources.
      return [
        '"autoconf" => :build',
        '"automake" => :build',
        '"libtool" => :build',
        '"pkg-config" => :build',
        '"python@3.13"',
      ];
    default:
      return [];
  }
}

function getInstallBlock(
  system: string,
  opts: { hasPythonResources?: boolean } = {},
) {
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
      if (opts.hasPythonResources) {
        // Offline install mirroring pip-package: wheels must be installed by
        // path (venv.pip_install resource stages some wheels as dirs without
        // setup.py). Inline the wheel handling (no extra formula methods —
        // source_build template only embeds install body).
        return (
          `    venv = virtualenv_create(libexec, "python3.13")\n` +
          `    resources.each do |r|\n` +
          `      url = r.url.to_s\n` +
          `      if url.include?(".whl")\n` +
          `        r.fetch unless r.downloaded?\n` +
          `        path = URI(url).path.to_s\n` +
          `        basename = File.basename(path.empty? ? url : path)\n` +
          `        whl = buildpath/basename\n` +
          `        rm_f whl\n` +
          `        ln_sf r.cached_download, whl\n` +
          `        venv.pip_install whl\n` +
          `      else\n` +
          `        venv.pip_install r\n` +
          `      end\n` +
          `    end\n` +
          // virtualenv_create uses --without-pip; resources install via
          // `python -m pip --python=venv`. Use venv.pip_install_and_link for
          // the main package (libexec/bin/pip may not exist).
          `    venv.pip_install_and_link buildpath\n`
        );
      }
      // No requirements discovered — install with deps (needs network; may fail
      // under brew sandbox). Prefer tag+requirements when possible.
      return (
        `    venv = virtualenv_create(libexec, "python3.13")\n` +
        `    venv.pip_install_and_link buildpath\n`
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
