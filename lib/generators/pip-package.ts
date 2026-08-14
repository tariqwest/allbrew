import { arch as osArch } from "node:os";
import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { pypiLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { PipPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

/** Default Python version for pip formulas (`depends_on "python@3.13"`). */
export const PIP_FORMULA_PYTHON = { major: 3, minor: 13 } as const;

export type PipFormulaPython = { major: number; minor: number };

/** Homebrew python@X.Y candidates, newest first. */
export const PIP_FORMULA_PYTHON_CANDIDATES: readonly PipFormulaPython[] = [
  { major: 3, minor: 13 },
  { major: 3, minor: 12 },
  { major: 3, minor: 11 },
  { major: 3, minor: 10 },
] as const;

/**
 * Active formula Python for the current collectPipPackagePayload pass.
 * Used by wheel scoring / marker evaluation so requires_python <3.13 packages
 * (e.g. pyqt-openai) do not select cp313-only wheels while depending on 3.12.
 */
let activePipFormulaPython: PipFormulaPython = { ...PIP_FORMULA_PYTHON };

export function getActivePipFormulaPython(): PipFormulaPython {
  return activePipFormulaPython;
}

/**
 * Pick the newest Homebrew Python that satisfies PyPI requires_python.
 * e.g. "<3.13,>=3.10" → 3.12 (not 3.13).
 */
export function selectPipFormulaPython(
  requiresPython: string | null | undefined,
): PipFormulaPython {
  const raw = String(requiresPython || "").trim();
  if (!raw) return { ...PIP_FORMULA_PYTHON };
  const constraint = parseVersionConstraint(raw);
  if (!constraint.clauses.length) return { ...PIP_FORMULA_PYTHON };
  for (const cand of PIP_FORMULA_PYTHON_CANDIDATES) {
    const ver = `${cand.major}.${cand.minor}`;
    if (versionSatisfies(ver, constraint)) {
      return { major: cand.major, minor: cand.minor };
    }
  }
  return { ...PIP_FORMULA_PYTHON };
}

/**
 * Runtime deps that packages import but omit from requires_dist.
 * shell-gpt imports click directly; typer>=0.26 vendors click and no longer
 * declares it, so transitive resolution never pulls it in.
 */
export const UNDECLARED_RUNTIME_DEPS: Record<string, string[]> = {
  "shell-gpt": ["click"],
  // chainlit / elia / mlflow-class packages often omit tight runtime pins that
  // surface only after console_scripts import; keep high-value complements here.
  elia: ["textual", "textual-plotext", "pyperclip"],
  chainlit: ["uvicorn", "literalai", "fastapi", "starlette", "watchfiles"],
  // literalai publishes requires_dist: null; setup.py still declares deps
  // (chainlit hard-pins literalai==0.1.201). Without traceloop-sdk, import fails.
  literalai: [
    "chevron",
    "httpx",
    "packaging",
    "pydantic",
    "traceloop-sdk",
  ],
  mlflow: ["pyyaml", "click", "cloudpickle", "entrypoints", "gitpython", "sqlalchemy"],
};

/**
 * Homebrew formula deps required when certain PyPI resources are present
 * (native extension build deps).
 */
export const RESOURCE_SYSTEM_DEPS: Record<string, string[]> = {
  pyaudio: ["portaudio"],
};

/** Console-script names that differ from the PyPI/distribution name. */
export const KNOWN_BIN_NAMES: Record<string, string> = {
  "shell-gpt": "sgpt",
  graphifyy: "graphify",
  "nanobot-ai": "nanobot",
  "pyqt-openai": "pyqt-openai",
  // console_scripts entry is `tl` (Textualize terminal log viewer)
  toolong: "tl",
};

/**
 * Root PyPI extras activated at install time (docs recommend pip install pkg[extra]).
 * Without a Qt binding, tabulous/napari console entries cannot import.
 */
export const KNOWN_ROOT_EXTRAS: Record<string, string[]> = {
  napari: ["pyqt6"],
  tabulous: ["pyqt5"],
  "pyqt-openai": ["full"],
  elia: [],
  chainlit: [],
};

/**
 * Import path for version checks when the console_scripts entry is a GUI launcher
 * (or otherwise hangs / opens a window on --version / --help).
 */
export const KNOWN_PYTHON_IMPORT_VERSION_TEST: Record<string, string> = {
  napari: "napari",
  tabulous: "tabulous",
  "pyqt-openai": "pyqt_openai",
  elia: "elia_chat",
  chainlit: "chainlit",
  mlflow: "mlflow",
};

type PypiUrl = {
  packagetype?: string;
  python_version?: string;
  filename?: string;
  url?: string;
  yanked?: boolean;
  digests?: { sha256?: string };
};

type PypiPackageJson = {
  info: {
    name?: string;
    version?: string;
    summary?: string;
    home_page?: string | null;
    project_url?: string | null;
    license?: string | null;
    requires_dist?: string[] | null;
    requires_python?: string | null;
  };
  urls?: PypiUrl[];
  releases?: Record<string, PypiUrl[]>;
};

export type PypiGithubIdentityResult = {
  matches: boolean;
  packageName: string;
  reason: string;
  /** Present when PyPI returned 200; null when missing or lookup failed. */
  pypiData: PypiPackageJson | null;
};

/**
 * Collect candidate URLs from a PyPI info block (home_page, project_url, project_urls).
 * Used to verify a GitHub-derived package name is not a registry name collision.
 */
export function collectPypiProjectUrls(info: {
  home_page?: string | null;
  project_url?: string | null;
  project_urls?: Record<string, string | null> | null;
} | null | undefined): string[] {
  if (!info) return [];
  const out: string[] = [];
  for (const v of [info.home_page, info.project_url]) {
    if (v && String(v).trim()) out.push(String(v).trim());
  }
  if (info.project_urls && typeof info.project_urls === "object") {
    for (const v of Object.values(info.project_urls)) {
      if (v && String(v).trim()) out.push(String(v).trim());
    }
  }
  return out;
}

/**
 * True when any PyPI project URL points at github.com/{owner}/{repo}
 * (case-insensitive; strips trailing slash and .git).
 *
 * Prevents installing a different PyPI package that happens to share the
 * repo slug (e.g. lfnovo/open-notebook vs usnistgov/open-notebook on PyPI).
 */
export function pypiInfoMatchesGithub(
  info: {
    home_page?: string | null;
    project_url?: string | null;
    project_urls?: Record<string, string | null> | null;
  } | null | undefined,
  owner: string,
  repo: string,
): boolean {
  if (!owner || !repo) return false;
  const ownerL = String(owner).toLowerCase();
  const repoL = String(repo).toLowerCase().replace(/\.git$/, "");
  // Match github.com/owner/repo with optional .git / trailing slash / path suffix
  const re = new RegExp(
    `(?:^|//|\\.)github\\.com[/:]${escapeRegExp(ownerL)}/${escapeRegExp(repoL)}(?:\\.git)?(?:/|$|[#?])`,
    "i",
  );
  for (const raw of collectPypiProjectUrls(info)) {
    const normalized = raw.replace(/\.git$/i, "").replace(/\/+$/, "");
    if (re.test(normalized) || re.test(raw)) return true;
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Look up packageName on PyPI and check whether it is the same project as
 * github.com/owner/repo. On 404 / network error, matches=false (caller should
 * fall back to source-build from the GitHub tarball rather than guess).
 */
export async function resolvePypiGithubIdentity(
  packageName: string,
  owner: string,
  repo: string,
): Promise<PypiGithubIdentityResult> {
  const name = String(packageName || "").trim();
  if (!name) {
    return {
      matches: false,
      packageName: name,
      reason: "empty package name",
      pypiData: null,
    };
  }
  try {
    const pypiData = await fetchPypiData(name);
    const matches = pypiInfoMatchesGithub(pypiData.info, owner, repo);
    if (matches) {
      return {
        matches: true,
        packageName: name,
        reason: "pypi project urls match github.com/" + owner + "/" + repo,
        pypiData,
      };
    }
    const urls = collectPypiProjectUrls(pypiData.info);
    return {
      matches: false,
      packageName: name,
      reason:
        urls.length > 0
          ? `pypi package exists but project urls do not match github.com/${owner}/${repo} (got: ${urls.slice(0, 4).join(", ")})`
          : `pypi package exists but has no github project urls for ${owner}/${repo}`,
      pypiData,
    };
  } catch (err: any) {
    const msg = String(err?.message || err || "lookup failed");
    return {
      matches: false,
      packageName: name,
      reason: /404/.test(msg)
        ? `not published on PyPI (${msg})`
        : `pypi lookup failed: ${msg}`,
      pypiData: null,
    };
  }
}

type SelectedDist = {
  url: string;
  sha256: string;
  filename: string;
  kind: "wheel" | "sdist";
  version?: string;
};

type ResolvedResource = {
  name: string;
  url: string;
  sha256: string;
  version?: string;
};

export type VersionConstraint = {
  raw: string;
  clauses: Array<{ op: string; version: string }>;
};

export async function collectPipPackagePayload(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<PipPackagePayload> {
  const pypiData = await fetchPypiData(packageName);
  const formulaPy = selectPipFormulaPython(pypiData.info.requires_python);
  const prevPy = activePipFormulaPython;
  activePipFormulaPython = formulaPy;
  try {
    const dist = selectBestDistribution(pypiData.urls || [], {
      preferWheel: options.preferWheel !== false,
      version: pypiData.info.version,
    });

    if (!dist)
      throw new Error(
        `No suitable wheel or source distribution found for ${packageName} on PyPI`,
      );

    // Walk requires_dist from the same release we install (not always latest).
    const rootVersion = dist.version || pypiData.info.version;
    const pkgKey = normalizePackageName(packageName);
    const rootExtras: string[] = Array.isArray(options.extras)
      ? options.extras
      : KNOWN_ROOT_EXTRAS[pkgKey] || [];
    const deps = await resolveTransitiveDeps(
      packageName,
      new Map(),
      5,
      0,
      rootVersion,
      rootExtras,
    );
    const undeclared = await resolveUndeclaredDeps(packageName, deps);
    const allDeps = dedupeResources([...deps, ...undeclared]);

    const name = options.name || toFormulaName(packageName);
    const className = toClassName(name);
    const desc =
      options.desc ||
      pypiData.info.summary ||
      repoInfo?.description ||
      `Install ${packageName}`;
    const homepage =
      options.homepage ||
      pypiData.info.home_page ||
      pypiData.info.project_url ||
      repoInfo?.homepage ||
      `https://pypi.org/project/${packageName}/`;
    const license = guessLicenseIdentifier(
      pypiData.info.license || repoInfo?.license,
    );

    const testBinName =
      options.binName || KNOWN_BIN_NAMES[pkgKey] || name;

    const importMod =
      options.importVersionModule ||
      KNOWN_PYTHON_IMPORT_VERSION_TEST[pkgKey] ||
      null;
    const testDoBody = importMod
      ? `    assert_match version.to_s, shell_output("#{libexec}/bin/python -c 'import ${importMod}; print(${importMod}.__version__)'")`
      : `    assert_match version.to_s, shell_output("#{bin}/${rubyEscape(testBinName)} --version")`;

    const pythonFormula = `${formulaPy.major}.${formulaPy.minor}`;
    const pythonBin = `python${pythonFormula}`;
    const systemDeps = collectSystemDepsForResources(allDeps);
    const extraDependsBlock = systemDeps
      .map((d) => `  depends_on ${rubyString(d)}\n`)
      .join("");

    return {
      template: "pip_package",
      name,
      className,
      desc: rubyEscape(desc),
      homepage: rubyEscape(homepage),
      url: rubyEscape(dist.url),
      sha256: rubyEscape(dist.sha256),
      licenseLine: license ? `  license ${rubyString(license)}\n` : "",
      livecheckBlock: pypiLivecheckBlock(packageName),
      resourcesBlock: buildResourcesBlock(allDeps),
      allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
      testBinName: rubyEscape(testBinName),
      testDoBody,
      pythonFormula,
      pythonBin,
      extraDependsBlock,
      // Service argv should target the console-script bin, which may differ from
      // the formula token when homebrew/core forces a rename (nanobot-ai → bin nanobot).
      serviceBlock: buildServiceBlock(
        serviceFromOptions(options, testBinName),
        testBinName,
      ),
    };
  } finally {
    activePipFormulaPython = prevPy;
  }
}

function collectSystemDepsForResources(deps: ResolvedResource[]): string[] {
  const out = new Set<string>();
  for (const dep of deps) {
    const key = normalizePackageName(dep.name);
    for (const sys of RESOURCE_SYSTEM_DEPS[key] || []) {
      out.add(sys);
    }
  }
  return [...out].sort();
}

function buildResourcesBlock(deps: ResolvedResource[]) {
  if (deps.length === 0) return "";

  let block = "";
  for (const dep of deps) {
    block += `  resource ${rubyString(dep.name)} do\n`;
    block += `    url ${rubyString(dep.url)}\n`;
    block += `    sha256 ${rubyString(dep.sha256)}\n`;
    block += `  end\n\n`;
  }
  return block;
}

export async function generatePipPackage(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
) {
  const payload = await collectPipPackagePayload(
    packageName,
    repoInfo,
    options,
  );
  return writeRenderedFormula(payload, options.tapPath);
}

export function normalizePackageName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

/** Parse a single requires_dist entry into name + optional version + marker. */
export function parseRequiresDistEntry(req: string): {
  name: string;
  extras: string[];
  constraint: VersionConstraint;
  marker: string | null;
} | null {
  const trimmed = req.trim();
  if (!trimmed) return null;

  const [mainPart, ...markerParts] = trimmed.split(";");
  const marker = markerParts.length ? markerParts.join(";").trim() : null;

  const m = mainPart
    .trim()
    .match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[([^\]]*)\])?\s*(.*)$/);
  if (!m) return null;

  const name = m[1];
  const extras = (m[2] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rawConstraint = (m[3] || "").trim();
  return {
    name,
    extras,
    constraint: parseVersionConstraint(rawConstraint),
    marker,
  };
}

export function parseVersionConstraint(raw: string): VersionConstraint {
  const cleaned = raw.replace(/\(([^)]+)\)/g, "$1").trim();
  if (!cleaned) return { raw: "", clauses: [] };

  const clauses: Array<{ op: string; version: string }> = [];
  for (const part of cleaned.split(",")) {
    const c = part.trim();
    if (!c) continue;
    const m = c.match(/^(===|==|!=|~=|<=|>=|<|>)\s*(.+)$/);
    if (m) {
      clauses.push({ op: m[1], version: m[2].trim() });
    }
  }
  return { raw: cleaned, clauses };
}

export type RequirementEnv = {
  sysPlatform?: string;
  platformSystem?: string;
  pythonVersion?: string;
  /** Single extra name when evaluating one extra branch. */
  extra?: string | null;
  /**
   * Extras requested on the package currently being walked (from Foo[a,b]).
   * Root resolution uses [] so optional extras on the root package stay off.
   * Only used for the multi-extra fan-out; single-extra evaluation substitutes
   * `extra` directly into the marker expression.
   */
  activeExtras?: string[];
};

/**
 * Evaluate a subset of PEP 508 environment markers for the formula target
 * (CPython 3.13 on the host OS/arch).
 *
 * Extra-marked requirements are included only when the matching extra is in
 * `activeExtras` (or `extra`). That lets `pkg[server]` pull server deps while
 * still skipping root-level optional extras like `dev`.
 */
export function isRequirementApplicable(
  marker: string | null,
  env: RequirementEnv = {},
): boolean {
  if (!marker || !marker.trim()) return true;

  // Multi-extra fan-out: try each requested extra once, then evaluate with a
  // concrete `extra` value (no further fan-out).
  if (/\bextra\b/.test(marker) && env.activeExtras !== undefined) {
    if (!env.activeExtras.length) return false;
    return env.activeExtras.some((extra) =>
      isRequirementApplicable(marker, {
        sysPlatform: env.sysPlatform,
        platformSystem: env.platformSystem,
        pythonVersion: env.pythonVersion,
        extra,
      }),
    );
  }

  // No active extras and no concrete extra => optional extras stay off.
  if (
    /\bextra\b/.test(marker) &&
    (env.extra == null || env.extra === "") &&
    env.activeExtras === undefined
  ) {
    return false;
  }

  const sysPlatform =
    env.sysPlatform ??
    (process.platform === "darwin"
      ? "darwin"
      : process.platform === "win32"
        ? "win32"
        : "linux");
  const platformSystem =
    env.platformSystem ??
    (process.platform === "darwin"
      ? "Darwin"
      : process.platform === "win32"
        ? "Windows"
        : "Linux");
  const py = getActivePipFormulaPython();
  const pythonVersion =
    env.pythonVersion ?? `${py.major}.${py.minor}`;

  let expr = marker;
  expr = expr.replace(/\bextra\b/g, JSON.stringify(env.extra ?? ""));
  expr = expr.replace(/\bsys_platform\b/g, JSON.stringify(sysPlatform));
  expr = expr.replace(/\bplatform_system\b/g, JSON.stringify(platformSystem));
  expr = expr.replace(/\bpython_version\b/g, JSON.stringify(pythonVersion));

  // Unsupported markers: keep the dep (fail open) rather than drop runtime needs.
  if (
    /\b(platform_machine|platform_python_implementation|python_full_version|os_name|implementation_name|implementation_version)\b/.test(
      expr,
    )
  ) {
    return true;
  }

  return evalMarkerExpression(expr);
}

function evalMarkerExpression(expr: string): boolean {
  const normalized = expr.replace(/\s+/g, " ").trim();
  if (!normalized) return true;

  const orParts = splitTopLevel(normalized, " or ");
  if (orParts.length > 1) {
    return orParts.some((p) => evalMarkerExpression(p));
  }
  const andParts = splitTopLevel(normalized, " and ");
  if (andParts.length > 1) {
    return andParts.every((p) => evalMarkerExpression(p));
  }

  let part = normalized.trim();
  if (part.startsWith("(") && part.endsWith(")")) {
    return evalMarkerExpression(part.slice(1, -1));
  }
  if (part.startsWith("not ")) {
    return !evalMarkerExpression(part.slice(4));
  }

  const m = part.match(/^(.*?)(?:\s*)(===|==|!=|<=|>=|<|>)(?:\s*)(.*)$/);
  if (!m) return true;
  const left = unquote(m[1].trim());
  const op = m[2];
  const right = unquote(m[3].trim());
  return compareMarkerValues(left, op, right);
}

function splitTopLevel(expr: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && expr.startsWith(sep, i)) {
      parts.push(expr.slice(start, i));
      i += sep.length - 1;
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function compareMarkerValues(left: string, op: string, right: string): boolean {
  if (/^\d+(\.\d+)*$/.test(left) && /^\d+(\.\d+)*$/.test(right)) {
    const cmp = compareVersions(left, right);
    switch (op) {
      case "==":
      case "===":
        return cmp === 0;
      case "!=":
        return cmp !== 0;
      case "<":
        return cmp < 0;
      case "<=":
        return cmp <= 0;
      case ">":
        return cmp > 0;
      case ">=":
        return cmp >= 0;
    }
  }
  switch (op) {
    case "==":
    case "===":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    default:
      return true;
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

export function versionSatisfies(
  version: string,
  constraint: VersionConstraint,
): boolean {
  if (!constraint.clauses.length) return true;
  const v = version.split("+")[0].split("!")[0];

  for (const { op, version: rawTarget } of constraint.clauses) {
    const target = rawTarget.split("+")[0].replace(/\.\*$/, "");
    const cmp = compareVersions(
      normalizeVersionForCompare(v),
      normalizeVersionForCompare(target),
    );
    let ok = false;
    switch (op) {
      case "==":
      case "===":
        if (rawTarget.endsWith(".*")) {
          ok = v === target || v.startsWith(target + ".");
        } else {
          ok = cmp === 0 || v === target;
        }
        break;
      case "!=":
        ok = cmp !== 0 && v !== target;
        break;
      case ">=":
        ok = cmp >= 0;
        break;
      case "<=":
        ok = cmp <= 0;
        break;
      case ">":
        ok = cmp > 0;
        break;
      case "<":
        ok = cmp < 0;
        break;
      case "~=": {
        const parts = target.split(".");
        if (parts.length < 2) {
          ok = cmp >= 0;
          break;
        }
        const prefix = parts.slice(0, -1).join(".");
        ok = cmp >= 0 && (v === prefix || v.startsWith(prefix + "."));
        break;
      }
      default:
        ok = true;
    }
    if (!ok) return false;
  }
  return true;
}

function normalizeVersionForCompare(v: string): string {
  return v
    .replace(/((?:a|b|rc|dev|post)\d*)$/i, (m, _g, offset) =>
      offset > 0 ? "" : m,
    )
    .replace(/\.$/, "");
}

async function fetchPypiData(
  packageName: string,
  version?: string,
): Promise<PypiPackageJson> {
  const pypiBase = process.env.PYPI_URL || "https://pypi.org";
  const path = version
    ? `/pypi/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}/json`
    : `/pypi/${encodeURIComponent(packageName)}/json`;
  const response = await fetch(`${pypiBase}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" },
  });
  if (!response.ok)
    throw new Error(
      `PyPI lookup failed for ${packageName}${version ? `@${version}` : ""}: ${response.status}`,
    );
  return response.json();
}

function toSelectedDist(
  url: PypiUrl,
  kind: "wheel" | "sdist",
  version?: string,
): SelectedDist | null {
  if (!url?.url || !url?.digests?.sha256) return null;
  return {
    url: url.url,
    sha256: url.digests.sha256,
    filename: url.filename || url.url.split("/").pop() || "",
    kind,
    version,
  };
}

function hostMacArch(): "arm64" | "x86_64" | null {
  const a = osArch();
  if (a === "arm64") return "arm64";
  if (a === "x64") return "x86_64";
  return null;
}

function parseWheelTags(filename: string): {
  pythonTags: string[];
  abiTags: string[];
  platformTags: string[];
} | null {
  if (!filename.toLowerCase().endsWith(".whl")) return null;
  const stem = filename.slice(0, -4);
  const parts = stem.split("-");
  if (parts.length < 5) return null;
  const platformTags = parts[parts.length - 1].split(".");
  const abiTags = parts[parts.length - 2].split(".");
  const pythonTags = parts[parts.length - 3].split(".");
  return { pythonTags, abiTags, platformTags };
}

function pythonTagCompatible(
  tag: string,
  py: PipFormulaPython = getActivePipFormulaPython(),
): { ok: boolean; pure: boolean; score: number } {
  const t = tag.toLowerCase();
  if (t === "py2.py3" || t === "py3" || /^py3(\.\d+)?$/.test(t)) {
    return { ok: true, pure: true, score: 100 };
  }
  const cp = t.match(/^cp(\d)(\d+)$/);
  if (cp) {
    const major = Number(cp[1]);
    const minor = Number(cp[2]);
    if (major === py.major && minor === py.minor) {
      return { ok: true, pure: false, score: 90 };
    }
    return { ok: false, pure: false, score: 0 };
  }
  return { ok: false, pure: false, score: 0 };
}

function abiTagCompatible(
  tag: string,
  py: PipFormulaPython = getActivePipFormulaPython(),
): boolean {
  const t = tag.toLowerCase();
  if (t === "none") return true;
  if (t === "abi3") return true;
  const m = t.match(/^cp(\d)(\d+)t?$/);
  if (!m) return false;
  return Number(m[1]) === py.major && Number(m[2]) === py.minor;
}

function platformTagCompatible(
  tag: string,
  macArch: "arm64" | "x86_64" | null,
): { ok: boolean; score: number } {
  const t = tag.toLowerCase();
  if (t === "any") return { ok: true, score: 50 };

  if (process.platform === "darwin" || macArch) {
    if (t.includes("universal2")) return { ok: true, score: 70 };
    if (macArch === "arm64" && /macosx_\d+_\d+_arm64/.test(t)) {
      return { ok: true, score: 80 };
    }
    if (macArch === "x86_64" && /macosx_\d+_\d+_x86_64/.test(t)) {
      return { ok: true, score: 80 };
    }
  }

  if (process.platform === "linux") {
    if (macArch === "arm64" && /manylinux.*_aarch64|musllinux.*_aarch64/.test(t)) {
      return { ok: true, score: 80 };
    }
    if (macArch === "x86_64" && /manylinux.*_x86_64|musllinux.*_x86_64/.test(t)) {
      return { ok: true, score: 80 };
    }
  }

  return { ok: false, score: 0 };
}

function isPurePythonWheel(filename: string): boolean {
  return /[.-]py3[^-]*-none-any\.whl$/i.test(filename);
}

function scoreWheel(url: PypiUrl, macArch: "arm64" | "x86_64" | null): number {
  if (url.yanked) return -1;
  if (url.packagetype && url.packagetype !== "bdist_wheel") return -1;
  const filename = url.filename || url.url?.split("/").pop() || "";
  const tags = parseWheelTags(filename);
  if (!tags) return -1;

  if (
    tags.pythonTags.some((t) => /t$/i.test(t)) ||
    tags.abiTags.some((t) => /t$/i.test(t))
  ) {
    return -1;
  }

  if (isPurePythonWheel(filename)) {
    const hasPy3 = tags.pythonTags.some((t) => {
      const r = pythonTagCompatible(t);
      return r.ok && r.pure;
    });
    if (!hasPy3) return -1;
    const exactPy3 = tags.pythonTags.some((t) => t.toLowerCase() === "py3");
    return exactPy3 ? 300 : 290;
  }

  let bestPy = { ok: false, pure: false, score: 0 };
  for (const pt of tags.pythonTags) {
    const r = pythonTagCompatible(pt);
    if (r.ok && r.score >= bestPy.score) bestPy = r;
  }
  const hasAbi3 = tags.abiTags.some((t) => t.toLowerCase() === "abi3");
  if (!bestPy.ok && hasAbi3) {
    const py = getActivePipFormulaPython();
    for (const pt of tags.pythonTags) {
      const m = pt.toLowerCase().match(/^cp(\d)(\d+)$/);
      if (!m) continue;
      const major = Number(m[1]);
      const minor = Number(m[2]);
      if (major === py.major && minor <= py.minor) {
        bestPy = { ok: true, pure: false, score: 85 };
        break;
      }
    }
  }
  if (!bestPy.ok) return -1;

  const abiOk = tags.abiTags.some(
    (t) =>
      abiTagCompatible(t) ||
      t.toLowerCase() === "none" ||
      (hasAbi3 && t.toLowerCase() === "abi3"),
  );
  if (!abiOk) return -1;

  let bestPlat = { ok: false, score: 0 };
  for (const plat of tags.platformTags) {
    const r = platformTagCompatible(plat, macArch);
    if (r.ok && r.score >= bestPlat.score) bestPlat = r;
  }
  if (!bestPlat.ok) return -1;

  return bestPy.score + bestPlat.score;
}

/**
 * Prefer a pure-python wheel, then a host-compatible platform wheel.
 * Fall back to sdist when no usable wheel exists.
 */
export function selectBestDistribution(
  urls: PypiUrl[],
  options: {
    preferWheel?: boolean;
    macArch?: "arm64" | "x86_64" | null;
    version?: string;
  } = {},
): SelectedDist | null {
  const preferWheel = options.preferWheel !== false;
  const macArch = options.macArch === undefined ? hostMacArch() : options.macArch;
  const candidates = (urls || []).filter(
    (u) => u && !u.yanked && u.url && u.digests?.sha256,
  );

  if (preferWheel) {
    let best: { score: number; url: PypiUrl } | null = null;
    for (const u of candidates) {
      if (
        u.packagetype !== "bdist_wheel" &&
        !String(u.filename || "").endsWith(".whl")
      ) {
        continue;
      }
      const score = scoreWheel(u, macArch);
      // score < 0 means incompatible platform/abi — never install a bad wheel.
      if (score < 0) continue;
      if (!best || score > best.score) best = { score, url: u };
    }
    if (best) {
      const selected = toSelectedDist(best.url, "wheel", options.version);
      if (selected) return selected;
    }
  }

  // Prefer sdist over any remaining incompatible wheel.
  const sdist =
    candidates.find((u) => u.packagetype === "sdist") ||
    candidates.find((u) =>
      /\.(tar\.gz|tgz|zip)$/i.test(u.filename || u.url || ""),
    ) ||
    null;
  if (sdist) return toSelectedDist(sdist, "sdist", options.version);

  // Last resort: only accept a wheel if it scores as compatible (never a random manylinux-only wheel).
  for (const u of candidates) {
    const isWheel =
      u.packagetype === "bdist_wheel" ||
      String(u.filename || "").endsWith(".whl");
    if (!isWheel) continue;
    if (scoreWheel(u, macArch) < 0) continue;
    const selected = toSelectedDist(u, "wheel", options.version);
    if (selected) return selected;
  }
  return null;
}

/**
 * Pick a release version that satisfies the constraint.
 * Prefers the newest non-yanked version with a usable distribution.
 */
export function pickVersionFromReleases(
  releases: Record<string, PypiUrl[]> | undefined,
  constraint: VersionConstraint,
  latestVersion?: string,
): string | null {
  if (latestVersion && versionSatisfies(latestVersion, constraint)) {
    if (!releases || !releases[latestVersion]) return latestVersion;
    const files = releases[latestVersion] || [];
    if (files.some((u) => u && !u.yanked && u.url && u.digests?.sha256)) {
      return latestVersion;
    }
  }

  if (!releases) {
    return latestVersion && versionSatisfies(latestVersion, constraint)
      ? latestVersion
      : null;
  }

  const versions = Object.keys(releases)
    .filter((v) => versionSatisfies(v, constraint))
    .filter((v) =>
      (releases[v] || []).some(
        (u) => u && !u.yanked && u.url && u.digests?.sha256,
      ),
    )
    .sort((a, b) => compareVersions(b, a));

  return versions[0] || null;
}

function exactPinVersion(constraint: VersionConstraint): string | null {
  if (constraint.clauses.length !== 1) return null;
  const c = constraint.clauses[0];
  if ((c.op === "==" || c.op === "===") && !c.version.includes("*")) {
    return c.version;
  }
  return null;
}

async function selectDistForDependency(
  depName: string,
  constraint: VersionConstraint,
): Promise<SelectedDist | null> {
  const pin = exactPinVersion(constraint);
  if (pin) {
    try {
      const pinned = await fetchPypiData(depName, pin);
      const dist = selectBestDistribution(pinned.urls || [], { version: pin });
      if (dist) return { ...dist, version: pin };
    } catch {
      // fall through
    }
  }

  const latest = await fetchPypiData(depName);
  const latestVersion = latest.info.version;
  if (latestVersion && versionSatisfies(latestVersion, constraint)) {
    const dist = selectBestDistribution(latest.urls || [], {
      version: latestVersion,
    });
    if (dist) return { ...dist, version: latestVersion };
  }

  const chosen = pickVersionFromReleases(
    latest.releases,
    constraint,
    latestVersion,
  );
  if (!chosen) return null;
  if (chosen === latestVersion) {
    return selectBestDistribution(latest.urls || [], { version: chosen });
  }

  try {
    const pinned = await fetchPypiData(depName, chosen);
    return selectBestDistribution(pinned.urls || [], { version: chosen });
  } catch {
    const files = latest.releases?.[chosen] || [];
    return selectBestDistribution(files, { version: chosen });
  }
}

/**
 * Track which extras have already been expanded per package.
 * The empty string means base (non-extra) requirements were walked.
 */
type VisitedExtras = Map<string, Set<string>>;

const BASE_EXTRA = "";

async function resolveTransitiveDeps(
  packageName: string,
  visited: VisitedExtras,
  maxDepth = 5,
  depth = 0,
  /**
   * Version of `packageName` whose requires_dist should be walked.
   * Must match the wheel/sdist selected for this package — using latest
   * metadata while pinning an older resource causes missing runtime deps
   * (e.g. mcp 1.28.1 needs httpx-sse; mcp 2.x needs httpx2 instead).
   */
  packageVersion?: string,
  /** Extras requested via Foo[a,b] when this package was depended on. */
  activeExtras: string[] = [],
): Promise<ResolvedResource[]> {
  const key = normalizePackageName(packageName);
  if (depth >= maxDepth) return [];

  const seen = visited.get(key) ?? new Set<string>();
  const normalizedExtras = activeExtras
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const newExtras = normalizedExtras.filter((e) => !seen.has(e));
  const needBase = !seen.has(BASE_EXTRA);
  if (!needBase && newExtras.length === 0) return [];

  if (!visited.has(key)) visited.set(key, seen);
  if (needBase) seen.add(BASE_EXTRA);
  for (const e of newExtras) seen.add(e);

  // Only evaluate extras that are newly required on this visit (plus base).
  const extrasForMarkers = needBase
    ? [...normalizedExtras]
    : [...newExtras];

  const resources: ResolvedResource[] = [];

  try {
    // Prefer the selected pin's metadata so transitive deps match the installed wheel.
    let pypiData: PypiPackageJson;
    if (packageVersion) {
      try {
        pypiData = await fetchPypiData(packageName, packageVersion);
      } catch {
        pypiData = await fetchPypiData(packageName);
      }
    } else {
      pypiData = await fetchPypiData(packageName);
    }
    const requires = await resolveRequiresDistList(
      packageName,
      pypiData,
    );

    for (const req of requires) {
      const parsed = parseRequiresDistEntry(req);
      if (!parsed) continue;
      if (
        !isRequirementApplicable(parsed.marker, {
          activeExtras: extrasForMarkers,
        })
      ) {
        continue;
      }

      const depKey = normalizePackageName(parsed.name);
      const depSeen = visited.get(depKey);
      const depExtras = parsed.extras.map((e) => e.trim().toLowerCase()).filter(Boolean);
      const depAlreadyFullyExpanded =
        depSeen?.has(BASE_EXTRA) &&
        depExtras.every((e) => depSeen.has(e));

      try {
        const dist = await selectDistForDependency(
          parsed.name,
          parsed.constraint,
        );
        // Install the wheel once; extras only affect transitive requirements.
        if (dist && !depSeen) {
          resources.push({
            name: parsed.name,
            url: dist.url,
            sha256: dist.sha256,
            version: dist.version,
          });
        }

        if (depAlreadyFullyExpanded) continue;

        const transitive = await resolveTransitiveDeps(
          parsed.name,
          visited,
          maxDepth,
          depth + 1,
          dist?.version,
          depExtras,
        );
        resources.push(...transitive);
      } catch {
        // skip deps that fail to resolve
      }
    }
  } catch {
    // skip
  }

  return resources;
}

/**
 * Prefer PyPI requires_dist; when empty/null (literalai class), fall back to
 * UNDECLARED_RUNTIME_DEPS then wheel METADATA Requires-Dist lines.
 */
export async function resolveRequiresDistList(
  packageName: string,
  pypiData: PypiPackageJson,
): Promise<string[]> {
  const fromApi = (pypiData.info.requires_dist || []).filter(Boolean);
  if (fromApi.length > 0) return fromApi;

  const key = normalizePackageName(packageName);
  const undeclared = UNDECLARED_RUNTIME_DEPS[key] || [];
  if (undeclared.length > 0) {
    return undeclared.map(String);
  }

  // Last resort: read Requires-Dist from a compatible wheel's METADATA.
  try {
    const dist = selectBestDistribution(pypiData.urls || [], {
      preferWheel: true,
      version: pypiData.info.version,
    });
    if (dist?.kind === "wheel" && dist.url) {
      const fromWheel = await extractRequiresDistFromWheel(dist.url);
      if (fromWheel.length > 0) return fromWheel;
    }
  } catch {
    /* optional */
  }
  return [];
}

/** Parse Requires-Dist from a .whl METADATA file (PEP 566). */
export async function extractRequiresDistFromWheel(
  wheelUrl: string,
): Promise<string[]> {
  const { downloadToTemp } = await import("../sha256.ts");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const dl = await downloadToTemp(wheelUrl);
  try {
    // List METADATA path inside the wheel zip.
    let listing = "";
    try {
      const { stdout } = await execFileAsync("zipinfo", ["-1", dl.path]);
      listing = stdout;
    } catch {
      const { stdout } = await execFileAsync("unzip", ["-l", dl.path]);
      listing = stdout;
    }
    const metaPath = listing
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /\/METADATA$/.test(l) && l.includes(".dist-info/"));
    if (!metaPath) return [];

    const { stdout } = await execFileAsync(
      "unzip",
      ["-p", dl.path, metaPath],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    const text = String(stdout);
    const out: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^Requires-Dist:\s*(.+)$/i);
      if (m?.[1]) out.push(m[1].trim());
    }
    return out;
  } finally {
    await dl.cleanup();
  }
}

async function resolveUndeclaredDeps(
  packageName: string,
  already: ResolvedResource[],
): Promise<ResolvedResource[]> {
  const extras =
    UNDECLARED_RUNTIME_DEPS[normalizePackageName(packageName)] || [];
  if (!extras.length) return [];

  const have = new Set(already.map((r) => normalizePackageName(r.name)));
  const out: ResolvedResource[] = [];
  const visited: VisitedExtras = new Map([
    [normalizePackageName(packageName), new Set([BASE_EXTRA])],
  ]);
  for (const h of have) visited.set(h, new Set([BASE_EXTRA]));

  for (const depName of extras) {
    const key = normalizePackageName(depName);
    if (have.has(key)) continue;
    try {
      const data = await fetchPypiData(depName);
      const dist = selectBestDistribution(data.urls || [], {
        version: data.info.version,
      });
      if (!dist) continue;
      out.push({
        name: depName,
        url: dist.url,
        sha256: dist.sha256,
        version: dist.version || data.info.version,
      });
      have.add(key);

      const nested = await resolveTransitiveDeps(
        depName,
        visited,
        5,
        0,
        dist.version || data.info.version,
        [],
      );
      for (const n of nested) {
        const nk = normalizePackageName(n.name);
        if (have.has(nk)) continue;
        out.push(n);
        have.add(nk);
      }
    } catch {
      // ignore
    }
  }
  return out;
}

function dedupeResources(resources: ResolvedResource[]): ResolvedResource[] {
  const seen = new Set<string>();
  const out: ResolvedResource[] = [];
  for (const r of resources) {
    const key = normalizePackageName(r.name);
    if (seen.has(key)) continue;
    out.push(r);
    seen.add(key);
  }
  return out;
}
