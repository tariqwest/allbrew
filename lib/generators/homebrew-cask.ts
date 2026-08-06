import { toCaskToken, writeCask } from "../utils.ts";

const HOMEBREW_API_BASE = "https://formulae.brew.sh/api";
const HOMEBREW_CASK_RAW_BASE =
  "https://raw.githubusercontent.com/Homebrew/homebrew-cask";

const FETCH_TIMEOUT = 30_000;

type HomebrewCaskApiInfo = {
  token: string;
  version?: string;
  ruby_source_path?: string;
  tap_git_head?: string;
};

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
