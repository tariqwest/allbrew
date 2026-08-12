import { classify } from "./classifier.ts";
import { detectScriptInstall } from "./analyzer.ts";
import { assertSafePublicFetchUrl, fetchTextLimited } from "./utils.ts";

export type DiscoverMode = "auto" | "static" | "webview" | "off";

export type DiscoverCandidate = {
  url: string;
  kind: string;
  score: number;
  evidence: string[];
  source: "static" | "webview";
};

export type DiscoverResult = {
  pageUrl: string;
  finalPageUrl: string;
  method: "static" | "webview" | "none";
  candidates: DiscoverCandidate[];
  chosen: DiscoverCandidate | null;
  reason?: string;
};

const ARCHIVE_EXTS = [
  ".tar.gz",
  ".tgz",
  ".tar.bz2",
  ".tar.xz",
  ".zip",
  ".pkg",
  ".gz",
  ".bz2",
  ".xz",
];

const IGNORE_HREF_RE =
  /^(mailto:|javascript:|tel:|data:|#)/i;
const SOCIAL_HOST_RE =
  /(?:twitter\.com|x\.com|facebook\.com|linkedin\.com|instagram\.com|youtube\.com|discord\.gg|discord\.com)$/i;

export function parseDiscoverMode(raw: unknown): DiscoverMode {
  if (raw === false || raw === "off" || raw === "false" || raw === "0") {
    return "off";
  }
  if (raw === true || raw == null || raw === "" || raw === "auto") return "auto";
  const s = String(raw).toLowerCase();
  if (s === "static" || s === "webview" || s === "auto" || s === "off") {
    return s;
  }
  return "auto";
}

function registrableHint(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

function sameSite(a: string, b: string): boolean {
  try {
    return registrableHint(new URL(a).hostname) === registrableHint(new URL(b).hostname);
  } catch {
    return false;
  }
}

/**
 * Reject JS allowlist / MIME-extension spam that regexes treat as archives
 * (e.g. path `/.7z,.aac,...,.dmg,...,.zip` from Superconductor SPA bundles).
 */
export function isImplausibleArtifactUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname || "";
    const base = path.split("/").filter(Boolean).pop() || path;
    // Comma-separated extension lists are never real download paths
    if (base.includes(",") || path.includes(",.")) return true;
    // Many dotted segments that look like extension enumerations
    const extHits = base.match(/\.(?:7z|aac|apk|avi|bmp|bz2|css|csv|deb|dmg|doc|docx|exe|gif|gz|heic|heif|ico|iso|jpe?g|js|json|m4a|mkv|mov|mp3|mp4|mpeg|mpg|msi|ogg|ogv|pdf|pkg|png|ppt|pptx|rar|rtf|svg|tar|tgz|tif|tiff|txt|wav|webm|webp|wma|wmv|xls|xlsx|xml|zip)/gi);
    if (extHits && extHits.length >= 3) return true;
    // Bare multi-extension stem starting with a leading dot (e.g. /.zip)
    if (/^\/?\.[a-z0-9]{2,5}(?:,\.[a-z0-9]{2,5})+/i.test(path)) return true;
    return false;
  } catch {
    return true;
  }
}

/** Same-site marketing download hub paths worth a second HTML fetch. */
export function isDownloadHubPath(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (/\.(dmg|pkg|zip|tgz|tar\.gz|sh|bash|js|css|png|jpe?g|svg|webp)(?:\?|#|$)/i.test(p)) {
      return false;
    }
    // Extensionless binary endpoints (e.g. /download/mac → DMG via Content-Type)
    // are install artifacts, not HTML marketing hubs to re-fetch as text.
    // Inline (do not call looksLikeExtensionlessArtifactUrl — it consults this helper).
    if (
      /(?:^|\/)download(?:s)?\/(?:latest|current|stable|mac|macos|osx|darwin)(?:\/|$)/i.test(p) ||
      /(?:^|\/)(?:latest|current)\/(?:mac|macos|osx|darwin|dmg)(?:\/|$)/i.test(p)
    ) {
      return false;
    }
    return (
      /(?:^|\/)(?:download|downloads|get|install)(?:\/|$)/i.test(p) ||
      /(?:^|\/)(?:mac|macos|desktop)(?:-?app)?(?:\/|$)/i.test(p) ||
      /(?:^|\/)(?:thanks|thank-you|thankyou)(?:\.html)?(?:\/|$)/i.test(p)
    );
  } catch {
    return false;
  }
}

function normalizeCandidateUrl(raw: string, base: string): string | null {
  if (!raw) return null;
  let href = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!href || IGNORE_HREF_RE.test(href)) return null;
  try {
    const abs = new URL(href, base).href;
    assertSafePublicFetchUrl(abs);
    const u = new URL(abs);
    if (SOCIAL_HOST_RE.test(u.hostname)) return null;
    // Drop pure image assets
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|map|woff2?)(?:\?|#|$)/i.test(u.pathname)) {
      return null;
    }
    if (isImplausibleArtifactUrl(abs)) return null;
    return abs;
  } catch {
    return null;
  }
}

function pathLooksLinuxOnly(url: string): boolean {
  return /linux|ubuntu|debian|appimage|\.deb|\.rpm/i.test(url) &&
    !/darwin|macos|osx|mac(?![a-z])/i.test(url);
}

function pathLooksMac(url: string): boolean {
  return /darwin|macos|osx|(?:^|[^a-z])mac(?:[^a-z]|$)|universal|\.dmg/i.test(url);
}

