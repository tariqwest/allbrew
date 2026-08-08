import { toCaskToken, writeCask } from "../utils.ts";
import { generateHomebrewFormula } from "./homebrew-formula.ts";

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

/** Probe whether a formula exists under homebrew/core (for cask→formula fallback). */
export async function homebrewFormulaApiExists(token: string): Promise<boolean> {
  try {
    const url = `${HOMEBREW_API_BASE}/formula/${encodeURIComponent(token)}.json`;
    const response = await fetch(url, {
      headers: { "User-Agent": "allbrew/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function generateHomebrewCask(name: string, options: any = {}) {
  const token = toCaskToken(name);

  const apiUrl = `${HOMEBREW_API_BASE}/cask/${encodeURIComponent(token)}.json`;
  let info: HomebrewCaskApiInfo;
  try {
    info = (await fetchJson(apiUrl)) as HomebrewCaskApiInfo;
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    // Mis-catalogued formulae.brew.sh/cask/<name> URLs often refer to a core formula
    // (e.g. nvm). Fall back to formula generator when cask API is missing.
    if (/\bHTTP 404\b/.test(msg) && (await homebrewFormulaApiExists(token))) {
      console.error(
        `Homebrew cask '${token}' not found (404); falling back to homebrew formula`,
      );
      return generateHomebrewFormula(token, options);
    }
    throw err;
  }

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
