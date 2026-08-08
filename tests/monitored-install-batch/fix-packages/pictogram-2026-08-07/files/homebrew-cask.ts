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

/**
 * Case C: when the user pastes a product homepage that already has an official
 * homebrew/cask whose homepage shares the same registrable domain, adopt that
 * cask instead of inventing a MAS/tap duplicate from marketing HTML.
 */
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

  const tokens: string[] = [];
  const push = (raw: string | null | undefined) => {
    const t = toCaskToken(String(raw || ""));
    if (t && !tokens.includes(t)) tokens.push(t);
  };
  push(preferredName);
  try {
    const host = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");
    push(host.split(".")[0]);
  } catch {
    /* ignore */
  }

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
      if (caskHost && caskHost === pageHost) {
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
