import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { npmLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { NpmPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

/**
 * npm packages whose primary bin is a full-screen TUI with no usable
 * `--version`/`--help` (Homebrew-core uses spawn/error tests for these).
 * Keys are bare package names (scoped packages use last segment when matched).
 */
export const KNOWN_NPM_TUI_NO_VERSION: Record<string, true> = {
  gtop: true,
  mapscii: true,
  vtop: true,
};

/** Dependency names that strongly indicate a terminal TUI dashboard. */
const TUI_DEP_MARKERS = new Set([
  "blessed",
  "blessed-contrib",
  "neo-blessed",
  "drawille",
  "drawille-canvas",
  "drawille-blessed-contrib",
  "term-mouse",
]);

/**
 * True when the package bin is expected to be an interactive TUI without
 * a reliable `--version` exit path.
 */
export function isNpmTuiNoVersion(
  packageName: string,
  versionData: any = null,
  pkgData: any = null,
): boolean {
  const bare = packageName.split("/").pop() || packageName;
  if (KNOWN_NPM_TUI_NO_VERSION[packageName] || KNOWN_NPM_TUI_NO_VERSION[bare]) {
    return true;
  }
  const deps = {
    ...(versionData?.dependencies || {}),
    ...(versionData?.optionalDependencies || {}),
  };
  if (Object.keys(deps).some((d) => TUI_DEP_MARKERS.has(d))) return true;
  const keywords = Array.isArray(pkgData?.keywords)
    ? pkgData.keywords.map((k: any) => String(k).toLowerCase())
    : [];
  const desc = String(
    pkgData?.description || versionData?.description || "",
  ).toLowerCase();
  // Require both a dashboard/monitor keyword family and terminal/tui signal
  // to avoid flagging ordinary CLIs that mention "dashboard" in prose.
  const hasDash =
    keywords.some((k: string) =>
      /^(tui|dashboard|monitor|monitoring|top|chart)$/.test(k),
    ) || /\b(tui|terminal dashboard|system monitoring dashboard)\b/.test(desc);
  const hasTerm =
    keywords.some((k: string) => /^(terminal|cli|console)$/.test(k)) ||
    /\b(terminal|blessed)\b/.test(desc);
  return hasDash && hasTerm;
}

/**
 * Homebrew's `std_npm_args` defaults to `ignore_scripts: true`. Packages whose
 * install lifecycle scripts download platform binaries or build native modules
 * (e.g. @railway/cli) must run those scripts or the bin wrappers exit ENOENT.
 */
export function npmNeedsInstallScripts(versionData: any): boolean {
  const scripts = versionData?.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return false;
  }
  return Boolean(
    scripts.preinstall || scripts.install || scripts.postinstall,
  );
}

/**
 * Parse npm `engines.node` and map it to a Homebrew `node` formula token.
 *
 * - `>=18` / `>=18.0.0` with no upper bound → `node` (latest)
 * - `^18.0.0`, `~18.0.0`, `>=18 <19`, `18.x` → `node@18`
 * - missing / invalid → `node`
 *
 * Homebrew ships `node@<major>` for LTS lines; when the engine range is
 * bounded to a single major we pin it so `npm install` and runtime do not
 * drift beyond the supported Node line.
 */
export function inferNodeVersion(enginesNode: string | null | undefined): string {
  if (!enginesNode) return "node";

  const range = String(enginesNode).trim().toLowerCase();
  // Strip leading "v" from the whole expression and any whitespace around ||.
  const branches = range.split(/\s*\|\|\s*/).filter(Boolean);

  let chosenMajor: number | null = null;
  let chosenIsBounded = false;

  for (const branch of branches) {
    const constraints = parseSemverConstraints(branch);
    if (!constraints) continue;

    // A branch with no upper bound means "latest node" will satisfy the
    // minimum. If any such branch exists, the package accepts the latest
    // major and we should not pin.
    if (constraints.maxMajor === null) {
      return "node";
    }

    const major = constraints.minMajor;
    if (major !== null && (!chosenIsBounded || major > (chosenMajor ?? -1))) {
      chosenMajor = major;
      chosenIsBounded = true;
    }
  }

  if (chosenMajor !== null) {
    return `node@${chosenMajor}`;
  }
  return "node";
}

function parseSemverConstraints(expr: string): { minMajor: number | null; maxMajor: number | null } | null {
  const constraints: { op: string; major: number; minor: number; patch: number; wildcard: string }[] = [];

  // Tokenize: supports >=, <=, >, <, ^, ~, =, and bare versions; also
  // captures `.x` / `-x` wildcards (e.g. `18.x`) as bounded major ranges.
  const tokenRe = /([><=^~]*)\s*v?(\d+)(?:\.(\d+)(?:\.(\d+))?)?(\.x|-x)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(expr)) !== null) {
    const op = m[1] || "";
    const major = parseInt(m[2], 10);
    const minor = m[3] ? parseInt(m[3], 10) : 0;
    const patch = m[4] ? parseInt(m[4], 10) : 0;
    const wildcard = m[5] || "";
    constraints.push({ op, major, minor, patch, wildcard });
  }

  if (constraints.length === 0) return null;

  let minMajor: number | null = null;
  let maxMajor: number | null = null;

  for (const c of constraints) {
    switch (c.op) {
      case ">=":
      case ">":
      case "":
      case "=":
        if (minMajor === null || c.major > minMajor) minMajor = c.major;
        if (c.wildcard) {
          // `18.x` is `>=18.0.0 <19.0.0`; treat as bounded to this major.
          if (maxMajor === null || c.major + 1 < maxMajor) {
            maxMajor = c.major + 1;
          }
        }
        break;
      case "^":
      case "~":
        if (minMajor === null || c.major > minMajor) minMajor = c.major;
        if (maxMajor === null || c.major + 1 < maxMajor) {
          // ^1.2.3 means >=1.2.3 <2.0.0, ~1.2.3 means >=1.2.3 <1.3.0.
          maxMajor = c.op === "~" ? c.major : c.major + 1;
        }
        break;
      case "<":
      case "<=":
        // Upper bound is exclusive; the maximum *major* that can satisfy
        // <2.0.0 is 1.x, i.e. major 1.
        const upperMajor = c.major - (c.op === "<" ? 1 : 0);
        if (maxMajor === null || upperMajor < maxMajor) maxMajor = upperMajor;
        break;
    }
  }

  return { minMajor, maxMajor };
}

