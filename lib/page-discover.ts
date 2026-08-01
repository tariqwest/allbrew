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
    // Only reward download-ish paths when they look like files/CDNs, not HTML pages
    if (/\.(dmg|pkg|zip|tgz|tar\.gz|sh|bash)(?:\?|#|$)/i.test(url) || /cdn|releases\/download|artifacts?/i.test(url)) {
      score += 10;
      ev.push("download-path");
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
  /** Injected for tests: skip network and parse this HTML as the page body. */
  htmlFixture?: { body: string; finalUrl?: string; contentType?: string };
  /** Injected for tests / callers: webview discover implementation. */
  webviewDiscover?: (pageUrl: string) => Promise<DiscoverCandidate[]>;
};

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

  // Prefer main/app bundles first
  const ordered = [...scriptSrcs].sort((a, b) => {
    const score = (u: string) =>
      (/main|app|index|download|chunk/i.test(u) ? 10 : 0) + (/static\/js/i.test(u) ? 2 : 0);
    return score(b) - score(a);
  });

  for (const src of ordered.slice(0, maxScripts)) {
    try {
      const fetched = await fetchTextLimited(src, {
        maxBytes: maxScriptBytes,
        timeoutMs: 20_000,
      });
      const body = fetched.body;
      // direct artifact URLs in JS
      const bare = body.match(/https?:\/\/[^"'\\s)]+\.(?:dmg|pkg|zip|tgz|tar\.gz)[^"'\\s)]*/gi) || [];
      for (const u of bare) {
        try {
          assertSafePublicFetchUrl(u);
          artifactUrls.add(u.replace(/[),.;]+$/g, ""));
        } catch {}
      }
      // API endpoints that look like version/download manifests
      const apis =
        body.match(
          /https?:\/\/[^"'\\s)]+(?:icube[^"'\\s)]*)?(?:\/api\/|\/icube\/api\/)[^"'\\s)]*(?:version|download|latest|release)[^"'\\s)]*/gi,
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
          body.match(/https?:\/\/icube[^"'\\s/]+/gi) ||
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
      const bare = fetched.body.match(/https?:\/\/[^"'\\s)]+\.(?:dmg|pkg|zip)[^"'\\s)]*/gi) || [];
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

  const preferred = preferArchUrls([...artifactUrls]);
  for (const u of preferred) {
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

  // Tier A.5: JS bundle / version-API probe for button-driven download pages
  const topStatic = pickAutoCandidate(staticCandidates);
  if (!topStatic || looksLikeEmptyShell(body) || staticCandidates.every((c) => c.kind === "unknown")) {
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
    return (pageUrl: string) => mod.discoverWithWebView(pageUrl) as Promise<DiscoverCandidate[]>;
  } catch (err: any) {
    log?.(`WebView module unavailable: ${err?.message || err}`);
    return null;
  }
}
