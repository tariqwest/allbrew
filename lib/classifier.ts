import { assertSafeFetchUrl } from "./utils.ts";

const GITHUB_REPO_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/;
const GITHUB_REPO_TREE_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(tree|blob)\//;

// GitHub pseudo-owners that look like a repo root but are site pages
// (e.g. https://github.com/sponsors/schollz or https://github.com/settings).
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

const APP_STORE_RE = /^https?:\/\/(apps\.apple\.com|itunes\.apple\.com)\//;

const SETAPP_APP_RE = /^https?:\/\/setapp\.com\/apps\/([^/?#]+)/i;

const NPM_PACKAGE_RE =
  /^https?:\/\/(?:www\.)?npmjs\.com\/package\/(@[^/]+\/[^/]+|[^/]+)/;
const PYPI_PACKAGE_RE =
  /^https?:\/\/(?:www\.)?pypi\.org\/project\/([^/]+)/;
const RUBYGEMS_PACKAGE_RE =
  /^https?:\/\/(?:www\.)?rubygems\.org\/gems\/([^/]+)/;
const NUGET_PACKAGE_RE =
  /^https?:\/\/(?:www\.)?nuget\.org\/packages\/([^/]+)/;

const CRATES_PACKAGE_RE =
  /^https?:\/\/(?:www\.)?crates\.io\/crates\/([^/]+)/;

const HOMEBREW_FORMULA_RE =
  /^https?:\/\/formulae\.brew\.sh\/formula\/([^/?#]+)/i;
const HOMEBREW_CASK_RE =
  /^https?:\/\/formulae\.brew\.sh\/cask\/([^/?#]+)/i;

const SCRIPT_EXTENSIONS = [".sh", ".bash"];
const RAW_GITHUB_RE = /^https?:\/\/raw\.githubusercontent\.com\//;

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

// Many install-portal CDNs (e.g. getcroc.schollz.com) Vary on User-Agent:
// browsers get a marketing HTML SPA; curl gets the shell installer.
const CLASSIFY_UA_CURL = "curl/8.4.0 allbrew/1.0";
const CLASSIFY_UA_BROWSER = "allbrew/1.0";

const SHEBANG_RE =
  /^#!\s*(?:\/usr\/bin\/env[ \t]+|\/(?:usr\/bin\/|bin\/))(?:ba|z)?sh\b/im;

export function classify(url) {
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();

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

  const homebrewFormulaMatch = url.match(HOMEBREW_FORMULA_RE);
  if (homebrewFormulaMatch) {
    return { type: "homebrew-formula", url, name: homebrewFormulaMatch[1] };
  }

  const homebrewCaskMatch = url.match(HOMEBREW_CASK_RE);
  if (homebrewCaskMatch) {
    return { type: "homebrew-cask", url, name: homebrewCaskMatch[1] };
  }

  const ghMatch = url.match(GITHUB_REPO_RE);
  if (ghMatch && !GITHUB_RESERVED_OWNERS.has(ghMatch[1].toLowerCase())) {
    return {
      type: "github-repo",
      url,
      owner: ghMatch[1],
      repo: ghMatch[2].replace(/\.git$/, ""),
    };
  }

  const ghTreeMatch = url.match(GITHUB_REPO_TREE_RE);
  if (ghTreeMatch && !GITHUB_RESERVED_OWNERS.has(ghTreeMatch[1].toLowerCase())) {
    return {
      type: "github-repo",
      url: `https://github.com/${ghTreeMatch[1]}/${ghTreeMatch[2]}`,
      owner: ghTreeMatch[1],
      repo: ghTreeMatch[2].replace(/\.git$/, ""),
    };
  }

  if (
    SCRIPT_EXTENSIONS.some((ext) => path.endsWith(ext)) ||
    RAW_GITHUB_RE.test(url)
  ) {
    if (
      RAW_GITHUB_RE.test(url) &&
      !SCRIPT_EXTENSIONS.some((ext) => path.endsWith(ext))
    ) {
      // raw github but not .sh -- could be anything, check extension
      if (ARCHIVE_EXTENSIONS.some((ext) => path.endsWith(ext))) {
        return { type: "archive", url };
      }
    }
    return { type: "bash-script", url };
  }

  if (path.endsWith(".dmg") || path.endsWith(".pkg")) {
    // .pkg is a first-class macOS installer (Homebrew cask artifact), not a source archive
    return { type: "cask-dmg", url };
  }

  if (ARCHIVE_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return { type: "archive", url };
  }

  return { type: "unknown", url };
}

/** True when a snippet starts with a POSIX/bash/zsh shebang. */
export function looksLikeShellScript(snippet: string): boolean {
  if (!snippet) return false;
  const head = String(snippet).slice(0, 256);
  return SHEBANG_RE.test(head);
}

function isBinarySample(buf: Uint8Array, threshold = 0.05): boolean {
  let nonText = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0) {
      nonText += 4;
      continue;
    }
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) nonText++;
  }
  return buf.length > 0 && nonText / buf.length > threshold;
}

/**
 * Range-GET an extensionless installer and peek at the first bytes for a
 * shell shebang. Rejects HTML pages and binary archives.
 */
async function sniffShellScriptBody(
  url: string,
  userAgent: string = CLASSIFY_UA_CURL,
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/plain,*/*;q=0.8",
        Range: "bytes=0-1023",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok && response.status !== 206) return false;
    const ct = (response.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html") || ct.includes("application/xhtml")) {
      return false;
    }
    const buf = new Uint8Array(await response.arrayBuffer());
    const sample = buf.slice(0, Math.min(buf.length, 1024));
    if (isBinarySample(sample)) return false;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(sample);
    const head = text.replace(/^\uFEFF/, "").trimStart().slice(0, 256);
    return looksLikeShellScript(head);
  } catch {
    return false;
  }
}

function isMaybeScriptContentType(ct: string): boolean {
  return (
    !ct ||
    ct.startsWith("text/plain") ||
    ct.includes("text/x-") ||
    ct.startsWith("application/octet-stream") ||
    ct.includes("application/x-download") ||
    ct.includes("binary/octet-stream")
  );
}

export async function classifyWithHead(url) {
  const result = classify(url);
  if (result.type !== "unknown") return result;

  assertSafeFetchUrl(url);

  const tryHead = async (userAgent: string) => {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/plain,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(30_000),
    });

    const ct = (response.headers.get("content-type") || "").toLowerCase();
    const disp = (response.headers.get("content-disposition") || "").toLowerCase();
    let headPath = "";
    try {
      headPath = new URL(response.url || url).pathname.toLowerCase();
    } catch {
      /* ignore */
    }
    return { ct, disp, headPath };
  };

  const classifyFromHeaders = ({
    ct,
    disp,
    headPath,
  }: {
    ct: string;
    disp: string;
    headPath: string;
  }) => {
    if (
      ct.includes("application/x-apple-diskimage") ||
      disp.includes(".dmg") ||
      ct.includes("application/vnd.apple.installer") ||
      disp.includes(".pkg") ||
      headPath.endsWith(".pkg")
    ) {
      return { type: "cask-dmg", url };
    }

    if (
      ct.includes("application/zip") ||
      ct.includes("application/gzip") ||
      ct.includes("application/x-tar") ||
      ct.includes("application/x-bzip2") ||
      ct.includes("application/x-xz")
    ) {
      return { type: "archive", url };
    }

    if (ct.includes("text/x-shellscript") || ct.includes("application/x-sh")) {
      return { type: "bash-script", url };
    }

    return null;
  };

  // 1. Prefer a curl-like UA first: install portals often serve the real
  //    installer to curl and an HTML SPA to browsers.
  try {
    let head = await tryHead(CLASSIFY_UA_CURL);
    let classified = classifyFromHeaders(head);
    if (classified) return classified;

    if (isMaybeScriptContentType(head.ct)) {
      if (await sniffShellScriptBody(url, CLASSIFY_UA_CURL)) {
        return { type: "bash-script", url };
      }
    }

    // 2. Some marketing/CDN pages report text/html on HEAD but actually
    //    serve a DMG or archive on GET. Try a browser UA HEAD as a quick probe.
    if (head.ct.includes("text/html") || head.ct.includes("application/xhtml")) {
      head = await tryHead(CLASSIFY_UA_BROWSER);
      classified = classifyFromHeaders(head);
      if (classified) return classified;
    }
  } catch {
    // fall through
  }

  // 3. Final fallback: some endpoints don't support HEAD or lie about CT.
  //    Do a ranged GET and either classify by response headers or sniff body.
  try {
    const getRes = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": CLASSIFY_UA_CURL,
        Accept: "text/plain,*/*;q=0.8",
        Range: "bytes=0-1023",
      },
      signal: AbortSignal.timeout(30_000),
    });

    const gct = (getRes.headers.get("content-type") || "").toLowerCase();
    const gdisp = (getRes.headers.get("content-disposition") || "").toLowerCase();
    let gpath = "";
    try {
      gpath = new URL(getRes.url || url).pathname.toLowerCase();
    } catch {
      /* ignore */
    }

    let classified = classifyFromHeaders({ ct: gct, disp: gdisp, headPath: gpath });
    if (classified) return classified;

    if (isMaybeScriptContentType(gct)) {
      const buf = new Uint8Array(await getRes.arrayBuffer());
      const sample = buf.slice(0, Math.min(buf.length, 1024));
      if (!isBinarySample(sample)) {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(sample);
        const head = text.replace(/^\uFEFF/, "").trimStart().slice(0, 256);
        if (looksLikeShellScript(head)) {
          return { type: "bash-script", url };
        }
      }
    }
  } catch {
    // fall through
  }

  // 4. Install portal paths that may require a browser UA (rare).
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (
      /(?:^|\/)install(?:\.sh)?$|(?:^|\/)launch$/.test(path) &&
      (await sniffShellScriptBody(url, CLASSIFY_UA_BROWSER))
    ) {
      return { type: "bash-script", url };
    }
  } catch {
    // fall through
  }

  return { type: "unknown", url };
}
