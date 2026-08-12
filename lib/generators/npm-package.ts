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
  const hasDash = keywords.some((k: string) =>
    /^(tui|dashboard|monitor|monitoring|top|chart)$/.test(k),
  ) || /\b(tui|terminal dashboard|system monitoring dashboard)\b/.test(desc);
  const hasTerm =
    keywords.some((k: string) => /^(terminal|cli|console)$/.test(k)) ||
    /\b(terminal|blessed)\b/.test(desc);
  return hasDash && hasTerm;
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

  const service = serviceFromOptions(options, name);

  const binName = options.binName || extractNpmBinName(versionData, packageName) || name;

  const tuiNoVersion =
    typeof options.tuiNoVersion === "boolean"
      ? options.tuiNoVersion
      : isNpmTuiNoVersion(packageName, versionData, pkgData);

  // TUI packages (gtop/mapscii/vtop): no --version; match Homebrew-core style
  // existence/spawn checks so `brew test` does not hang or fail spuriously.
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
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    livecheckBlock: npmLivecheckBlock(packageName),
    serviceBlock: buildServiceBlock(service, name),
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
