import {
  scoreCandidateUrl,
  type DiscoverCandidate,
} from "./page-discover.ts";
import { assertSafePublicFetchUrl } from "./utils.ts";

declare const Bun: any;

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_CLICKS = 3;

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
  for (const el of document.querySelectorAll("a, button")) {
    const text = (el.innerText || el.textContent || "").trim();
    if (/download|mac|dmg|pkg|install/i.test(text)) {
      push(el.href || el.getAttribute("href") || el.getAttribute("data-url"), "cta-text:" + text.slice(0, 40));
    }
  }
  for (const el of document.querySelectorAll("pre, code")) {
    const t = el.textContent || "";
    const m = t.match(/https?:\\/\\/[^\\s\"'<>]+/g);
    if (m) for (const u of m) push(u, "code");
  }
  return out;
})()`;

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

/**
 * Render a page in Bun.WebView, extract download-like URLs, optionally click
 * a few high-signal controls to surface navigation targets.
 */
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

  return withTimeout(
    (async () => {
      await using view = new Bun.WebView({
        width: 1280,
        height: 800,
        dataStore: "ephemeral",
      });

      const navigated: string[] = [];
      view.onNavigated = (url: string) => {
        if (url) navigated.push(url);
      };

      await view.navigate(pageUrl);

      let raw: Array<{ url?: string; why?: string }> = [];
      try {
        const evaluated = await view.evaluate(EXTRACTOR_JS);
        if (Array.isArray(evaluated)) raw = evaluated;
        else if (typeof evaluated === "string") {
          try {
            raw = JSON.parse(evaluated);
          } catch {
            raw = [];
          }
        }
      } catch {
        raw = [];
      }

      const candidates: DiscoverCandidate[] = [];
      const seen = new Set<string>();
      const add = (url: string | undefined, evidence: string) => {
        if (!url) return;
        try {
          assertSafePublicFetchUrl(url);
        } catch {
          return;
        }
        if (seen.has(url)) return;
        seen.add(url);
        const scored = scoreCandidateUrl(url, pageUrl, [evidence, "webview"]);
        scored.source = "webview";
        candidates.push(scored);
      };

      for (const item of raw) {
        add(item?.url, item?.why || "dom");
      }
      for (const u of navigated) add(u, "navigated");

      // Targeted clicks when still weak
      const strong = candidates.filter((c) => c.score >= 70);
      if (strong.length === 0) {
        const clickSelectors = [
          'a[href$=".dmg"]',
          'a[href*=".dmg"]',
          'a[href$=".pkg"]',
          'a[href$=".zip"]',
          'a[href*="download"]',
          'a[download]',
        ];
        let clicks = 0;
        for (const sel of clickSelectors) {
          if (clicks >= maxClicks) break;
          try {
            await view.click(sel, { timeout: 2500 });
            clicks++;
            await Bun.sleep(400);
            if (view.url) add(String(view.url), `click:${sel}`);
            try {
              const again = await view.evaluate(EXTRACTOR_JS);
              const list = Array.isArray(again) ? again : [];
              for (const item of list) add(item?.url, `post-click:${sel}`);
            } catch {
              /* ignore */
            }
          } catch {
            /* selector not actionable */
          }
        }
      }

      return candidates.sort((a, b) => b.score - a.score);
    })(),
    timeoutMs,
    "WebView discovery",
  );
}
