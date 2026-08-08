import { toCaskToken, writeCask } from "../utils.ts";

const HOMEBREW_API_BASE = "https://formulae.brew.sh/api";
const HOMEBREW_CASK_RAW_BASE =
  "https://raw.githubusercontent.com/Homebrew/homebrew-cask";

const FETCH_TIMEOUT = 30_000;

type HomebrewCaskApiInfo = {
  token: string;
  version?: string;
  homepage?: string;
  ruby_source_path?: string;
  tap_git_head?: string;
};

function registrableHost(hostname: string): string {
  const parts = String(hostname || "")
    .toLowerCase()
    .split(".")
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

/** First label of an eTLD+1 host (refine.app → refine, refine.sh → refine). */
function hostSldLabel(registrable: string): string {
  return (
    String(registrable || "")
      .toLowerCase()
      .split(".")
      .filter(Boolean)[0] || ""
  );
}

/**
 * Strip common marketing host prefixes so cleanshot.com matches getcleanshot.com.
 * Keep original when stripping would leave a too-short core.
 */
function brandCoreLabel(label: string): string {
  const l = String(label || "").toLowerCase();
  if (!l) return "";
  const stripped = l.replace(/^(get|try|use|go|download|www|app)/, "");
  if (stripped.length >= 3) return stripped;
  return l;
}

/**
 * Case C: when the user pastes a product homepage that already has an official
 * homebrew/cask whose homepage shares the same registrable domain, adopt that
 * cask instead of inventing a MAS/tap duplicate from marketing HTML.
 *
 * Also accepts same product brand on a different TLD when the cask token equals
 * the page host label (e.g. expired refine.app → official cask homepage refine.sh).
 * Brand cores treat marketing prefixes as equivalent (cleanshot.com ↔ getcleanshot.com).
 */
/** Expand batch slugs into plausible homebrew/cask tokens.
 * aldente-pro → aldente-pro, aldente, aldentepro
 * refine-app → refine-app, refine, refineapp
 * cleanshot-x → cleanshot-x, cleanshot, cleanshotx
 */
function expandPreferredCaskTokens(preferredName?: string | null): string[] {
  const tokens: string[] = [];
  const push = (raw: string | null | undefined) => {
    const t = toCaskToken(String(raw || ""));
    if (t && !tokens.includes(t)) tokens.push(t);
  };
  const raw = String(preferredName || "").trim();
  if (!raw) return tokens;
  push(raw);
  const bare = toCaskToken(raw);
  // Strip common product/edition suffixes used in batch slugs.
  const stripped = bare.replace(
    /-(pro|app|mac|desktop|for-mac|premium|plus|free|lite|beta|nightly|stable|x)$/i,
    "",
  );
  if (stripped !== bare) push(stripped);
  // First hyphen segment (aldente-pro → aldente, cleanshot-x → cleanshot).
  if (bare.includes("-")) push(bare.split("-")[0]);
  // Dehyphenated form.
  push(bare.replace(/-/g, ""));
  return tokens;
}

export async function matchOfficialCaskByHomepage(
  pageUrl: string,
  preferredName?: string | null,
): Promise<{ token: string; version?: string; homepage?: string } | null> {
  let pageHost = "";
  try {
    pageHost = registrableHost(new URL(pageUrl).hostname);
  } catch {
    return null;
  }
  if (!pageHost) return null;
  const pageLabel = hostSldLabel(pageHost);
  const pageCore = brandCoreLabel(pageLabel);

  const tokens: string[] = [];
  const push = (raw: string | null | undefined) => {
    const t = toCaskToken(String(raw || ""));
    if (t && !tokens.includes(t)) tokens.push(t);
  };
  for (const t of expandPreferredCaskTokens(preferredName)) push(t);
  try {
    const host = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");
    const hostLabel = host.split(".")[0];
    push(hostLabel);
    // getcleanshot.com → also probe cleanshot
    const core = brandCoreLabel(hostLabel);
    if (core && core !== hostLabel) push(core);
  } catch {
    /* ignore */
  }
  if (pageCore && pageCore !== pageLabel) push(pageCore);

  for (const token of tokens) {
    try {
      const apiUrl = `${HOMEBREW_API_BASE}/cask/${encodeURIComponent(token)}.json`;
      const info = (await fetchJson(apiUrl)) as HomebrewCaskApiInfo;
      if (!info?.token) continue;
      const hp = info.homepage || "";
      if (!hp) continue;
      let caskHost = "";
      try {
        caskHost = registrableHost(new URL(hp).hostname);
      } catch {
        continue;
      }
      if (!caskHost) continue;

      const exactDomain = caskHost === pageHost;
      // Cross-TLD / marketing-prefix brand match: only when the probed token is
      // the brand core so example.com + --name superwhisper still returns null.
      const caskLabel = hostSldLabel(caskHost);
      const caskCore = brandCoreLabel(caskLabel);
      const official = info.token || token;
      const coresMatch =
        Boolean(pageCore) && Boolean(caskCore) && pageCore === caskCore;
      const tokenIsBrand =
        token === pageLabel ||
        token === pageCore ||
        token === caskLabel ||
        token === caskCore ||
        official === pageLabel ||
        official === pageCore ||
        official === caskCore;
      const brandTldFlex = coresMatch && tokenIsBrand;

      if (exactDomain || brandTldFlex) {
        return {
          token: info.token || token,
          version: info.version,
          homepage: info.homepage,
        };
      }
    } catch {
      /* token not on homebrew/cask or network error */
    }
  }

  // Fallback: scan cask index for homepage registrable-domain matches when
  // host SLD ≠ product token (apphousekitchen.com → aldente).
  try {
    const index = (await fetchJson(`${HOMEBREW_API_BASE}/cask.json`)) as Array<{
      token?: string;
      version?: string;
      homepage?: string;
    }>;
    if (!Array.isArray(index)) return null;
    const preferred = new Set(expandPreferredCaskTokens(preferredName));
    const domainHits: Array<{
      token: string;
      version?: string;
      homepage?: string;
    }> = [];
    for (const row of index) {
      const hp = row?.homepage || "";
      if (!hp || !row?.token) continue;
      let caskHost = "";
      try {
        caskHost = registrableHost(new URL(hp).hostname);
      } catch {
        continue;
      }
      if (caskHost !== pageHost) continue;
      domainHits.push({
        token: row.token,
        version: row.version,
        homepage: row.homepage,
      });
    }
    if (domainHits.length === 0) return null;
    if (domainHits.length === 1) return domainHits[0];
    // Multiple products share the vendor domain: prefer slug-derived tokens.
    const byPreferred = domainHits.find((h) => preferred.has(toCaskToken(h.token)));
    if (byPreferred) return byPreferred;
    // Prefer a hit whose token appears as a path/name fragment of preferred.
    for (const h of domainHits) {
      const t = toCaskToken(h.token);
      for (const p of preferred) {
        if (p.includes(t) || t.includes(p)) return h;
      }
    }
  } catch {
    /* index unavailable */
  }
  return null;
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { "User-Agent": "allbrew/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "allbrew/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

export async function generateHomebrewCask(name: string, options: any = {}) {
  const token = toCaskToken(name);

  const apiUrl = `${HOMEBREW_API_BASE}/cask/${encodeURIComponent(token)}.json`;
  const info = (await fetchJson(apiUrl)) as HomebrewCaskApiInfo;

  const sourcePath = info.ruby_source_path;
  const sourceHead = info.tap_git_head;
  if (!sourcePath || !sourceHead) {
    throw new Error(`Homebrew Cask API did not return source path for ${token}`);
  }

  const rawUrl = `${HOMEBREW_CASK_RAW_BASE}/${sourceHead}/${sourcePath}`;
  const ruby = await fetchText(rawUrl);

  const filePath = await writeCask(token, ruby, options.tapPath);
  return {
    filePath,
    name: token,
    type: "cask" as const,
    recordedVersion: info.version || "",
  };
}
