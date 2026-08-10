import {
  scoreCandidateUrl,
  type DiscoverCandidate,
} from "./page-discover.ts";
import { assertSafePublicFetchUrl } from "./utils.ts";
import { detectScriptInstall } from "./analyzer.ts";

declare const Bun: any;

const DEFAULT_TIMEOUT_MS = 35_000;
const MAX_CLICKS = 6;
const ARTIFACT_RE =
  /\.(dmg|pkg|zip|tar\.gz|tgz|tar\.bz2|tar\.xz|exe|msi|appimage)(?:\?|#|$)/i;

export function isWebViewAvailable(): boolean {
  return typeof Bun !== "undefined" && typeof Bun.WebView === "function";
}

const EXTRACTOR_JS = `(() => {
  const out = [];
  const push = (u, why) => {
    if (!u || typeof u !== "string") return;
    out.push({ url: u, why: why || "dom" });
  };
  for (const el of document.querySelectorAll("a[href], area[href], link[href]")) {
    push(el.href || el.getAttribute("href"), "href");
  }
  for (const el of document.querySelectorAll("[data-href], [data-url], [data-download-url], [data-download]")) {
    push(
      el.getAttribute("data-href") ||
        el.getAttribute("data-url") ||
        el.getAttribute("data-download-url") ||
        el.getAttribute("data-download"),
      "data-attr",
    );
  }
  for (const el of document.querySelectorAll("a, button, [role='button']")) {
    const text = (el.innerText || el.textContent || "").trim();
    if (/download|mac|dmg|pkg|install|apple silicon|intel/i.test(text)) {
      push(
        el.href ||
          el.getAttribute("href") ||
          el.getAttribute("data-url") ||
          el.getAttribute("data-href"),
        "cta-text:" + text.slice(0, 60),
      );
    }
  }
  for (const el of document.querySelectorAll("pre, code")) {
    const t = el.textContent || "";
    const m = t.match(/https?:\\/\\/[^\\s"'<>]+/g);
    if (m) for (const u of m) push(u, "code");
  }
  const ctas = [];
  const nodes = Array.from(document.querySelectorAll("a, button, [role='button'], input[type='button'], input[type='submit']"));
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const text = (el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ");
    if (!text || text.length > 80) continue;
    if (!/download|mac|dmg|pkg|install|apple|silicon|intel|windows|linux/i.test(text)) continue;
    let sel = null;
    if (el.id) sel = "#" + CSS.escape(el.id);
    else if (el.getAttribute("data-testid")) sel = "[data-testid=" + JSON.stringify(el.getAttribute("data-testid")) + "]";
    else if (el.tagName === "A" && el.getAttribute("href")) {
      const href = el.getAttribute("href");
      sel = "a[href=" + JSON.stringify(href) + "]";
    }
    ctas.push({ index: i, text, sel, tag: el.tagName.toLowerCase() });
  }
  return { links: out, ctas };
})()`;

const CLICK_BY_INDEX_JS = `(idx) => {
  const nodes = Array.from(document.querySelectorAll("a, button, [role='button'], input[type='button'], input[type='submit']"));
  const el = nodes[idx];
  if (!el) return { ok: false, reason: "missing" };
  el.scrollIntoView({ block: "center", inline: "center" });
  el.click();
  return { ok: true, text: (el.innerText || el.textContent || "").trim().slice(0, 80) };
}`;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function looksLikeArtifactUrl(url) {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return false;
  if (ARTIFACT_RE.test(url)) return true;
  if (/[?&](response-content-disposition|download|filename)=/i.test(url)) return true;
  if (/\/(download|releases?|artifacts?)\//i.test(url) && /trae|cdn|amazonaws|cloudfront|byte|lf/i.test(url)) {
    return true;
  }
  return false;
}

function contentTypeLooksBinary(ct) {
  const c = (ct || "").toLowerCase();
  if (!c) return false;
  if (c.includes("text/html") || c.includes("javascript") || c.includes("json") || c.includes("css")) {
    return false;
  }
  return (
    c.includes("octet-stream") ||
    c.includes("diskimage") ||
    c.includes("zip") ||
    c.includes("x-apple") ||
    c.includes("x-msdownload") ||
    c.includes("pkg") ||
    c.includes("binary")
  );
}

export async function discoverWithWebView(
  pageUrl: string,
  opts: { timeoutMs?: number; maxClicks?: number } = {},
): Promise<DiscoverCandidate[]> {
  if (!isWebViewAvailable()) {
    throw new Error("Bun.WebView is not available in this runtime");
  }
  assertSafePublicFetchUrl(pageUrl);

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxClicks = opts.maxClicks ?? MAX_CLICKS;

  return withTimeout<DiscoverCandidate[]>(
    (async () => {
      // Prefer chrome backend for Network.* CDP events when possible.
      let view;
      try {
        view = new Bun.WebView({
          width: 1280,
          height: 900,
          dataStore: "ephemeral",
          backend: "chrome",
        });
      } catch {
        view = new Bun.WebView({
          width: 1280,
          height: 900,
          dataStore: "ephemeral",
        });
      }

      try {
        const networkUrls = [];
        const navigated = [];

        const pushNet = (url, why) => {
          if (!url || url.startsWith("blob:") || url.startsWith("data:")) return;
          try {
            assertSafePublicFetchUrl(url);
          } catch {
            return;
          }
          networkUrls.push({ url, why });
        };

        view.onNavigated = (url) => {
          if (url) navigated.push(url);
        };

        // Attach listeners before navigate when possible; enable Network after session exists.
        const onResp = (e) => {
          try {
            const resp = e?.data?.response || {};
            const url = String(resp.url || "");
            const ct = String(resp.mimeType || resp.headers?.["content-type"] || "");
            const status = Number(resp.status || 0);
            if (!url || status >= 400) return;
            if (looksLikeArtifactUrl(url) || contentTypeLooksBinary(ct)) {
              pushNet(url, `network:${ct || "response"}`);
            }
          } catch {}
        };
        const onReq = (e) => {
          try {
            const req = e?.data?.request || {};
            const url = String(req.url || "");
            if (looksLikeArtifactUrl(url)) pushNet(url, "network-request");
          } catch {}
        };
        try {
          if (typeof view.addEventListener === "function") {
            view.addEventListener("Network.responseReceived", onResp);
            view.addEventListener("Network.requestWillBeSent", onReq);
          }
        } catch {}

        await view.navigate(pageUrl);

        let networkEnabled = false;
        try {
          if (typeof view.cdp === "function") {
            await view.cdp("Network.enable");
            networkEnabled = true;
          }
        } catch {
          networkEnabled = false;
        }

        await Bun.sleep(1500);

        let links = [];
        let ctas = [];
        try {
          const evaluated = await view.evaluate(EXTRACTOR_JS);
          const payload =
            typeof evaluated === "string" ? JSON.parse(evaluated) : evaluated;
          if (payload && typeof payload === "object") {
            links = Array.isArray(payload.links) ? payload.links : [];
            ctas = Array.isArray(payload.ctas) ? payload.ctas : [];
          } else if (Array.isArray(evaluated)) {
            links = evaluated;
          }
        } catch {}

        // --- WebView-rendered install-command extraction (JS-hydrated bashinstall) ---
        // For JS SPA shells (e.g. developer.meta.com / llama.com) the curl|bash one-liner
        // is not in static HTML or hrefs but in rendered innerText (pre,code, visible text).
        // Run the same analyzer regexes as static extractCandidatesFromHtml over rendered text.
        let renderedTextForScript = "";
        let renderedCodeTextForScript = "";
        try {
          const t = await view.evaluate(`document.body ? document.body.innerText : ""`);
          renderedTextForScript = typeof t === "string" ? t : (t != null ? String(t) : "");
          if (renderedTextForScript.startsWith('"') && renderedTextForScript.endsWith('"')) {
            try {
              renderedTextForScript = JSON.parse(renderedTextForScript);
            } catch {}
          }
        } catch {}
        try {
          const c = await view.evaluate(
            `Array.from(document.querySelectorAll("pre, code")).map(e=>e.textContent||"").join("\\n")`,
          );
          let s = typeof c === "string" ? c : "";
          if (s.startsWith('"') && s.endsWith('"')) {
            try {
              s = JSON.parse(s);
            } catch {}
          }
          renderedCodeTextForScript = s;
        } catch {}

        const candidates = [];
        const seen = new Set();
        const add = (url, evidence) => {
          if (!url) return;
          try {
            assertSafePublicFetchUrl(url);
          } catch {
            return;
          }
          try {
            const u = new URL(url);
            const p = new URL(pageUrl);
            // Drop pure page assets early (css/js/fonts/images).
            if (
              /\.(?:png|jpe?g|gif|svg|webp|ico|css|js|mjs|map|woff2?|ttf|otf|eot|mp4|webm|mp3|json|webmanifest)(?:\?|#|$)/i.test(
                u.pathname,
              )
            ) {
              return;
            }
            if (
              u.origin === p.origin &&
              !looksLikeArtifactUrl(url) &&
              !/github\.com|raw\.githubusercontent|npmjs|pypi|crates|rubygems|nuget|apps\.apple|setapp|gumroad\.com|gum\.co|itch\.io/i.test(
                url,
              )
            ) {
              if (!/\.[a-z0-9]{2,5}(?:\?|#|$)/i.test(u.pathname)) return;
            }
          } catch {
            return;
          }
          if (seen.has(url)) return;
          seen.add(url);
          const scored = scoreCandidateUrl(url, pageUrl, [evidence, "webview"]);
          scored.source = "webview";
          if (String(evidence).startsWith("network")) {
            scored.score += 40;
            scored.evidence.push("network-intercept");
          }
          // Store gates never become auto-install artifacts via network boost alone.
          if (scored.kind === "store-download-gate" && scored.score > 65) {
            scored.score = 65;
          }
          candidates.push(scored);
        };

        for (const item of links) add(item?.url, item?.why || "dom");
        for (const u of navigated) add(u, "navigated");
        for (const n of networkUrls) add(n.url, n.why);

        // Patch rendered bashinstall one-liner as install-command candidate (webview variant of
        // extractCandidatesFromHtml -> detectScriptInstall). This is what the monitored-install
        // render-judgment helper does for agent judgment, and must also happen in production.
        try {
          const combinedForDetect = [renderedTextForScript, renderedCodeTextForScript]
            .filter(Boolean)
            .join("\n");
          const hit =
            detectScriptInstall(combinedForDetect) ||
            detectScriptInstall(renderedTextForScript) ||
            detectScriptInstall(renderedCodeTextForScript);
          if (hit?.url) {
            // scoreCandidateUrl will promote unknown->bash-script and add +85 install-command-boost
            add(hit.url, "install-command");
          }
        } catch {}

        const hasStrongArtifact = candidates.some(
          (c) => c.score >= 70 && looksLikeArtifactUrl(c.url),
        );

        if (!hasStrongArtifact) {
          const rankedCtas = [...ctas].sort((a, b) => {
            const score = (t) => {
              let s = 0;
              if (/mac|darwin|osx|apple/i.test(t)) s += 5;
              if (/download/i.test(t)) s += 3;
              if (/dmg|pkg|zip/i.test(t)) s += 4;
              if (/windows|win64|\.exe|linux/i.test(t)) s -= 3;
              return s;
            };
            return score(b.text) - score(a.text);
          });

          let clicks = 0;
          for (const cta of rankedCtas) {
            if (clicks >= maxClicks) break;
            const beforeNet = networkUrls.length;
            const beforeNav = navigated.length;
            try {
              if (cta.sel) {
                try {
                  await view.click(cta.sel, { timeout: 2500 });
                } catch {
                  await view.evaluate(`(${CLICK_BY_INDEX_JS})(${cta.index})`);
                }
              } else {
                await view.evaluate(`(${CLICK_BY_INDEX_JS})(${cta.index})`);
              }
              clicks++;
              await Bun.sleep(networkEnabled ? 1800 : 900);
              if (view.url) add(String(view.url), `click-nav:${cta.text}`);
              for (const n of networkUrls.slice(beforeNet)) add(n.url, n.why);
              for (const u of navigated.slice(beforeNav)) add(u, `click-navigated:${cta.text}`);

              try {
                const again = await view.evaluate(EXTRACTOR_JS);
                const payload =
                  typeof again === "string" ? JSON.parse(again) : again;
                const more = Array.isArray(payload?.links)
                  ? payload.links
                  : Array.isArray(again)
                    ? again
                    : [];
                for (const item of more) add(item?.url, `post-click:${cta.text}`);
              } catch {}
              // Re-check rendered text after click for newly revealed curl|bash one-liners
              try {
                const t2 = await view.evaluate(`document.body ? document.body.innerText : ""`);
                let text2 = typeof t2 === "string" ? t2 : t2 != null ? String(t2) : "";
                if (text2.startsWith('"') && text2.endsWith('"')) {
                  try {
                    text2 = JSON.parse(text2);
                  } catch {}
                }
                const hit2 = detectScriptInstall(text2);
                if (hit2?.url) add(hit2.url, "install-command");
              } catch {}

              if (candidates.some((c) => looksLikeArtifactUrl(c.url) && c.score >= 90)) {
                break;
              }
            } catch {}
          }
        }

        for (const n of networkUrls) add(n.url, n.why);
        return candidates.sort((a, b) => b.score - a.score);
      } finally {
        try {
          view.close?.();
        } catch {}
      }
    })(),
    timeoutMs,
    "WebView discovery",
  );
}