export async function collectNpmPackagePayload(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<NpmPackagePayload> {
  const registryBase = process.env.NPM_REGISTRY_URL || "https://registry.npmjs.org";
  const registryUrl = `${registryBase}/${encodeURIComponent(packageName)}`;
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

  const binName =
    options.binName || extractNpmBinName(versionData, packageName) || name;

  const service = serviceFromOptions(options, binName);

  const stdNpmArgs = npmNeedsInstallScripts(versionData)
    ? "*std_npm_args(ignore_scripts: false)"
    : "*std_npm_args";

  const engines = versionData?.engines || pkgData?.engines;
  const nodeVersion = inferNodeVersion(engines?.node);

  const tuiNoVersion =
    typeof options.tuiNoVersion === "boolean"
      ? options.tuiNoVersion
      : isNpmTuiNoVersion(packageName, versionData, pkgData);

  const testDoBody = tuiNoVersion
    ? `    assert_path_exists bin/"${rubyEscape(binName)}"`
    : `    assert_match version.to_s, shell_output("#{bin}/${rubyEscape(binName)} --version")`;

  return {
    template: "npm_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    url: rubyEscape(tarballUrl),
    sha256: rubyEscape(tarballSha),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(binName),
    testDoBody,
    nodeVersion: rubyEscape(nodeVersion),
    stdNpmArgs,
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    livecheckBlock: npmLivecheckBlock(packageName),
    serviceBlock: buildServiceBlock(service, binName),
  };
}

/**
 * Extract the primary bin name from npm version data.
 *
 * npm `bin` can be:
 * - A string: `"bin": "cli.js"` → bin name is the package name (last segment
 *   of scoped packages)
 * - An object: `"bin": { "tb": "taskbook.js" }` → bin name is the key (`tb`)
 * - An object with multiple keys: prefer the key matching the package name,
 *   otherwise the first key
 * - Absent: return null (caller falls back to formula name)
 */
export function extractNpmBinName(versionData: any, packageName: string): string | null {
  const bin = versionData?.bin;
  if (!bin) return null;

  if (typeof bin === "string") {
    // When bin is a string, the binary is named after the package
    // (last segment for scoped packages like @org/pkg)
    const lastSegment = packageName.split("/").pop() || packageName;
    return lastSegment;
  }

  if (typeof bin === "object" && !Array.isArray(bin)) {
    const keys = Object.keys(bin);
    if (keys.length === 0) return null;

    // Prefer the key matching the package name (or its last segment)
    const lastSegment = packageName.split("/").pop() || packageName;
    const match = keys.find((k) => k === packageName || k === lastSegment);
    if (match) return match;

    // Otherwise, return the first key
    return keys[0];
  }

  return null;
}

export async function generateNpmPackage(
  packageName: string,
  repoInfo: any = null,
  options: any = {},
) {
  const payload = await collectNpmPackagePayload(
    packageName,
    repoInfo,
    options,
  );
  return writeRenderedFormula(payload, options.tapPath);
}
