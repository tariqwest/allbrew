/**
 * Deterministic rule oracle for classifier strategy selection.
 *
 * Intentionally re-implements the documented classify priority/regexes so
 * drift between this oracle and `lib/classifier.ts` is visible in validation.
 * Do not import `classify` here.
 */

export type OracleResult = {
  type: string;
  url: string;
  owner?: string;
  repo?: string;
  packageName?: string;
  gemName?: string;
  crateName?: string;
  slug?: string;
};

// Documented priority (mirrors lib/classifier.ts order):
// 1. MAS / Setapp
// 2. npm / PyPI / RubyGems / NuGet / crates.io
// 3. GitHub repo root or tree/blob
// 4. .sh/.bash or raw.githubusercontent (archive ext → archive else bash-script)
// 5. .dmg → cask-dmg; other archive exts → archive
// 6. unknown

const APP_STORE_RE = /^https?:\/\/(apps\.apple\.com|itunes\.apple\.com)\//i;
const SETAPP_APP_RE = /^https?:\/\/setapp\.com\/apps\/([^/?#]+)/i;
const NPM_PACKAGE_RE =
  /^https?:\/\/(?:www\.)?npmjs\.com\/package\/(@[^/]+\/[^/]+|[^/]+)/i;
const PYPI_PACKAGE_RE =
  /^https?:\/\/(?:www\.)?pypi\.org\/project\/([^/]+)/i;
const RUBYGEMS_PACKAGE_RE =
  /^https?:\/\/(?:www\.)?rubygems\.org\/gems\/([^/]+)/i;
const NUGET_PACKAGE_RE =
  /^https?:\/\/(?:www\.)?nuget\.org\/packages\/([^/]+)/i;
const CRATES_PACKAGE_RE =
  /^https?:\/\/(?:www\.)?crates\.io\/crates\/([^/]+)/i;
const GITHUB_REPO_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i;
const GITHUB_REPO_TREE_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(tree|blob)\//i;
const RAW_GITHUB_RE = /^https?:\/\/raw\.githubusercontent\.com\//i;

// GitHub pseudo-owners that look like a repo root but are site pages.
const GITHUB_RESERVED_OWNERS = new Set([
  "sponsors",
  "orgs",
  "settings",
  "marketplace",
  "topics",
  "collections",
  "events",
  "features",
  "pricing",
  "enterprise",
  "customer-stories",
  "readme",
  "about",
  "site",
  "login",
  "join",
  "notifications",
  "account",
  "pulls",
  "issues",
  "codespaces",
  "explore",
  "sessions",
  "logout",
]);

const SCRIPT_EXTENSIONS = [".sh", ".bash"];
const ARCHIVE_EXTENSIONS = [
  ".tar.gz",
  ".tgz",
  ".tar.bz2",
  ".tar.xz",
  ".zip",
  ".gz",
  ".bz2",
  ".xz",
];

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function endsWithAny(path: string, exts: string[]): boolean {
  return exts.some((ext) => path.endsWith(ext));
}

/**
 * Apply documented classifier rules to a URL without calling `classify`.
 */
export function oracleClassify(url: string): OracleResult {
  const path = pathOf(url);

  if (APP_STORE_RE.test(url)) {
    return { type: "mac-app-store", url };
  }

  const setappMatch = url.match(SETAPP_APP_RE);
  if (setappMatch) {
    return { type: "setapp-app", url, slug: setappMatch[1] };
  }

  const npmMatch = url.match(NPM_PACKAGE_RE);
  if (npmMatch) {
    return { type: "npm-package", url, packageName: npmMatch[1] };
  }

  const pypiMatch = url.match(PYPI_PACKAGE_RE);
  if (pypiMatch) {
    return { type: "pip-package", url, packageName: pypiMatch[1] };
  }

  const gemMatch = url.match(RUBYGEMS_PACKAGE_RE);
  if (gemMatch) {
    return { type: "gem-package", url, gemName: gemMatch[1] };
  }

  const nugetMatch = url.match(NUGET_PACKAGE_RE);
  if (nugetMatch) {
    return { type: "dotnet-package", url, packageName: nugetMatch[1] };
  }

  const cratesMatch = url.match(CRATES_PACKAGE_RE);
  if (cratesMatch) {
    return { type: "cargo-package", url, crateName: cratesMatch[1] };
  }

  const ghMatch = url.match(GITHUB_REPO_RE);
  if (ghMatch && !GITHUB_RESERVED_OWNERS.has(ghMatch[1].toLowerCase())) {
    return {
      type: "github-repo",
      url,
      owner: ghMatch[1],
      repo: ghMatch[2].replace(/\.git$/i, ""),
    };
  }

  const ghTreeMatch = url.match(GITHUB_REPO_TREE_RE);
  if (
    ghTreeMatch &&
    !GITHUB_RESERVED_OWNERS.has(ghTreeMatch[1].toLowerCase())
  ) {
    return {
      type: "github-repo",
      url: `https://github.com/${ghTreeMatch[1]}/${ghTreeMatch[2]}`,
      owner: ghTreeMatch[1],
      repo: ghTreeMatch[2].replace(/\.git$/i, ""),
    };
  }

  if (
    endsWithAny(path, SCRIPT_EXTENSIONS) ||
    RAW_GITHUB_RE.test(url)
  ) {
    if (
      RAW_GITHUB_RE.test(url) &&
      !endsWithAny(path, SCRIPT_EXTENSIONS)
    ) {
      if (endsWithAny(path, ARCHIVE_EXTENSIONS)) {
        return { type: "archive", url };
      }
    }
    return { type: "bash-script", url };
  }

  if (path.endsWith(".dmg") || path.endsWith(".pkg")) {
    return { type: "cask-dmg", url };
  }

  if (endsWithAny(path, ARCHIVE_EXTENSIONS)) {
    return { type: "archive", url };
  }

  return { type: "unknown", url };
}

export function oracleAgrees(
  actual: { type: string; [k: string]: unknown },
  expected: OracleResult,
  fields: string[] = [],
): { agree: boolean; fieldMismatches: string[] } {
  const fieldMismatches: string[] = [];
  if (actual.type !== expected.type) {
    return { agree: false, fieldMismatches: ["type"] };
  }
  for (const f of fields) {
    if (expected[f] !== undefined && actual[f] !== expected[f]) {
      fieldMismatches.push(f);
    }
  }
  return { agree: fieldMismatches.length === 0, fieldMismatches };
}
