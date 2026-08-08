import { toFormulaName, writeFormula } from "../utils.ts";

const HOMEBREW_API_BASE = "https://formulae.brew.sh/api";
const HOMEBREW_CORE_RAW_BASE =
  "https://raw.githubusercontent.com/Homebrew/homebrew-core";

const FETCH_TIMEOUT = 30_000;

type HomebrewBottleFile = {
  cellar: string;
  sha256: string;
};

type HomebrewBottle = {
  rebuild: number;
  root_url: string;
  files: Record<string, HomebrewBottleFile>;
};

type HomebrewApiInfo = {
  name: string;
  versions?: { stable?: string };
  ruby_source_path?: string;
  tap_git_head?: string;
  bottle?: { stable?: HomebrewBottle };
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

/**
 * Homebrew formula API returns cellar as a Ruby-ish symbol string
 * (e.g. ":any", ":any_skip_relocation") or an absolute path. Older callers
 * may pass a bare name. Never emit double-colon (::any_...).
 */
export function formatBottleCellar(cellar: string | undefined | null): string {
  if (cellar == null || cellar === "") return ":any";
  const s = String(cellar).trim();
  if (!s) return ":any";
  if (s.startsWith(":")) return s;
  if (s.startsWith("/")) return JSON.stringify(s);
  return `:${s}`;
}

export function renderBottleBlock(indent: string, bottle: HomebrewBottle): string {
  const lines: string[] = [`${indent}bottle do`];

  if (Number.isInteger(bottle.rebuild) && bottle.rebuild !== 0) {
    lines.push(`${indent}  rebuild ${bottle.rebuild}`);
  }

  if (bottle.root_url) {
    lines.push(`${indent}  root_url ${JSON.stringify(bottle.root_url)}`);
  }

  for (const [os, entry] of Object.entries(bottle.files || {})) {
    if (!entry || typeof entry !== "object") continue;
    const { sha256, cellar } = entry as HomebrewBottleFile;
    if (!sha256) continue;
    const cellarSymbol = formatBottleCellar(cellar);
    lines.push(
      `${indent}  sha256 cellar: ${cellarSymbol}, ${os}: ${JSON.stringify(sha256)}`,
    );
  }

  lines.push(`${indent}end`);
  return lines.join("\n");
}

function injectBottleBlock(ruby: string, info: HomebrewApiInfo): string {
  const stableBottle = info.bottle?.stable;
  if (!stableBottle) return ruby;

  // Match an existing bottle block with the same leading indent on its `end`.
  const pattern = /^(\s*)bottle do\s*\n([\s\S]*?)^\1end\s*$/m;
  const match = ruby.match(pattern);

  if (!match) {
    // No bottle block to replace; try to insert before the first depends_on.
    const depsMatch = ruby.match(/^(\s*)depends_on/m);
    if (!depsMatch) return ruby;
    const idx = ruby.indexOf(depsMatch[0]);
    return (
      ruby.slice(0, idx) +
      renderBottleBlock(depsMatch[1], stableBottle) +
      "\n\n" +
      ruby.slice(idx)
    );
  }

  const indent = match[1];
  return ruby.replace(match[0], renderBottleBlock(indent, stableBottle));
}

export async function generateHomebrewFormula(name: string, options: any = {}) {
  const token = toFormulaName(name);

  const apiUrl = `${HOMEBREW_API_BASE}/formula/${encodeURIComponent(token)}.json`;
  const info = (await fetchJson(apiUrl)) as HomebrewApiInfo;

  const sourcePath = info.ruby_source_path;
  const sourceHead = info.tap_git_head;
  if (!sourcePath || !sourceHead) {
    throw new Error(`Homebrew API did not return source path for ${token}`);
  }

  const rawUrl = `${HOMEBREW_CORE_RAW_BASE}/${sourceHead}/${sourcePath}`;
  let ruby = await fetchText(rawUrl);

  ruby = injectBottleBlock(ruby, info);

  const filePath = await writeFormula(token, ruby, options.tapPath);
  return {
    filePath,
    name: token,
    type: "formula" as const,
    recordedVersion: info.versions?.stable || "",
  };
}
