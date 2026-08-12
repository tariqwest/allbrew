import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { GemPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

/**
 * Native/build deps for gems that compile C extensions or link system libs.
 * Keys are RubyGems names (underscores as published on rubygems.org).
 */
export const GEM_NATIVE_DEPENDS: Record<string, string[]> = {
  mailcatcher: ["pkgconf", "sqlite"],
  sqlite3: ["pkgconf", "sqlite"],
  nokogiri: ["pkgconf"],
  pg: ["libpq"],
  mysql2: ["mysql-client"],
  rugged: ["pkgconf", "libgit2"],
  ffi: ["libffi"],
  // geminabox itself is pure Ruby; common reverse deps may still need build tools
  redic: [],
  nio4r: ["pkgconf"],
  websocket_driver: ["pkgconf"],
  "websocket-driver": ["pkgconf"],
  eventmachine: ["pkgconf"],
  thin: ["pkgconf"],
  puma: ["pkgconf"],
  byebug: ["pkgconf"],
  ruby_debug: ["pkgconf"],
  sassc: ["pkgconf"],
  charlock_holmes: ["pkgconf", "icu4c"],
  gpgme: ["pkgconf", "gpgme"],
  rmagick: ["pkgconf", "imagemagick"],
  grpc: ["pkgconf"],
  google_protobuf: ["pkgconf"],
  "google-protobuf": ["pkgconf"],
};

/**
 * Gems known to ship no executables (library-only). Used when RubyGems metadata
 * does not list executables and the gem name should not be treated as a bin.
 */
/**
 * Known library-only gems (empty executables). Prefer API executables:[] when
 * available; this set is the fallback when metadata omits the field.
 * Default for unknown gems with null executables is CLI (assume bin == gem name).
 */
export const GEM_LIBRARY_ONLY = new Set([
  "adamantite",
  "geminabox",
  "activesupport",
  "activerecord",
  "actionpack",
  "railties",
  "rack",
  "rack-test",
  "json",
  "nokogiri",
  "ffi",
  "concurrent-ruby",
  "i18n",
  "tzinfo",
  "minitest",
]);

export async function collectGemPackagePayload(
  gemName: string,
  repoInfo: any = null,
  options: any = {},
): Promise<GemPackagePayload> {
  const gemData = await fetchRubyGemsData(gemName);
  const version = gemData.version;
  const downloadUrl = gemData.gemUri;
  const sha256 = await hashUrl(downloadUrl);

  const name = options.name || toFormulaName(gemName);
  const className = toClassName(name);
  const desc =
    options.desc ||
    gemData.info ||
    repoInfo?.description ||
    `Install ${gemName} Ruby gem`;
  const homepage =
    gemData.homepageUri ||
    repoInfo?.homepage ||
    repoInfo?.htmlUrl ||
    `https://rubygems.org/gems/${gemName}`;
  const license = guessLicenseIdentifier(
    gemData.licenses?.[0] || repoInfo?.license,
  );

  const urlLines = `  url ${rubyString(downloadUrl)}\n  sha256 ${rubyString(sha256)}\n  version ${rubyString(version)}\n`;

  const nativeDeps = resolveGemNativeDepends(gemName, options);
  const dependsOnLines = nativeDeps
    .map((dep) => `  depends_on ${rubyString(dep)}\n`)
    .join("");

  const executables =
    options.executables ??
    gemData.executables ??
    null;
  // Assume CLI unless proven empty:
  // - options.library, or
  // - API returns executables: [], or
  // - API omits executables AND gem is in GEM_LIBRARY_ONLY.
  // Null executables on unknown gems → CLI (bin named like the gem).
  const isLibrary =
    options.library === true ||
    (Array.isArray(executables) && executables.length === 0) ||
    (executables == null && GEM_LIBRARY_ONLY.has(gemName));

  // Prefer explicit bin, then first gem executable, then gem name (underscores).
  const testBin =
    options.binName ||
    (Array.isArray(executables) && executables[0]) ||
    gemName ||
    name;

  const requireName =
    options.requireName || gemName.replace(/-/g, "_").replace(/^$/, gemName);
  // Library gems ship no executables: verify via gem list + require rather than bin --version.
  const testDoBody = isLibrary
    ? [
        `    ENV["GEM_HOME"] = libexec`,
        `    assert_match ${rubyString(gemName)}, shell_output("gem list --local")`,
        `    system "ruby", "-e", ${rubyString(`gem "${gemName}"; require "${requireName}"`)}`,
      ].join("\n")
    : `    assert_match version.to_s, shell_output("#{bin}/${rubyEscape(testBin)} --version")`;

  return {
    template: "gem_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    gemName: rubyString(gemName),
    version: rubyEscape(version),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    livecheckBlock: rubyGemsLivecheckBlock(gemName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(testBin),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
    dependsOnLines,
    testDoBody,
  };
}

export function resolveGemNativeDepends(
  gemName: string,
  options: any = {},
): string[] {
  if (Array.isArray(options.dependsOn)) {
    return options.dependsOn.map(String).filter(Boolean);
  }
  const key = String(gemName || "");
  const fromMap = GEM_NATIVE_DEPENDS[key] || GEM_NATIVE_DEPENDS[key.replace(/-/g, "_")] || [];
  // Many gems with native extensions need a C toolchain at install time.
  // pkgconf is the modern Homebrew name (pkg-config is an alias).
  const extra: string[] = [];
  if (options.nativeBuild === true && !fromMap.includes("pkgconf")) {
    extra.push("pkgconf");
  }
  return [...new Set([...fromMap, ...extra])];
}

export async function generateGemPackage(
  gemName: string,
  repoInfo: any = null,
  options: any = {},
) {
  const payload = await collectGemPackagePayload(gemName, repoInfo, options);
  return writeRenderedFormula(payload, options.tapPath);
}

async function fetchRubyGemsData(gemName: string) {
  const base = process.env.RUBYGEMS_URL || "https://rubygems.org";
  const url = `${base}/api/v1/gems/${encodeURIComponent(gemName)}.json`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" },
  });
  if (!response.ok) {
    throw new Error(`RubyGems lookup failed for ${gemName}: ${response.status}`);
  }
  const data = await response.json();
  if (!data.version || !data.gem_uri) {
    throw new Error(`Incomplete gem data for ${gemName}`);
  }

  // Prefer version metadata for executables when available (v2 API).
  let executables: string[] | null = null;
  try {
    const v2Url = `${base}/api/v2/rubygems/${encodeURIComponent(gemName)}/versions/${encodeURIComponent(data.version)}.json`;
    const v2Res = await fetch(v2Url, {
      headers: { Accept: "application/json", "User-Agent": "allbrew/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (v2Res.ok) {
      const v2 = await v2Res.json();
      if (Array.isArray(v2?.executables)) {
        executables = v2.executables.map(String);
      } else if (Array.isArray(v2?.metadata?.executables)) {
        executables = v2.metadata.executables.map(String);
      }
    }
  } catch {
    /* optional */
  }

  // Some gems expose executables only under dependencies/extensions in v1.
  if (executables == null && Array.isArray(data.executables)) {
    executables = data.executables.map(String);
  }

  return {
    version: data.version,
    gemUri: data.gem_uri,
    info: data.info,
    homepageUri: data.homepage_uri,
    licenses: data.licenses,
    executables,
  };
}

function rubyGemsLivecheckBlock(gemName: string) {
  const base = process.env.RUBYGEMS_URL || "https://rubygems.org";
  const url = `${base}/api/v1/gems/${encodeURIComponent(gemName)}.json`;
  return (
    `  livecheck do\n` +
    `    url ${rubyString(url)}\n` +
    `    regex(/"version"\\s*:\\s*"v?([^"\\\\]+)"/i)\n` +
    `  end\n\n`
  );
}
