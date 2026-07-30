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
  const kind = classified.type === "unknown" ? guessKindFromUrl(url) : classified.type;

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
    score += 10;
    ev.push("download-path");
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

  return {
    url,
    kind,
    score,
    evidence: ev,
    source: "static",
  };
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
      )
    ) {
      add(cleaned, "bare-url");
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
  if (candidates.length === 0) return null;
  const top = candidates[0];
  if (top.score < minScore) return null;
  if (candidates.length > 1 && top.score - candidates[1].score < minMargin) {
    // Allow auto if both are same URL kind and top is clearly installable
    if (!(top.score >= 90 && top.kind !== "unknown")) return null;
  }
  return top;
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
  /** Injected for tests: skip network and parse this HTML as the page body. */
  htmlFixture?: { body: string; finalUrl?: string; contentType?: string };
  /** Injected for tests / callers: webview discover implementation. */
  webviewDiscover?: (pageUrl: string) => Promise<DiscoverCandidate[]>;
};

/**
 * Discover installable download candidates from a generic webpage URL.
 */
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
      return {
        pageUrl,
        finalPageUrl: pageUrl,
        method: "none",
        candidates: [],
        chosen: null,
        reason: `fetch failed: ${err?.message || err}`,
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

  const top = pickAutoCandidate(staticCandidates);
  const needWebview =
    mode === "webview" ||
    (mode === "auto" &&
      (!top || looksLikeEmptyShell(body) || staticCandidates.length === 0));

  if (needWebview) {
    const webviewFn =
      opts.webviewDiscover ||
      (await loadWebviewDiscover(opts.verbose ? log : undefined));
    if (webviewFn) {
      log("Rendering page in WebView for download discovery…");
      try {
        const wv = await webviewFn(finalPageUrl);
        const tagged = wv.map((c) => ({ ...c, source: "webview" as const }));
        candidates = mergeCandidates(staticCandidates, tagged);
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

async function loadWebviewDiscover(
  log?: (msg: string) => void,
): Promise<((pageUrl: string) => Promise<DiscoverCandidate[]>) | null> {
  try {
    const mod = await import("./page-discover-webview.ts");
    if (!mod.isWebViewAvailable()) {
      log?.("Bun.WebView not available; skipping rendered discovery");
      return null;
    }
    return (pageUrl: string) => mod.discoverWithWebView(pageUrl);
  } catch (err: any) {
    log?.(`WebView module unavailable: ${err?.message || err}`);
    return null;
  }
}
