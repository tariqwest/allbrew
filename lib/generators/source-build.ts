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
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  }

  const system = buildSystem?.system || "make";
  const pythonFormula =
    system === "python"
      ? selectHomebrewPythonFormula(
          options.pythonFormula ||
            options.requiresPython ||
            buildSystem?.requiresPython ||
            null,
        )
      : null;

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
    dependenciesLines: buildDependenciesLines(system, pythonFormula),
    installBody: buildInstallBody(system, pythonFormula),
    livecheckBlock: githubLatestLivecheckBlock(repoInfo.fullName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(options.binName || name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
    isPython: system === "python",
  };
}

/**
 * Parse PEP 621 `requires-python` from a pyproject.toml body (best-effort).
 * Returns the raw specifier string (e.g. ">=3.11,<3.13") or null.
 */
export function parseRequiresPythonFromPyproject(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  // [project] requires-python = ">=3.11,<3.13"
  const m = String(text).match(
    /^\s*requires-python\s*=\s*["']([^"']+)["']/im,
  );
  return m ? m[1].trim() : null;
}

/**
 * Map a requires-python specifier (or explicit python@X.Y) to a Homebrew
 * python formula token. Prefer the newest commonly bottled version that
 * still satisfies an upper bound (e.g. ">=3.11,<3.13" → python@3.12).
 */
export function selectHomebrewPythonFormula(
  requiresPythonOrFormula: string | null | undefined,
): string {
  const raw = String(requiresPythonOrFormula || "").trim();
  if (/^python@\d+\.\d+$/.test(raw)) return raw;

  // Candidates newest-first (Homebrew bottles these).
  const candidates = ["3.13", "3.12", "3.11", "3.10"];
  if (!raw) return "python@3.13";

  for (const ver of candidates) {
    if (versionSatisfiesRequiresPython(ver, raw)) return `python@${ver}`;
  }
  // Spec too tight / unparseable — keep historical default.
  return "python@3.13";
}

/** True when version (e.g. "3.12") satisfies a simple requires-python spec. */
export function versionSatisfiesRequiresPython(
  version: string,
  spec: string,
): boolean {
  const parts = String(spec)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return true;
  const ver = parseLooseVersion(version);
  for (const part of parts) {
    const m = part.match(/^(==|!=|<=|>=|<|>|~=)\s*(.+)$/);
    if (!m) continue;
    const op = m[1];
    const bound = parseLooseVersion(m[2]);
    const cmp = compareLooseVersions(ver, bound);
    switch (op) {
      case "==":
        if (cmp !== 0) return false;
        break;
      case "!=":
        if (cmp === 0) return false;
        break;
      case ">=":
        if (cmp < 0) return false;
        break;
      case ">":
        if (cmp <= 0) return false;
        break;
      case "<=":
        if (cmp > 0) return false;
        break;
      case "<":
        if (cmp >= 0) return false;
        break;
      case "~=": {
        // Compatible release: >=bound, ==bound.major.minor.*
        if (cmp < 0) return false;
        if (ver[0] !== bound[0] || ver[1] !== bound[1]) return false;
        break;
      }
    }
  }
  return true;
}

function parseLooseVersion(v: string): number[] {
  const cleaned = String(v)
    .trim()
    .replace(/^v/i, "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((n) => parseInt(n, 10));
  return cleaned.length ? cleaned : [0];
}

function compareLooseVersions(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function buildDependenciesLines(
  system: string,
  pythonFormula: string | null,
) {
  const deps = getDependencies(system, pythonFormula);
  if (deps.length === 0) return "";
  return deps.map((dep) => `  depends_on ${dep}\n`).join("") + "\n";
}

function buildInstallBody(system: string, pythonFormula: string | null) {
  return getInstallBlock(system, pythonFormula);
}

function getDependencies(
  system: string,
  pythonFormula: string | null,
): string[] {
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
      return [`"${pythonFormula || "python@3.13"}"`];
    default:
      return [];
  }
}

function getInstallBlock(system: string, pythonFormula: string | null) {
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
      // python@3.12 → python3.12 for virtualenv_create
      const formula = pythonFormula || "python@3.13";
      const pyBin = formula.replace(/^python@/, "python");
      return (
        `    venv = virtualenv_create(libexec, "${pyBin}")\n` +
        `    system libexec/"bin/pip", "install", "-v", "--no-deps", "--ignore-installed", "."\n` +
        `    bin.install_symlink Dir["#{libexec}/bin/*"]\n`
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