const STATIC_ASSET_PATH_RE =
  /\.(?:png|jpe?g|gif|svg|webp|ico|css|js|mjs|map|woff2?|ttf|otf|eot|mp4|webm|mp3|json|webmanifest)(?:\?|#|$)/i;

/** True when URL is a digital-store product page that typically gates the real file. */
export function isStoreDownloadGateUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname;
    if (
      (/(?:^|\.)gumroad\.com$/i.test(host) && /\/l\/[a-z0-9_-]+/i.test(path)) ||
      (/^(?:www\.)?gum\.co$/i.test(host) && path.length > 1)
    ) {
      return true;
    }
    // itch.io product pages (not direct file CDN paths)
    if (/\.itch\.io$/i.test(host) && !STATIC_ASSET_PATH_RE.test(path) &&
        !/\.(dmg|pkg|zip|tgz|tar\.gz)(?:\?|#|$)/i.test(path)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Best store-gate candidate when no direct artifact is available. */
export function findStoreDownloadGate(
  candidates: DiscoverCandidate[],
): DiscoverCandidate | null {
  const gates = candidates
    .filter((c) => c.kind === "store-download-gate" || isStoreDownloadGateUrl(c.url))
    .sort((a, b) => b.score - a.score);
  return gates[0] || null;
}

/**
 * Extensionless vendor download APIs (e.g. Postman `…/download/latest/osx`,
 * Halo `https://api.heyhalo.app/download/latest`) that serve a binary via
 * Content-Type / Content-Disposition rather than a `.dmg` path suffix.
 */
export function looksLikeExtensionlessArtifactUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname || "";
    if (/\.(dmg|pkg|zip|tgz|tar\.gz|tar\.bz2|tar\.xz|sh|bash)(?:\?|#|$)/i.test(path)) {
      return false;
    }
    // Marketing HTML hubs (no trailing "latest"/osx/mac segment)
    if (isDownloadHubPath(url) && !/(?:^|\/)(?:latest|current|stable|osx|macos|mac|darwin|arm64|universal)(?:\/|$)/i.test(path)) {
      return false;
    }
    if (
      /(?:^|\/)download(?:s)?\/(?:latest|current|stable)(?:\/|$)/i.test(path) ||
      /(?:^|\/)download(?:s)?\/(?:mac|macos|osx|darwin)(?:\/|$)/i.test(path) ||
      /(?:^|\/)(?:latest|current)\/(?:mac|macos|osx|darwin|dmg)(?:\/|$)/i.test(path) ||
      /[?&](?:platform|os)=(?:mac|macos|osx|darwin)/i.test(u.search)
    ) {
      return true;
    }
    // api.* host + download path (same brand CDNs)
    if (/^api\./i.test(u.hostname) && /(?:^|\/)download/i.test(path)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * GitHub repos that are companions / SDKs / mobile, not the primary Mac app.
 * Used to demote footer "GitHub" links (e.g. heyhalo-ios) on desktop product pages.
 */
export function isSecondaryGithubRepoUrl(url: string): boolean {
  const parsed = parseGithubRepoHome(url);
  if (!parsed) return false;
  const repo = parsed.repo.toLowerCase();
  return /(?:^|[-_])(?:ios|android|mobile|swiftui|flutter|rn|react-native|sdk|kit|reach|companion|docs|website|web|landing|examples?|samples?|vscode|chrome|firefox|extension)(?:$|[-_])/i.test(
    repo,
  );
}

/**
 * Agent skills / plugins / companion packs shipped as small ZIPs next to the
 * real Mac app (e.g. ego-browser-v1.2.5.zip on citrolabs/ego-lite). These must
 * not win discovery over CDN DMGs on /download.
 */
export function isSkillOrCompanionAssetUrl(url: string): boolean {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep raw */
  }
  const base = path.split("/").pop() || path;
  // Skill/plugin packs: ego-browser-*.zip, *-skill-*, *skills*, *mcp-server* zips
  if (!/\.(zip|tgz|tar\.gz)(?:\?|#|$)/i.test(base) && !/\.(zip|tgz|tar\.gz)$/i.test(path)) {
    // Also match path segments without requiring extension when name is clear
    if (!/(?:^|[-_/])(?:skill|skills|mcp)(?:$|[-_/])/i.test(path)) return false;
  }
  if (
    /(?:^|[-_.])(?:skill|skills)(?:$|[-_.])/i.test(base) ||
    /(?:^|[-_.])(?:plugin|plugins)(?:$|[-_.])/i.test(base) ||
    /ego-browser/i.test(base) ||
    /(?:^|[-_.])mcp(?:[-_.]|$)/i.test(base) ||
    /agent[-_.]?skill/i.test(base) ||
    /browser[-_.]?skill/i.test(base)
  ) {
    return true;
  }
  return false;
}

/**
 * Score a URL for macOS install usefulness. Higher is better.
 */
export function scoreCandidateUrl(
  url: string,
  pageUrl: string,
  evidence: string[] = [],
): DiscoverCandidate {
  const classified = classify(url);
  let score = 0;
  const ev = [...evidence];
  let kind = classified.type === "unknown" ? guessKindFromUrl(url) : classified.type;

  try {
    if (STATIC_ASSET_PATH_RE.test(new URL(url).pathname)) {
      return {
        url,
        kind: "unknown",
        score: -50,
        evidence: [...evidence, "static-asset-penalty"],
        source: "static",
      };
    }
  } catch {
    /* keep scoring */
  }

  switch (classified.type) {
    case "cask-dmg":
      score += 100;
      ev.push("classifier:cask-dmg");
      break;
    case "bash-script":
      score += 85;
      ev.push("classifier:bash-script");
      break;
    case "archive":
      score += 70;
      ev.push("classifier:archive");
      break;
    case "github-repo":
      score += 75;
      ev.push("classifier:github-repo");
      break;
    case "npm-package":
    case "pip-package":
    case "cargo-package":
    case "gem-package":
    case "dotnet-package":
      score += 80;
      ev.push(`classifier:${classified.type}`);
      break;
    case "mac-app-store":
    case "setapp-app":
      score += 90;
      ev.push(`classifier:${classified.type}`);
      // App Store storefront / category / discover pages classify as mac-app-store
      // but cannot be installed (no /idNNNN). Prefer real app links with numeric IDs.
      if (classified.type === "mac-app-store") {
        if (/\/id\d+/i.test(url)) {
          score += 20;
          ev.push("mas-app-id");
        } else {
          score -= 100;
          ev.push("mas-no-app-id-penalty");
        }
      }
      break;
    default:
      score += 10;
      ev.push("classifier:unknown");
  }

  if (pathLooksMac(url)) {
    score += 25;
    ev.push("mac-hint");
  }
  if (pathLooksLinuxOnly(url)) {
    score -= 40;
    ev.push("linux-only-penalty");
  }
  if (/download|releases?|latest/i.test(url)) {
    // Only reward download-ish paths when they look like files/CDNs, not HTML pages
    if (
      /\.(dmg|pkg|zip|tgz|tar\.gz|sh|bash)(?:\?|#|$)/i.test(url) ||
      /cdn|releases\/download|artifacts?/i.test(url) ||
      looksLikeExtensionlessArtifactUrl(url)
    ) {
      score += 10;
      ev.push("download-path");
      if (looksLikeExtensionlessArtifactUrl(url)) {
        score += 20;
        ev.push("extensionless-artifact-api");
      }
    } else if (!sameSite(url, pageUrl)) {
      score += 4;
      ev.push("download-path-soft");
    } else {
      score -= 8;
      ev.push("html-download-page-penalty");
    }
  }
  if (/arm64|aarch64|apple.?silicon/i.test(url)) {
    score += 8;
    ev.push("arm64-hint");
  }
  if (sameSite(url, pageUrl)) {
    score += 12;
    ev.push("same-site");
  } else if (
    /github\.com|raw\.githubusercontent\.com|npmjs\.com|pypi\.org|crates\.io|rubygems\.org|nuget\.org|apps\.apple\.com|setapp\.com/i.test(
      url,
    )
  ) {
    score += 15;
    ev.push("trusted-host");
  }

  // Store product pages (Gumroad PWYW, itch.io, etc.): better than random nav,
  // but never high enough to auto-pick as a cask URL (file is behind checkout).
  if (isStoreDownloadGateUrl(url)) {
    score += 35;
    kind = "store-download-gate";
    ev.push("store-download-gate");
    if (
      evidence.some((e) =>
        /download|get\s+(the\s+)?app|early\s+access|buy|purchase/i.test(e),
      )
    ) {
      score += 8;
      ev.push("download-cta");
    }
  }

  // Footer companion / mobile / SDK repos should not beat a real Mac DMG CTA
  if (classified.type === "github-repo" && isSecondaryGithubRepoUrl(url)) {
    score -= 45;
    ev.push("secondary-github-repo-penalty");
  }

  // Sibling product download lines on multi-product SPAs (wake/work/cli plugins)
  // should lose to the primary desktop app when scores otherwise tie.
  if (/\/(?:qoderwake|qoder-work|jetbrains|plugin)(?:\/|$)/i.test(url) ||
      /(?:qoderwake|QoderWork)[-_]/i.test(url)) {
    score -= 12;
    ev.push("sibling-product-path-penalty");
  }

  // Marketing press kits / media packs are never installers (e.g. CleanShot Presskit.zip).
  if (/press[-_]?kit|mediakit|media[-_]?kit|brand[-_]?assets?/i.test(url)) {
    score -= 80;
    ev.push("presskit-penalty");
  }

  // Agent skill / plugin companion ZIPs (ego-browser skill pack) lose to real DMGs.
  if (isSkillOrCompanionAssetUrl(url)) {
    score -= 70;
    ev.push("skill-companion-asset-penalty");
  }

  // curl|bash install commands are strong signals — the page explicitly says
  // to fetch this URL and pipe to sh. Treat as bash-script even when the
  // path lacks a .sh extension (e.g. https://app.warp.dev/download/agent-cli).
  if (evidence.includes("install-command")) {
    if (kind === "unknown") kind = "bash-script";
    score += 85;
    ev.push("install-command-boost");
    // Extensionless download endpoints serving scripts should not be penalized
    // as generic HTML download pages.
    const hasHtmlPenalty = ev.indexOf("html-download-page-penalty");
    if (hasHtmlPenalty !== -1) {
      score += 8;
      ev.splice(hasHtmlPenalty, 1);
      ev.push("install-command-no-html-penalty");
    }
  }

  // Direct Mac app archives (Things3.zip, Foo.app.zip) should beat MAS storefront
  // links so brew can install without mas + Apple ID.
  if (looksLikeDistributedMacAppArchive(url)) {
    score += 45;
    ev.push("mac-app-archive");
    if (kind === "unknown") kind = "archive";
  }

  return {
    url,
    kind,
    score,
    evidence: ev,
    source: "static",
  };
}

/**
 * Vendor-distributed Mac GUI app archives (not source tarballs / skill packs).
 * e.g. Things3.zip, CleanShotX.dmg already handled as cask-dmg, App.app.zip.
 */
export function looksLikeDistributedMacAppArchive(url: string): boolean {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep raw */
  }
  if (!/\.(zip|tgz|tar\.gz)(?:\?|#|$)/i.test(path)) return false;
  if (isSkillOrCompanionAssetUrl(url)) return false;
  if (/press[-_]?kit|mediakit|source|src[-_.]|sources?[-_.]/i.test(path)) {
    return false;
  }
  const base = path.split("/").pop() || path;
  if (/\.app\.zip$/i.test(base)) return true;
  if (/mac|darwin|osx|universal|arm64|apple.?silicon/i.test(base)) return true;
  // ProductName.zip / ProductName3.zip (capitalized vendor app builds)
  if (/^[A-Z][A-Za-z0-9]+(?:\d+(?:\.\d+)*)?\.zip$/i.test(base)) return true;
  return false;
}

function guessKindFromUrl(url: string): string {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  if (path.endsWith(".dmg")) return "cask-dmg";
  if (path.endsWith(".sh") || path.endsWith(".bash")) return "bash-script";
  if (ARCHIVE_EXTS.some((e) => path.endsWith(e))) return "archive";
  return "unknown";
}

/**
 * Extract candidate download URLs from HTML/text without executing JS.
 */
export function extractCandidatesFromHtml(
  html: string,
  pageUrl: string,
): DiscoverCandidate[] {
  const found = new Map<string, DiscoverCandidate>();

  const add = (raw: string | null | undefined, evidence: string) => {
    if (!raw) return;
    const url = normalizeCandidateUrl(raw, pageUrl);
    if (!url) return;
    const scored = scoreCandidateUrl(url, pageUrl, [evidence]);
    const prev = found.get(url);
    if (!prev || scored.score > prev.score) {
      found.set(url, scored);
    } else if (prev && !prev.evidence.includes(evidence)) {
      prev.evidence.push(evidence);
    }
  };

  // href="..."
  const hrefRe = /\b(?:href|data-href|data-url|data-download-url|data-download)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    add(m[1], "html-attr");
  }

  // meta refresh
  const metaRe =
    /http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url=([^"'>\s]+)/gi;
  while ((m = metaRe.exec(html)) !== null) {
    add(m[1], "meta-refresh");
  }

  // bare absolute URLs
  const bareRe = /https?:\/\/[^\s"'<>)\\]]+/gi;
  while ((m = bareRe.exec(html)) !== null) {
    const cleaned = m[0].replace(/[),.;]+$/g, "");
    // Only keep likely installable bare URLs to limit noise
    if (
      /\.(dmg|pkg|zip|tgz|tar\.gz|tar\.bz2|tar\.xz|sh|bash)(?:\?|#|$)/i.test(cleaned) ||
      /github\.com\/[^/]+\/[^/\s"'<>]+/i.test(cleaned) ||
      /(?:npmjs\.com\/package|pypi\.org\/project|crates\.io\/crates|rubygems\.org\/gems|nuget\.org\/packages|setapp\.com\/apps|apps\.apple\.com)\//i.test(
        cleaned,
      ) ||
      looksLikeExtensionlessArtifactUrl(cleaned) ||
      isStoreDownloadGateUrl(cleaned)
    ) {
      add(cleaned, "bare-url");
    }
  }

  // schema.org SoftwareApplication installUrl / downloadUrl (often JSON-LD)
  const jsonLdRe =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = jsonLdRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray((node as any)["@graph"])) {
          stack.push(...(node as any)["@graph"]);
        }
        for (const key of ["installUrl", "downloadUrl", "url"] as const) {
          const v = (node as Record<string, unknown>)[key];
          if (typeof v === "string" && isStoreDownloadGateUrl(v)) {
            add(v, "json-ld");
          } else if (
            typeof v === "string" &&
            /\.(dmg|pkg|zip|tgz|tar\.gz)(?:\?|#|$)/i.test(v)
          ) {
            add(v, "json-ld");
          }
        }
        for (const val of Object.values(node as object)) {
          if (val && typeof val === "object") stack.push(val);
        }
      }
    } catch {
      /* ignore invalid JSON-LD */
    }
  }

  // curl|bash and other install commands via analyzer
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<[^>]+>/g, "\n");
  const script = detectScriptInstall(text);
  if (script?.url) add(script.url, "install-command");

  return [...found.values()].sort((a, b) => b.score - a.score);
}

/**
 * SPA bundles often concatenate version tokens into fake same-site paths
 * (`/build-0.9.0.dmg`). HEAD-probe those before auto-pick so 404 phantoms
 * do not beat a real Gumroad/itch store gate.
 */
export async function filterUnreachableScriptArtifacts(
  candidates: DiscoverCandidate[],
  pageUrl: string,
  opts: {
    log?: (msg: string) => void;
    maxProbes?: number;
    headOk?: (url: string) => Promise<boolean>;
  } = {},
): Promise<DiscoverCandidate[]> {
  const log = opts.log || (() => {});
  const maxProbes = opts.maxProbes ?? 8;
  const needsProbe = (c: DiscoverCandidate) => {
    if (!(c.kind === "cask-dmg" || c.kind === "archive")) return false;
    if (!/\.(dmg|pkg|zip|tgz|tar\.gz)(?:\?|#|$)/i.test(c.url)) return false;
    const fromBundle = (c.evidence || []).some((e) =>
      /script-bundle|api-or-bundle|extensionless-guess|client-latest-guess/i.test(e),
    );
    // Explicit html-attr / webview href .dmg/.pkg links can still be SPA soft-404s
    // (text/html 200) e.g. launchpad.kosmik.app/getKosmik3/*.dmg after sunset.
    const fromExplicitHref = (c.evidence || []).some((e) =>
      /html-attr|^href$|webview/i.test(e),
    );
    if (!fromBundle && !(fromExplicitHref && c.score >= 100)) return false;
    // Bundle phantoms: same-site only. High-score explicit hrefs: probe any host
    // (CDN / launchpad hosts often differ from marketing page).
    if (fromExplicitHref && c.score >= 100) return true;
    try {
      return sameSite(c.url, pageUrl);
    } catch {
      return false;
    }
  };

  const defaultHeadOk = async (url: string): Promise<boolean> => {
    try {
      assertSafePublicFetchUrl(url);
      let res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
      // Some CDNs reject HEAD; fall back to ranged GET
      if (res.status === 405 || res.status === 501 || res.status === 403) {
        res = await fetch(url, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          redirect: "follow",
          signal: AbortSignal.timeout(12_000),
        });
      }
      if (res.status >= 200 && res.status < 400) {
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        // HTML 200 soft-404s are not installers
        if (ct.includes("text/html") && !/\.(dmg|pkg)(?:\?|#|$)/i.test(url)) {
          return false;
        }
        if (ct.includes("text/html") && /\.(dmg|pkg|zip)(?:\?|#|$)/i.test(url)) {
          // Vercel etc. serve SPA HTML for missing paths
          return false;
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };
  const headOk = opts.headOk || defaultHeadOk;

  const out: DiscoverCandidate[] = [];
  let probes = 0;
  for (const c of candidates) {
    if (!needsProbe(c) || probes >= maxProbes) {
      out.push(c);
      continue;
    }
    probes += 1;
    const ok = await headOk(c.url);
    if (ok) {
      c.evidence = [...(c.evidence || []), "script-artifact-head-ok"];
      out.push(c);
      log(`script-artifact HEAD ok ${c.url}`);
    } else {
      log(`script-artifact HEAD drop ${c.url}`);
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export function mergeCandidates(
  ...lists: DiscoverCandidate[][]
): DiscoverCandidate[] {
  const map = new Map<string, DiscoverCandidate>();
  for (const list of lists) {
    for (const c of list) {
      const prev = map.get(c.url);
      if (!prev || c.score > prev.score) {
        map.set(c.url, {
          ...c,
          evidence: [...new Set([...(prev?.evidence || []), ...c.evidence])],
        });
      } else {
        prev.evidence = [...new Set([...prev.evidence, ...c.evidence])];
        if (c.source === "webview") prev.source = "webview";
      }
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

export function pickAutoCandidate(
  candidates: DiscoverCandidate[],
  opts: { minScore?: number; minMargin?: number } = {},
): DiscoverCandidate | null {
  const minScore = opts.minScore ?? 70;
  const minMargin = opts.minMargin ?? 12;
  // Store gates and pure static noise are never installable artifacts.
  const installable = candidates.filter(
    (c) =>
      c.kind !== "store-download-gate" &&
      !isStoreDownloadGateUrl(c.url) &&
      c.score > 0,
  );
  if (installable.length === 0) return null;
  const top = installable[0];
  if (top.score < minScore) return null;
  if (installable.length > 1 && top.score - installable[1].score < minMargin) {
    // Allow auto if both are same URL kind and top is clearly installable
    if (!(top.score >= 90 && top.kind !== "unknown")) return null;
  }
  return top;
}

const GITHUB_REPO_URL_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)\/?$/i;

/** Parse owner/repo from a clean GitHub repository homepage URL (not blob/tree/issues). */
export function parseGithubRepoHome(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    if (!/^(?:www\.)?github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    const [owner, repoRaw] = parts;
    const repo = repoRaw.replace(/\.git$/i, "");
    if (!owner || !repo || owner === "orgs" || owner === "settings") return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

/**
 * Extract Sparkle appcast feed URLs from HTML/JS (common on macOS product sites).
 */
export function extractAppcastFeedUrls(html: string, pageUrl: string): string[] {
  const feeds = new Set<string>();
  const patterns = [
    /https?:\/\/[^\s"'<>)\\]]+appcast[^\s"'<>)\\]]*/gi,
    /["']([^"']*appcast[^"']*\.xml[^"']*)["']/gi,
    /sparkle:?(?:feed|appcast)[^"'=]*=\s*["']([^"']+)["']/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const raw = (m[1] || m[0] || "").replace(/[),.;]+$/g, "");
      if (!raw) continue;
      try {
        let abs = raw;
        if (raw.startsWith("//")) abs = "https:" + raw;
        else if (!/^https?:\/\//i.test(raw)) abs = new URL(raw, pageUrl).href;
        else abs = new URL(raw).href;
        assertSafePublicFetchUrl(abs);
        if (/\.xml(?:\?|#|$)/i.test(abs) || /appcast/i.test(abs)) feeds.add(abs);
      } catch {
        /* skip */
      }
    }
  }
  return [...feeds];
}

/**
 * Parse Sparkle/RSS appcast XML and return enclosure URLs (prefer .dmg).
 */
export function extractEnclosureUrlsFromAppcastXml(xml: string): string[] {
  const urls: string[] = [];
  const encRe = /<enclosure\b[^>]*\burl\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = encRe.exec(xml)) !== null) {
    const u = m[1].trim();
    if (u) urls.push(u);
  }
  // fallback: bare dmg urls in feed
  if (!urls.length) {
    const bare = xml.match(/https?:\/\/[^\s"'<>]+\.(?:dmg|pkg|zip)/gi) || [];
    for (const u of bare) urls.push(u.replace(/[),.;]+$/g, ""));
  }
  return urls;
}

/**
 * When a marketing page references a Sparkle appcast, fetch enclosures so
 * direct DMG casks beat empty GitHub release tarballs.
 */
export async function enrichSparkleAppcast(
  candidates: DiscoverCandidate[],
  pageUrl: string,
  html: string,
  opts: {
    log?: (msg: string) => void;
    fetchText?: (url: string) => Promise<{ body: string }>;
    maxFeeds?: number;
  } = {},
): Promise<DiscoverCandidate[]> {
  const log = opts.log || (() => {});
  const maxFeeds = opts.maxFeeds ?? 3;
  const hasDmg = candidates.some(
    (c) => c.kind === "cask-dmg" || /\.dmg(?:\?|#|$)/i.test(c.url),
  );
  if (hasDmg) return candidates;

  const feeds = extractAppcastFeedUrls(html, pageUrl);
  if (!feeds.length) return candidates;

  let fetchText = opts.fetchText;
  if (!fetchText) {
    fetchText = async (url: string) => {
      const fetched = await fetchTextLimited(url, {
        maxBytes: 1_500_000,
        timeoutMs: 15_000,
      });
      return { body: fetched.body };
    };
  }

  const extras: DiscoverCandidate[] = [];
  for (const feed of feeds.slice(0, maxFeeds)) {
    try {
      log(`Fetching Sparkle appcast: ${feed}`);
      const { body } = await fetchText(feed);
      const enclosures = extractEnclosureUrlsFromAppcastXml(body);
      for (const assetUrl of enclosures) {
        try {
          assertSafePublicFetchUrl(assetUrl);
        } catch {
          continue;
        }
        if (!/\.(dmg|pkg|zip)(?:\?|#|$)/i.test(assetUrl)) continue;
        if (
          /windows|win32|linux|\.exe/i.test(assetUrl) &&
          !/mac|darwin|osx|\.dmg/i.test(assetUrl)
        ) {
          continue;
        }
        const scored = scoreCandidateUrl(assetUrl, pageUrl, [
          "sparkle-appcast",
          `feed:${feed}`,
        ]);
        scored.score += 30;
        scored.evidence.push("appcast-enrichment");
        extras.push(scored);
      }
    } catch (err: any) {
      log(`appcast enrich ${feed}: ${err?.message || err}`);
    }
  }
  if (!extras.length) return candidates;
  return mergeCandidates(candidates, extras);
}

/**
 * When a marketing page only links GitHub repos (and maybe curl|bash), expand
 * latest-release DMG/PKG/ZIP app assets so macOS desktop installs win over
 * secondary agent install scripts.
 */
export async function enrichGithubReleaseAssets(
  candidates: DiscoverCandidate[],
  pageUrl: string,
  opts: {
    log?: (msg: string) => void;
    getLatestRelease?: (owner: string, repo: string) => Promise<any>;
    maxRepos?: number;
  } = {},
): Promise<DiscoverCandidate[]> {
  const log = opts.log || (() => {});
  const maxRepos = opts.maxRepos ?? 4;
  const hasDmg = candidates.some(
    (c) => c.kind === "cask-dmg" || /\.dmg(?:\?|#|$)/i.test(c.url),
  );
  if (hasDmg) return candidates;

  const seen = new Set<string>();
  const repos: { owner: string; repo: string; sourceUrl: string }[] = [];
  for (const c of candidates) {
    if (c.kind !== "github-repo" && !GITHUB_REPO_URL_RE.test(c.url)) continue;
    const parsed = parseGithubRepoHome(c.url);
    if (!parsed) continue;
    const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    repos.push({ ...parsed, sourceUrl: c.url });
    if (repos.length >= maxRepos) break;
  }
  if (repos.length === 0) return candidates;

  let getLatest = opts.getLatestRelease;
  if (!getLatest) {
    try {
      const gh = await import("./github.ts");
      getLatest = gh.getLatestRelease;
    } catch {
      return candidates;
    }
  }

  const extras: DiscoverCandidate[] = [];
  for (const { owner, repo } of repos) {
    try {
      const release = await getLatest(owner, repo);
      if (!release?.assets?.length) continue;
      for (const asset of release.assets) {
        const assetUrl = String(asset.url || asset.browser_download_url || "");
        const name = String(asset.name || assetUrl);
        if (!assetUrl) continue;
        if (!/\.(dmg|pkg|zip)(?:\?|#|$)/i.test(assetUrl) && !/\.(dmg|pkg|zip)$/i.test(name)) {
          continue;
        }
        // Skip obvious non-mac archives when name encodes platform
        if (/windows|win32|win64|linux|\.exe/i.test(name) && !/mac|darwin|osx/i.test(name)) {
          continue;
        }
        // Skip agent skill / plugin companion packs (not the Mac app installer)
        if (isSkillOrCompanionAssetUrl(assetUrl) || isSkillOrCompanionAssetUrl(name)) {
          continue;
        }
        const scored = scoreCandidateUrl(assetUrl, pageUrl, [
          "github-release-asset",
          `repo:${owner}/${repo}`,
        ]);
        scored.score += 20;
        scored.evidence.push("release-enrichment");
        extras.push(scored);
      }
    } catch (err: any) {
      log(`release enrich ${owner}/${repo}: ${err?.message || err}`);
    }
  }
  if (!extras.length) return candidates;
  return mergeCandidates(candidates, extras);
}

function looksLikeEmptyShell(html: string): boolean {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length < 80 || /id=["'](?:root|app|__next|__nuxt)["']/i.test(html);
}

export type DiscoverOptions = {
  mode?: DiscoverMode;
  verbose?: boolean;
  log?: (msg: string) => void;
  /** Package/app name hint (e.g. --name) for MAS fallback search. */
  nameHint?: string;
  /** Injected for tests: skip network and parse this HTML as the page body. */
  htmlFixture?: { body: string; finalUrl?: string; contentType?: string };
  /** Injected for tests / callers: webview discover implementation. */
  webviewDiscover?: (pageUrl: string) => Promise<DiscoverCandidate[]>;
  /** Injected for tests: fetch HTML for download-hub follow-up pages. */
  fetchHubHtml?: (url: string) => Promise<{ body: string; finalUrl?: string }>;
  /**
   * Injected for tests: iTunes Search API substitute.
   * Return macSoftware-shaped results (trackId, trackName, …).
   */
  itunesSearch?: (
    term: string,
  ) => Promise<Array<Record<string, unknown>>>;
};

/** Hostname label candidates for MAS name search (e.g. pieoneer.app → pieoneer). */
export function productNameHintsFromUrl(pageUrl: string, nameHint?: string): string[] {
  const out: string[] = [];
  const push = (s: string | undefined | null) => {
    if (!s) return;
    const t = String(s).trim();
    if (t.length < 2) return;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  push(nameHint);
  try {
    const host = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    if (parts.length >= 2) {
      // drop TLD; use left-most label (product.example.co.uk → product)
      push(parts[0]);
      if (parts.length >= 3 && parts[0].length <= 3) push(parts[1]);
    } else if (parts.length === 1) {
      push(parts[0]);
    }
  } catch {
    /* ignore */
  }
  return out;
}

function normalizeProductToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * When a marketing page is unreadable (401/403) or yields no install artifacts,
 * search the Mac App Store via iTunes for an exact/high-confidence macSoftware hit.
 */
export async function discoverMasFallbackCandidates(
  pageUrl: string,
  opts: DiscoverOptions = {},
): Promise<DiscoverCandidate[]> {
  const log = opts.log || (() => {});
  const terms = productNameHintsFromUrl(pageUrl, opts.nameHint);
  if (!terms.length) return [];

  const search =
    opts.itunesSearch ||
    (async (term: string) => {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=macSoftware&limit=10`;
      const res = await fetch(url, {
        headers: { "User-Agent": "allbrew/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
      const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
      return data.results || [];
    });

  const candidates: DiscoverCandidate[] = [];
  const seenIds = new Set<string>();

  for (const term of terms.slice(0, 3)) {
    let results: Array<Record<string, unknown>> = [];
    try {
      results = await search(term);
    } catch (err: any) {
      log(`MAS iTunes search failed for "${term}": ${err?.message || err}`);
      continue;
    }
    const termNorm = normalizeProductToken(term);
    for (const r of results) {
      const kind = String(r.kind || "");
      if (kind && kind !== "mac-software") continue;
      const trackId = r.trackId != null ? String(r.trackId) : "";
      const trackName = String(r.trackName || "");
      if (!trackId || !trackName) continue;
      if (seenIds.has(trackId)) continue;

      const nameNorm = normalizeProductToken(trackName);
      const exact = nameNorm === termNorm;
      // Prefix only for edition suffixes (Pro/App/Desktop…), not different products
      // e.g. reject "Kosmik Revenge" for term "kosmik".
      const masEditionSuffix =
        /^(app|pro|desktop|mac|formac|studio|lite|plus|premium|client|native)$/i;
      let prefix = false;
      if (!exact && Math.min(nameNorm.length, termNorm.length) >= 4) {
        if (nameNorm.startsWith(termNorm)) {
          const rest = nameNorm.slice(termNorm.length);
          prefix = !rest || masEditionSuffix.test(rest);
        } else if (termNorm.startsWith(nameNorm)) {
          const rest = termNorm.slice(nameNorm.length);
          prefix = !rest || masEditionSuffix.test(rest);
        }
      }
      if (!exact && !prefix) {
        continue;
      }

      let score = exact ? 96 : 82;
      const evidence = [
        "mas-itunes-search-fallback",
        exact ? "mas-name-exact" : "mas-name-prefix",
        `term:${term}`,
      ];

      // Bonus when seller homepage hostname relates to the input host
      try {
        const seller = String(r.sellerUrl || "");
        const pageHost = new URL(pageUrl).hostname.replace(/^www\./, "");
        if (seller) {
          const sellerHost = new URL(seller).hostname.replace(/^www\./, "");
          const pageLabel = pageHost.split(".")[0];
          if (
            sellerHost.includes(pageLabel) ||
            pageHost.includes(sellerHost.split(".")[0] || "")
          ) {
            score += 4;
            evidence.push("mas-seller-host-related");
          }
        }
      } catch {
        /* ignore */
      }

      seenIds.add(trackId);
      candidates.push({
        url: `https://apps.apple.com/app/id${trackId}?mt=12`,
        kind: "mac-app-store",
        score,
        evidence,
        source: "static",
      });
    }
    if (candidates.some((c) => c.score >= 90)) break;
  }

  return candidates.sort((a, b) => b.score - a.score);
}

/**
 * When the landing page only has nav links, crawl a few same-site download hubs
 * (e.g. /download) and merge their HTML candidates so real DMG/MAS links win.
 */
export async function enrichDownloadHubPages(
  candidates: DiscoverCandidate[],
  pageUrl: string,
  pageHtml: string,
  opts: {
    log?: (msg: string) => void;
    maxHubs?: number;
    htmlFixture?: { body: string; finalUrl?: string; contentType?: string };
    fetchHtml?: (url: string) => Promise<{ body: string; finalUrl?: string }>;
    /** Test map of hub URL → HTML body */
    hubHtmlByUrl?: Record<string, string>;
  } = {},
): Promise<DiscoverCandidate[]> {
  const log = opts.log || (() => {});
  const maxHubs = opts.maxHubs ?? 3;
  // Real Mac installers short-circuit hub crawl. Generic GitHub ZIPs (skills,
  // source archives, companion packs) must NOT — product SPAs often hide the
  // real CDN DMG only on /download (e.g. lite.ego.app → cdn.ego.app egolite.dmg).
  // mac-app-store / setapp alone also do NOT short-circuit.
  const hasStrong = candidates.some((c) => {
    if (c.score < 70 || c.kind === "unknown") return false;
    if (isSkillOrCompanionAssetUrl(c.url)) return false;
    if (c.kind === "cask-dmg" || /\.dmg(?:\?|#|$)/i.test(c.url)) return true;
    if (c.kind === "bash-script" || /\.(?:sh|bash)(?:\?|#|$)/i.test(c.url)) return true;
    if (/\.pkg(?:\?|#|$)/i.test(c.url)) return true;
    // App-shaped archives only (not bare skill zips)
    if (
      (c.kind === "archive" || /\.(zip|tgz|tar\.gz)(?:\?|#|$)/i.test(c.url)) &&
      /mac|darwin|osx|universal|\.app/i.test(c.url)
    ) {
      return true;
    }
    return false;
  });
  if (hasStrong) return candidates;

  const hubs = new Set<string>();
  // From already-scored candidates
  for (const c of candidates) {
    if (!sameSite(c.url, pageUrl)) continue;
    if (isDownloadHubPath(c.url)) hubs.add(c.url.split("#")[0]);
  }
  // From landing HTML hrefs even if scored low / filtered
  const hrefRe = /\b(?:href|data-href)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(pageHtml)) !== null) {
    const abs = normalizeCandidateUrl(m[1], pageUrl);
    if (!abs || !sameSite(abs, pageUrl)) continue;
    if (isDownloadHubPath(abs)) hubs.add(abs.split("#")[0]);
  }
  // Also try well-known hub on same origin when page mentions Download
  try {
    if (/download/i.test(pageHtml)) {
      const origin = new URL(pageUrl).origin;
      for (const p of ["/download", "/downloads", "/get"]) {
        hubs.add(new URL(p, origin).href);
      }
    }
  } catch {
    /* ignore */
  }

  const hubList = [...hubs]
    .filter((u) => {
      try {
        return new URL(u).pathname.replace(/\/+$/, "") !== new URL(pageUrl).pathname.replace(/\/+$/, "");
      } catch {
        return false;
      }
    })
    .slice(0, maxHubs);

  if (!hubList.length) return candidates;

  const extras: DiscoverCandidate[] = [];
  for (const hub of hubList) {
    try {
      let body = "";
      let finalUrl = hub;
      if (opts.hubHtmlByUrl?.[hub]) {
        body = opts.hubHtmlByUrl[hub];
      } else if (opts.fetchHtml) {
        const fetched = await opts.fetchHtml(hub);
        body = fetched.body;
        finalUrl = fetched.finalUrl || hub;
      } else if (opts.htmlFixture && !opts.fetchHtml) {
        // Offline unit tests without hub fixtures: skip network
        continue;
      } else {
        const fetched = await fetchTextLimited(hub, {
          maxBytes: 2_000_000,
          timeoutMs: 20_000,
        });
        body = fetched.body;
        finalUrl = fetched.url || hub;
        // Hub redirects straight to a .zip/.dmg (e.g. Things /download → Things3.zip).
        if (
          fetched.binaryArtifact ||
          looksLikeDistributedMacAppArchive(finalUrl) ||
          /\.(dmg|pkg|zip)(?:\?|#|$)/i.test(finalUrl)
        ) {
          const direct = scoreCandidateUrl(finalUrl, pageUrl, [
            "download-hub-follow",
            "hub-binary-redirect",
            `hub:${hub}`,
          ]);
          direct.score += 12;
          extras.push(direct);
          log(
            `download hub follow: ${hub} → binary artifact ${finalUrl} (score ${direct.score})`,
          );
          continue;
        }
      }
      if (!body) continue;
      const fromHub = extractCandidatesFromHtml(body, finalUrl).map((c) => {
        const next = { ...c };
        next.score += 8;
        next.evidence = [...c.evidence, "download-hub-follow", `hub:${hub}`];
        return next;
      });
      extras.push(...fromHub);
      // SPA download hubs often bury real .dmg URLs inside JS bundles only
      try {
        const fromBundles = await discoverFromScriptBundles(finalUrl, body);
        for (const c of fromBundles) {
          const next = { ...c };
          next.score += 8;
          next.evidence = [...c.evidence, "download-hub-follow", "hub-script-bundle", `hub:${hub}`];
          extras.push(next);
        }
        log(
          `download hub follow: ${hub} → ${fromHub.length} html + ${fromBundles.length} bundle candidate(s)`,
        );
      } catch {
        log(`download hub follow: ${hub} → ${fromHub.length} candidate(s)`);
      }
    } catch (err: any) {
      log(`download hub follow failed ${hub}: ${err?.message || err}`);
    }
  }
  if (!extras.length) return candidates;
  return mergeCandidates(candidates, extras);
}

/**
 * HEAD-probe extensionless download API URLs so Content-Type / Content-Disposition
 * can reclassify them as cask-dmg / archive (e.g. HaloMac-latest.dmg via
 * api.heyhalo.app/download/latest).
 */
export async function enrichExtensionlessArtifactUrls(
  candidates: DiscoverCandidate[],
  pageUrl: string,
  opts: {
    log?: (msg: string) => void;
    maxProbes?: number;
    classifyHead?: (url: string) => Promise<{ type: string; url: string }>;
  } = {},
): Promise<DiscoverCandidate[]> {
  const log = opts.log || (() => {});
  const maxProbes = opts.maxProbes ?? 10;
  const hasDmg = candidates.some(
    (c) => c.kind === "cask-dmg" || /\.dmg(?:\?|#|$)/i.test(c.url),
  );
  if (hasDmg) return candidates;

  let classifyHead = opts.classifyHead;
  if (!classifyHead) {
    try {
      const mod = await import("./classifier.ts");
      classifyHead = mod.classifyWithHead;
    } catch {
      return candidates;
    }
  }

  const probes: DiscoverCandidate[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (c.kind === "cask-dmg" || c.kind === "bash-script" || c.kind === "archive") continue;
    if (!looksLikeExtensionlessArtifactUrl(c.url) && c.kind !== "unknown") continue;
    if (!looksLikeExtensionlessArtifactUrl(c.url)) continue;
    const key = c.url.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    probes.push(c);
    if (probes.length >= maxProbes) break;
  }

  // Also invent well-known same-origin API download endpoints from page origin
  // when marketing HTML never links them as high-score candidates.
  try {
    const origin = new URL(pageUrl).origin;
    const host = new URL(pageUrl).hostname.replace(/^www\./i, "");
    // Unpeel/AimeFlux-class SPAs: stable extensionless DMG at /download/mac
    // (Content-Disposition: Unpeel-latest.dmg) without a homepage .dmg href.
    const guesses = [
      `https://api.${host}/download/latest`,
      `${origin}/download/latest`,
      `${origin}/downloads/latest`,
      `${origin}/download/mac`,
      `${origin}/download/macos`,
      `${origin}/download/osx`,
      `${origin}/download/darwin`,
      `${origin}/downloads/mac`,
      `${origin}/downloads/macos`,
    ];
    for (const g of guesses) {
      if (seen.has(g)) continue;
      if (!looksLikeExtensionlessArtifactUrl(g)) continue;
      seen.add(g);
      probes.push(
        scoreCandidateUrl(g, pageUrl, ["extensionless-guess"]),
      );
      if (probes.length >= maxProbes) break;
    }
  } catch {
    /* ignore */
  }

  if (!probes.length) return candidates;

  const extras: DiscoverCandidate[] = [];
  for (const p of probes) {
    try {
      const head = await classifyHead!(p.url);
      if (head.type === "unknown") continue;
      const scored = scoreCandidateUrl(p.url, pageUrl, [
        ...(p.evidence || []),
        "extensionless-head-probe",
        `head:${head.type}`,
      ]);
      // Force kind from HEAD when path had no extension
      scored.kind = head.type;
      if (head.type === "cask-dmg") {
        scored.score = Math.max(scored.score, 120);
        scored.evidence.push("head-cask-dmg");
      } else if (head.type === "archive") {
        scored.score = Math.max(scored.score, 95);
      } else if (head.type === "bash-script") {
        scored.score = Math.max(scored.score, 100);
      }
      extras.push(scored);
      log(`extensionless HEAD ${p.url} → ${head.type} (score ${scored.score})`);
    } catch (err: any) {
      log(`extensionless HEAD failed ${p.url}: ${err?.message || err}`);
    }
  }
  if (!extras.length) return candidates;
  return mergeCandidates(candidates, extras);
}

/**
 * Discover installable download candidates from a generic webpage URL.
 */

const JSON_ARTIFACT_RE =
  /\.(dmg|pkg|zip|tar\.gz|tgz|tar\.bz2|tar\.xz|exe|msi|appimage)(?:\?|#|$)/i;

/** Walk arbitrary JSON and collect installable artifact URLs. */
export function extractArtifactUrlsFromJson(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) && JSON_ARTIFACT_RE.test(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) extractArtifactUrlsFromJson(v, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      extractArtifactUrlsFromJson(v, out);
    }
  }
  return out;
}

function preferArchUrls(urls: string[]): string[] {
  const arch = typeof process !== "undefined" && process.arch === "arm64" ? "arm" : "x64";
  const scored = urls.map((u) => {
    let s = 0;
    if (/\.dmg(?:\?|#|$)/i.test(u)) s += 50;
    if (/darwin|mac/i.test(u)) s += 30;
    if (arch === "arm" && /arm64|aarch64|apple/i.test(u)) s += 20;
    if (arch === "x64" && /x64|amd64|intel/i.test(u)) s += 20;
    if (/windows|\.exe|linux|\.deb|\.rpm/i.test(u) && !/darwin|mac/i.test(u)) s -= 40;
    // Prefer non-CN CDN when multiple regions exist
    if (/\.com\.cn\//i.test(u)) s -= 5;
    if (/trae\.ai|traecdn\.us/i.test(u)) s += 5;
    return { u, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.u);
}

/**
 * When a page is a JS app shell, fetch a few script bundles and any embedded
 * version/download API endpoints, then extract artifact URLs from JSON.
 */
export async function discoverFromScriptBundles(
  pageUrl: string,
  html: string,
  opts: { maxScripts?: number; maxScriptBytes?: number } = {},
): Promise<DiscoverCandidate[]> {
  const maxScripts = opts.maxScripts ?? 8;
  const maxScriptBytes = opts.maxScriptBytes ?? 2_000_000;
  const scriptSrcs: string[] = [];
  const srcRe = /(?:src|href)\s*=\s*["']([^"']+\.js[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(html)) !== null) {
    let s = m[1];
    if (s.startsWith("//")) s = "https:" + s;
    try {
      s = new URL(s, pageUrl).href;
      assertSafePublicFetchUrl(s);
      scriptSrcs.push(s);
    } catch {
      /* skip */
    }
  }

  const apiUrls = new Set<string>();
  const artifactUrls = new Set<string>();
  const candidates: DiscoverCandidate[] = [];

  // Prefer download/app/main bundles first (path segment "download" > generic "chunk")
  const ordered = [...scriptSrcs].sort((a, b) => {
    const score = (u: string) =>
      (/download/i.test(u) ? 30 : 0) +
      (/main|app|index/i.test(u) ? 12 : 0) +
      (/chunk/i.test(u) ? 4 : 0) +
      (/static\/js/i.test(u) ? 2 : 0);
    return score(b) - score(a);
  });

  const scriptLimit = Math.max(maxScripts, 16);
  for (const src of ordered.slice(0, scriptLimit)) {
    try {
      const fetched = await fetchTextLimited(src, {
        maxBytes: maxScriptBytes,
        timeoutMs: 20_000,
      });
      const body = fetched.body;
      // direct absolute artifact URLs in JS
      // Note: use \s (whitespace), not \\s — in a character class \\s is
      // backslash + letter "s", which breaks URLs containing "s" (e.g. release).
      const bare =
        body.match(/https?:\/\/[^"'\s)]+\.(?:dmg|pkg|zip|tgz|tar\.gz)[^"'\s)]*/gi) || [];
      for (const u of bare) {
        try {
          const cleaned = u.replace(/[),.;]+$/g, "");
          if (isImplausibleArtifactUrl(cleaned)) continue;
          assertSafePublicFetchUrl(cleaned);
          artifactUrls.add(cleaned);
        } catch {}
      }
      // relative paths common in SPAs (e.g. href:"/download/Unfatten16.dmg")
      const relArtifacts =
        body.match(
          /["'`](\/?[^"'`\s)]+\.(?:dmg|pkg|zip|tgz|tar\.gz)(?:\?[^"'`\s)]*)?)["'`]/gi,
        ) || [];
      for (const raw of relArtifacts) {
        const path = raw.replace(/^['"`]|['"`]$/g, "").trim();
        if (!path || /^https?:\/\//i.test(path)) continue;
        if (/^(data:|blob:|javascript:)/i.test(path)) continue;
        try {
          const abs = new URL(path, pageUrl).href;
          assertSafePublicFetchUrl(abs);
          artifactUrls.add(abs);
        } catch {}
      }
      // Extensionless platform download endpoints embedded in SPA bundles
      // (e.g. var ds=`/download/mac` → Unpeel-latest.dmg via Content-Type).
      const relExtless =
        body.match(
          /["'`](\/(?:download|downloads)\/(?:mac(?:os)?|osx|darwin|apple[-_]?silicon)(?:\/[^"'`\s)]*)?)["'`]/gi,
        ) || [];
      for (const raw of relExtless) {
        const path = raw.replace(/^['"`]|['"`]$/g, "").trim();
        if (!path) continue;
        try {
          const abs = new URL(path, pageUrl).href;
          if (!looksLikeExtensionlessArtifactUrl(abs)) continue;
          assertSafePublicFetchUrl(abs);
          candidates.push(
            scoreCandidateUrl(abs, pageUrl, ["script-bundle", "extensionless-rel-path"]),
          );
        } catch {}
      }
      // API endpoints that look like version/download manifests
      const apis =
        body.match(
          /https?:\/\/[^"'\s)]+(?:icube[^"'\s)]*)?(?:\/api\/|\/icube\/api\/)[^"'\s)]*(?:version|download|latest|release)[^"'\s)]*/gi,
        ) || [];
      // relative api paths
      const rel =
        body.match(/["'](\/?(?:icube\/)?api\/v\d+\/[^"']*(?:version|download|latest)[^"']*)["']/gi) ||
        [];
      for (const raw of apis) {
        try {
          const u = raw.replace(/[),.;]+$/g, "");
          assertSafePublicFetchUrl(u);
          apiUrls.add(u);
        } catch {}
      }
      for (const raw of rel) {
        const path = raw.replace(/^['"]|['"]$/g, "");
        // Try common host bases seen on modern product sites
        const bases = [
          new URL(pageUrl).origin,
          "https://icube-normal.traeapi.us",
          "https://icube-normal.trae.ai",
        ];
        // Also derive from nearby absolute hosts in the same bundle
        const hostHits =
          body.match(/https?:\/\/icube[^"'\s/]+/gi) ||
          body.match(/https?:\/\/[a-z0-9.-]+traeapi\.[a-z.]+/gi) ||
          [];
        for (const h of hostHits.slice(0, 5)) bases.push(h.replace(/\/$/, ""));
        for (const b of bases) {
          try {
            const u = new URL(path.startsWith("/") ? path : `/${path}`, b).href;
            if (!/version|download|latest|release/i.test(u)) continue;
            assertSafePublicFetchUrl(u);
            apiUrls.add(u);
          } catch {}
        }
      }
    } catch {
      /* skip script */
    }
  }

  // Fetch API JSON payloads
  for (const api of [...apiUrls].slice(0, 10)) {
    try {
      const fetched = await fetchTextLimited(api, { maxBytes: 1_500_000, timeoutMs: 15_000 });
      const ct = fetched.contentType || "";
      let json: unknown = null;
      if (ct.includes("json") || fetched.body.trim().startsWith("{") || fetched.body.trim().startsWith("[")) {
        try {
          json = JSON.parse(fetched.body);
        } catch {
          json = null;
        }
      }
      if (json) {
        for (const u of extractArtifactUrlsFromJson(json)) {
          try {
            assertSafePublicFetchUrl(u);
            artifactUrls.add(u);
          } catch {}
        }
      }
      // also bare artifacts in body
      const bare =
        fetched.body.match(/https?:\/\/[^"'\s)]+\.(?:dmg|pkg|zip)[^"'\s)]*/gi) || [];
      for (const u of bare) {
        try {
          assertSafePublicFetchUrl(u.replace(/[),.;]+$/g, ""));
          artifactUrls.add(u.replace(/[),.;]+$/g, ""));
        } catch {}
      }
    } catch {
      /* skip api */
    }
  }

  const preferred = preferArchUrls(
    [...artifactUrls].filter((u) => !isImplausibleArtifactUrl(u)),
  );
  for (const u of preferred) {
    if (isImplausibleArtifactUrl(u)) continue;
    const scored = scoreCandidateUrl(u, pageUrl, ["script-bundle-or-api"]);
    scored.score += 35;
    scored.evidence.push("api-or-bundle-discovery");
    candidates.push(scored);
  }
  return candidates.sort((a, b) => b.score - a.score);
}


export async function discoverPageDownloads(
  pageUrl: string,
  opts: DiscoverOptions = {},
): Promise<DiscoverResult> {
  const mode = opts.mode ?? "auto";
  const log = opts.log || (() => {});

  if (mode === "off") {
    return {
      pageUrl,
      finalPageUrl: pageUrl,
      method: "none",
      candidates: [],
      chosen: null,
      reason: "discovery disabled",
    };
  }

  assertSafePublicFetchUrl(pageUrl);

  let finalPageUrl = pageUrl;
  let body = "";
  let contentType = "";

  if (opts.htmlFixture) {
    body = opts.htmlFixture.body;
    finalPageUrl = opts.htmlFixture.finalUrl || pageUrl;
    contentType = opts.htmlFixture.contentType || "text/html";
  } else {
    try {
      const fetched = await fetchTextLimited(pageUrl);
      body = fetched.body;
      finalPageUrl = fetched.url;
      contentType = fetched.contentType;
    } catch (err: any) {
      const fetchReason = `fetch failed: ${err?.message || err}`;
      log(fetchReason);
      // Auth-walled / dead marketing domains: fall back to Mac App Store search
      // by product name (hostname label or --name), e.g. pieoneer.app → MAS id.
      try {
        const mas = await discoverMasFallbackCandidates(pageUrl, opts);
        if (mas.length) {
          const chosen = pickAutoCandidate(mas);
          log(
            `MAS fallback after page fetch failure: ${mas.length} candidate(s)`,
          );
          return {
            pageUrl,
            finalPageUrl: pageUrl,
            method: "static",
            candidates: mas.slice(0, 25),
            chosen,
            reason: chosen
              ? `${fetchReason}; recovered via mas-itunes-search-fallback`
              : fetchReason,
          };
        }
      } catch (masErr: any) {
        log(`MAS fallback failed: ${masErr?.message || masErr}`);
      }
      return {
        pageUrl,
        finalPageUrl: pageUrl,
        method: "none",
        candidates: [],
        chosen: null,
        reason: fetchReason,
      };
    }
  }

  const isHtml =
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml") ||
    /<html[\s>]/i.test(body) ||
    /<a\s+[^>]*href=/i.test(body);

  let staticCandidates: DiscoverCandidate[] = [];
  if (isHtml || body.length > 0) {
    staticCandidates = extractCandidatesFromHtml(body, finalPageUrl);
  }

  let method: DiscoverResult["method"] = "static";
  let candidates = staticCandidates;

  // Tier A.5: JS bundle / version-API probe for button-driven download pages.
  // Also run when the only strong static hits are store links (MAS/Setapp) —
  // marketing sites often link the App Store while shipping the real Mac DMG
  // from a CDN only referenced inside JS (e.g. qoder.com).
  const topStatic = pickAutoCandidate(staticCandidates);
  const hasRealArtifact = staticCandidates.some(
    (c) =>
      c.kind === "cask-dmg" ||
      c.kind === "archive" ||
      c.kind === "bash-script" ||
      /\.(dmg|pkg|zip|tgz|tar\.gz|sh)(?:\?|#|$)/i.test(c.url),
  );
  const onlyStoreOrWeak =
    !hasRealArtifact &&
    (!topStatic ||
      topStatic.kind === "mac-app-store" ||
      topStatic.kind === "setapp-app" ||
      topStatic.kind === "unknown" ||
      topStatic.kind === "github-repo");
  if (
    !topStatic ||
    looksLikeEmptyShell(body) ||
    staticCandidates.every((c) => c.kind === "unknown") ||
    onlyStoreOrWeak
  ) {
    try {
      const apiCands = await discoverFromScriptBundles(finalPageUrl, body);
      if (apiCands.length) {
        candidates = mergeCandidates(staticCandidates, apiCands);
        method = "static";
      }
    } catch {
      /* ignore api discovery errors */
    }
  }

  // Tier A.6: expand GitHub repo links to latest release DMG/PKG/ZIP assets
  try {
    candidates = await enrichGithubReleaseAssets(candidates, finalPageUrl, { log });
  } catch {
    /* ignore release enrichment errors */
  }

  // Tier A.6b: Sparkle appcast feeds (macOS product sites with empty GH release assets)
  try {
    candidates = await enrichSparkleAppcast(candidates, finalPageUrl, body, { log });
  } catch {
    /* ignore appcast enrichment errors */
  }

  // Tier A.7: follow same-site /download hubs when homepage only has nav links
  try {
    candidates = await enrichDownloadHubPages(candidates, finalPageUrl, body, {
      log,
      htmlFixture: opts.htmlFixture,
      fetchHtml: opts.fetchHubHtml,
    });
    candidates = candidates.filter((c) => !isImplausibleArtifactUrl(c.url));
  } catch {
    /* ignore hub follow errors */
  }

  // Tier A.7b: JS download(type, code) → same-origin JSON /download API (iA Writer)
  if (!opts.htmlFixture) {
    try {
      candidates = await enrichJsDownloadApiArtifacts(
        candidates,
        finalPageUrl,
        body,
        { log },
      );
    } catch {
      /* ignore js-download-api errors */
    }
  }

  // Tier A.8: HEAD-probe extensionless download APIs (Content-Type → cask-dmg)
  // Skip when offline fixture without network unless injectors provided later.
  if (!opts.htmlFixture) {
    try {
      candidates = await enrichExtensionlessArtifactUrls(candidates, finalPageUrl, { log });
    } catch {
      /* ignore head probe errors */
    }
  }

  // Tier A.8b: drop same-site script-bundle phantom .dmg/.zip that 404 (SPA string noise)
  if (!opts.htmlFixture) {
    try {
      candidates = await filterUnreachableScriptArtifacts(candidates, finalPageUrl, { log });
    } catch {
      /* ignore */
    }
  }

  const top = pickAutoCandidate(candidates);
  const hasStrong = Boolean(top && top.score >= 70 && top.kind !== "unknown");
  const needWebview =
    mode === "webview" ||
    (mode === "auto" &&
      !hasStrong &&
      (looksLikeEmptyShell(body) ||
        !candidates.some((c) => c.kind !== "unknown" && c.score >= 70)));

  if (needWebview) {
    const webviewFn =
      opts.webviewDiscover ||
      (await loadWebviewDiscover(opts.verbose ? log : undefined));
    if (webviewFn) {
      log("Rendering page in WebView for download discovery…");
      try {
        const wv = await webviewFn(finalPageUrl);
        const tagged = wv.map((c) => ({ ...c, source: "webview" as const }));
        candidates = mergeCandidates(candidates, tagged);
        method = "webview";
      } catch (err: any) {
        log(`WebView discovery failed: ${err?.message || err}`);
        if (staticCandidates.length === 0) {
          return {
            pageUrl,
            finalPageUrl,
            method: "none",
            candidates: [],
            chosen: null,
            reason: `webview failed: ${err?.message || err}`,
          };
        }
      }
    } else if (mode === "webview") {
      return {
        pageUrl,
        finalPageUrl,
        method: "none",
        candidates: staticCandidates,
        chosen: pickAutoCandidate(staticCandidates),
        reason: "Bun.WebView unavailable",
      };
    }
  }

  // Tier A.9: stable /client/latest/*.pkg|dmg when store links dominate (Zoom, etc.)
  if (!opts.htmlFixture) {
    try {
      candidates = await enrichClientLatestArtifacts(candidates, finalPageUrl, { log });
    } catch {
      /* ignore */
    }
  }
  candidates = preferNativeInstallersOverStore(candidates);

  // Re-filter after client-latest guesses (those already HEAD-probed internally)
  if (!opts.htmlFixture) {
    try {
      candidates = await filterUnreachableScriptArtifacts(candidates, finalPageUrl, { log });
    } catch {
      /* ignore */
    }
  }

  // Tier A.10: Mac App Store iTunes search by product name when the page
  // yields nothing installable (SPA shell, soft-404, empty download section).
  {
    const topNow = pickAutoCandidate(candidates);
    const needMas =
      !topNow ||
      topNow.kind === "unknown" ||
      (topNow.score < 70 &&
        !candidates.some(
          (c) =>
            c.kind === "cask-dmg" ||
            c.kind === "archive" ||
            c.kind === "bash-script" ||
            c.kind === "mac-app-store" ||
            c.kind === "setapp-app" ||
            c.kind === "github-repo",
        ));
    if (needMas) {
      try {
        const mas = await discoverMasFallbackCandidates(pageUrl, opts);
        if (mas.length) {
          candidates = mergeCandidates(candidates, mas);
          log(`MAS iTunes fallback added ${mas.length} candidate(s)`);
        }
      } catch (err: any) {
        log(`MAS iTunes fallback failed: ${err?.message || err}`);
      }
    }
  }

  const chosen = pickAutoCandidate(candidates);
  return {
    pageUrl,
    finalPageUrl,
    method: candidates.length ? method : "none",
    candidates: candidates.slice(0, 25),
    chosen,
    reason: chosen
      ? undefined
      : candidates.length
        ? "ambiguous or low-confidence candidates"
        : "no candidates",
  };
}


/**
 * When a marketing site only surfaces App Store / Setapp links, many vendors
 * still ship a stable same-origin installer at /client/latest/<Name>.pkg|dmg
 * (Zoom: https://zoom.us/client/latest/Zoom.pkg). HEAD-probe a small set of
 * guesses so native installers beat MAS for Homebrew cask generation.
 *
 * Origins are limited to the page host + an allowlisted dual-TLD map (Zoom).
 * Do not invent brand.com / brand.us for arbitrary short labels — e.g. ia.net
 * must not probe ia.com (unrelated host that may return HTML 200s).
 */
export function inventClientLatestArtifactUrls(pageUrl: string): string[] {
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.replace(/^www\./i, "");
    const brand = (host.split(".")[0] || "app").toLowerCase();
    if (!brand || brand.length < 2) return [];
    const Brand = brand.charAt(0).toUpperCase() + brand.slice(1);
    const names = [
      `${Brand}.pkg`,
      `${Brand}.dmg`,
      `${brand}.pkg`,
      `${brand}.dmg`,
      `${brand}InstallerFull.pkg`,
      `${Brand}InstallerFull.pkg`,
      // Zoom historic naming (zoomusInstallerFull.pkg)
      `${brand}usInstallerFull.pkg`,
      `${Brand}usInstallerFull.pkg`,
    ];
    // Marketing sites often redirect to a sibling TLD while stable installers
    // stay on the legacy apex (zoom.com → downloads still on zoom.us).
    const origins = new Set<string>([u.origin, `https://${host}`, `https://www.${host}`]);
    const dualTld: Record<string, string[]> = {
      zoom: ["https://zoom.us", "https://www.zoom.us", "https://zoom.com", "https://www.zoom.com"],
    };
    for (const o of dualTld[brand] || []) origins.add(o);
    const out: string[] = [];
    for (const origin of origins) {
      for (const n of names) out.push(`${origin}/client/latest/${n}`);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * True when HEAD/GET metadata looks like a real installer, not an HTML landing page.
 * URL extension alone is insufficient — many hosts return 200 HTML for missing paths.
 */
export function isBinaryInstallerHead(
  contentType: string | null | undefined,
  contentLength: string | null | undefined,
  finalUrl: string,
): boolean {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("html") || ct.includes("text/plain") || ct.includes("text/css") || ct.includes("javascript")) {
    return false;
  }
  const cl = contentLength != null && contentLength !== "" ? Number(contentLength) : NaN;
  if (Number.isFinite(cl) && cl > 0 && cl < 50_000 && !ct) {
    // Tiny bodies without a binary content-type are almost always HTML shells
    return false;
  }
  if (ct.includes("octet") || ct.includes("package") || ct.includes("disk") || ct.includes("x-apple") || ct.includes("zip") || ct.includes("x-tar") || ct.includes("gzip")) {
    return true;
  }
  if (Number.isFinite(cl) && cl > 1_000_000) return true;
  // Extension helps only when content-type is empty/unknown and body is not tiny
  if (/\.(dmg|pkg|zip)(?:\?|#|$)/i.test(finalUrl)) {
    if (Number.isFinite(cl) && cl > 100_000) return true;
    if (!ct) return true; // allow injectors / servers that omit CT on real binaries
    return false;
  }
  return !ct && Number.isFinite(cl) && cl > 1_000_000;
}

/**
 * Extract trial/product download() JS calls from marketing HTML (iA Writer class).
 * onclick="download(this, &quot;writer&quot;, &quot;writer-landing&quot;)" → type+code pairs
 * that POST to same-origin /download?type=&code=&start=1 and return {file: "…zip"}.
 */
export function extractJsDownloadApiCalls(
  html: string,
): Array<{ type: string; code: string }> {
  const out: Array<{ type: string; code: string }> = [];
  const seen = new Set<string>();
  // Decode common HTML entities used in onclick attributes (iA.net)
  const decoded = html
    .replace(/&#x28;/gi, "(")
    .replace(/&#x29;/gi, ")")
    .replace(/&#x20;/gi, " ")
    .replace(/&#x22;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/&#32;/g, " ");
  // Matches download(this, "writer", "writer-landing") after entity decode
  const re =
    /\bdownload\s*\(\s*(?:this|[^,)]+)\s*,\s*["']([a-z0-9][\w.-]*)["']\s*,\s*["']([a-z0-9][\w.-]*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(decoded)) !== null) {
    const type = m[1];
    const code = m[2];
    // Skip windows / android / store-only product keys for Mac cask discovery
    if (/windows|android|ios|linux/i.test(type)) continue;
    const key = `${type}\0${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, code });
  }
  return out;
}

/**
 * Probe same-origin JSON download APIs discovered from download(type, code) JS calls.
 */
export async function enrichJsDownloadApiArtifacts(
  candidates: DiscoverCandidate[],
  pageUrl: string,
  html: string,
  opts: {
    log?: (msg: string) => void;
    fetchJson?: (url: string, init?: RequestInit) => Promise<any>;
  } = {},
): Promise<DiscoverCandidate[]> {
  const log = opts.log || (() => {});
  const hasNative = candidates.some(
    (c) =>
      c.kind === "cask-dmg" ||
      c.kind === "archive" ||
      /\.(dmg|pkg|zip)(?:\?|#|$)/i.test(c.url),
  );
  if (hasNative) return candidates;

  const calls = extractJsDownloadApiCalls(html);
  // Path-derived fallback: /writer → type writer + common trial codes
  try {
    const pathSeg = new URL(pageUrl).pathname.split("/").filter(Boolean)[0];
    if (pathSeg && /^[a-z][\w-]{1,32}$/i.test(pathSeg)) {
      for (const code of [`${pathSeg}-landing`, `${pathSeg}-download`, pathSeg]) {
        if (!calls.some((c) => c.type === pathSeg && c.code === code)) {
          calls.push({ type: pathSeg, code });
        }
      }
    }
  } catch {
    /* ignore */
  }
  if (!calls.length) return candidates;

  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return candidates;
  }

  const fetchJson =
    opts.fetchJson ||
    (async (url: string, init?: RequestInit) => {
      assertSafePublicFetchUrl(url);
      const res = await fetch(url, {
        ...init,
        redirect: "follow",
        headers: {
          Accept: "application/json",
          "User-Agent": "allbrew/1.0",
          ...(init?.headers || {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return null;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("html")) return null;
      return res.json();
    });

  const extras: DiscoverCandidate[] = [];
  const seenFile = new Set<string>();
  for (const { type, code } of calls.slice(0, 8)) {
    const apiUrl = `${origin}/download?type=${encodeURIComponent(type)}&code=${encodeURIComponent(code)}&start=1`;
    try {
      const body = await fetchJson(apiUrl, { method: "POST" });
      const file =
        body && body.success === true && typeof body.file === "string"
          ? body.file
          : body && typeof body.url === "string"
            ? body.url
            : body && typeof body.download_url === "string"
              ? body.download_url
              : null;
      if (!file || !/^https?:\/\//i.test(file)) {
        log(`js-download-api miss: ${apiUrl}`);
        continue;
      }
      if (seenFile.has(file)) continue;
      seenFile.add(file);
      const scored = scoreCandidateUrl(file, pageUrl, [
        "js-download-api",
        `type:${type}`,
        `code:${code}`,
      ]);
      if (/\.(dmg|pkg)(?:\?|#|$)/i.test(file)) {
        scored.kind = "cask-dmg";
        scored.score = Math.max(scored.score, 140);
      } else if (/\.zip(?:\?|#|$)/i.test(file)) {
        scored.kind = "archive";
        scored.score = Math.max(scored.score, 135);
      } else {
        scored.score = Math.max(scored.score, 120);
      }
      scored.evidence.push("js-download-api-file");
      extras.push(scored);
      log(`js-download-api hit: ${apiUrl} → ${file} (score ${scored.score})`);
    } catch (err: any) {
      log(`js-download-api failed ${apiUrl}: ${err?.message || err}`);
    }
  }
  if (!extras.length) return candidates;
  return mergeCandidates(candidates, extras);
}

export async function enrichClientLatestArtifacts(
  candidates: DiscoverCandidate[],
  pageUrl: string,
  opts: {
    log?: (msg: string) => void;
    maxProbes?: number;
    headOk?: (url: string) => Promise<boolean>;
  } = {},
): Promise<DiscoverCandidate[]> {
  const log = opts.log || (() => {});
  const maxProbes = opts.maxProbes ?? 24;
  const hasNative = candidates.some(
    (c) =>
      c.kind === "cask-dmg" ||
      /\.(dmg|pkg)(?:\?|#|$)/i.test(c.url),
  );
  if (hasNative) return candidates;

  const onlyStoreOrWeak = !candidates.some(
    (c) =>
      c.kind === "cask-dmg" ||
      c.kind === "archive" ||
      c.kind === "bash-script" ||
      /\.(dmg|pkg|zip)(?:\?|#|$)/i.test(c.url),
  );
  // Always allow probe when no native installer; skip if strong non-store already
  if (!onlyStoreOrWeak && candidates.some((c) => c.score >= 90 && c.kind !== "mac-app-store" && c.kind !== "setapp-app" && c.kind !== "unknown")) {
    return candidates;
  }

  // Prefer *Zoom.pkg / *InstallerFull.pkg on zoom.us before exhaustive TLD fan-out
  const allGuesses = inventClientLatestArtifactUrls(pageUrl);
  const rank = (u: string) => {
    let r = 0;
    if (/zoom\.us\/client\/latest\/Zoom\.pkg$/i.test(u)) r += 100;
    if (/zoom\.us\/client\/latest\/zoomusInstallerFull\.pkg$/i.test(u)) r += 90;
    if (/\/client\/latest\/[A-Z][a-zA-Z]+\.pkg$/i.test(u)) r += 40;
    if (/InstallerFull\.pkg$/i.test(u)) r += 20;
    if (/zoom\.us/i.test(u)) r += 15;
    return r;
  };
  const guesses = allGuesses
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, maxProbes);
  if (!guesses.length) return candidates;

  const headOk =
    opts.headOk ||
    (async (url: string) => {
      try {
        assertSafePublicFetchUrl(url);
        const res = await fetch(url, {
          method: "HEAD",
          redirect: "follow",
          headers: { "User-Agent": "allbrew/1.0" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return false;
        const finalUrl = res.url || url;
        return isBinaryInstallerHead(
          res.headers.get("content-type"),
          res.headers.get("content-length"),
          finalUrl,
        );
      } catch {
        return false;
      }
    });

  const extras: DiscoverCandidate[] = [];
  for (const g of guesses) {
    try {
      const ok = await headOk(g);
      if (!ok) {
        log(`client/latest probe miss: ${g}`);
        continue;
      }
      const scored = scoreCandidateUrl(g, pageUrl, ["client-latest-guess", "head-ok"]);
      // Ensure native installers outrank MAS (base 90)
      scored.score = Math.max(scored.score, 125);
      scored.kind = "cask-dmg";
      scored.evidence.push("client-latest-native");
      extras.push(scored);
      log(`client/latest probe hit: ${g} (score ${scored.score})`);
    } catch (err: any) {
      log(`client/latest probe failed ${g}: ${err?.message || err}`);
    }
  }
  if (!extras.length) return candidates;
  return mergeCandidates(candidates, extras);
}

/** Prefer direct .dmg/.pkg over App Store / Setapp when both exist. */
export function preferNativeInstallersOverStore(
  candidates: DiscoverCandidate[],
): DiscoverCandidate[] {
  const hasNative = candidates.some(
    (c) =>
      c.kind === "cask-dmg" ||
      /\.(dmg|pkg)(?:\?|#|$)/i.test(c.url),
  );
  if (!hasNative) return candidates;
  return candidates
    .map((c) => {
      if (c.kind === "mac-app-store" || c.kind === "setapp-app") {
        return {
          ...c,
          score: c.score - 40,
          evidence: [...(c.evidence || []), "store-vs-native-penalty"],
        };
      }
      return c;
    })
    .sort((a, b) => b.score - a.score);
}

async function loadWebviewDiscover(
  log?: (msg: string) => void,
): Promise<((pageUrl: string) => Promise<DiscoverCandidate[]>) | null> {
  try {
    const mod = await import("./page-discover-webview.ts");
    if (!mod.isWebViewAvailable()) {
      log?.("Bun.WebView not available; skipping rendered discovery");
      return null;
    }
    return (pageUrl: string) => mod.discoverWithWebView(pageUrl) as Promise<DiscoverCandidate[]>;
  } catch (err: any) {
    log?.(`WebView module unavailable: ${err?.message || err}`);
    return null;
  }
}
