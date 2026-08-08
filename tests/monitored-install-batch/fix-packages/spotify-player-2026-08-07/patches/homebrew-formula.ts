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
 * Homebrew/core formula tokens may contain underscores (e.g. spotify_player).
 * Unlike toFormulaName, do not rewrite `_` to `-`.
 */
export function toHomebrewCoreToken(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Candidate API tokens for a user/classifier name (underscore + hyphen variants). */
export function homebrewFormulaApiCandidates(name: string): string[] {
  const raw = String(name || "").trim().toLowerCase();
  const preserved = toHomebrewCoreToken(raw);
  const hyphenated = toFormulaName(raw);
  const underscored = preserved.replace(/-/g, "_");
  const out: string[] = [];
  for (const c of [raw, preserved, underscored, hyphenated]) {
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * Format bottle.files[*].cellar for Homebrew Ruby DSL.
 * API values are either:
 * - Ruby symbol strings: ":any", ":any_skip_relocation"
 * - bare symbol names: "any", "any_skip_relocation"
 * - absolute Cellar paths: "/opt/homebrew/Cellar"
 * Never emit "::any" (double colon) or ":/opt/..." — both are invalid Ruby.
 */
export function formatBottleCellar(
  cellar: string | undefined | null,
): string {
  if (cellar == null || cellar === "") return ":any";
  const trimmed = String(cellar).trim();
  if (!trimmed) return ":any";
  if (trimmed.startsWith(":")) return trimmed;
  if (trimmed.startsWith("/")) return JSON.stringify(trimmed);
  return `:${trimmed}`;
}

export function renderBottleBlock(
  indent: string,
  bottle: HomebrewBottle,
): string {
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
    const cellarExpr = formatBottleCellar(cellar);
    lines.push(
      `${indent}  sha256 cellar: ${cellarExpr}, ${os}: ${JSON.stringify(sha256)}`,
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

async function resolveHomebrewFormulaInfo(
  name: string,
): Promise<{ token: string; info: HomebrewApiInfo }> {
  const candidates = homebrewFormulaApiCandidates(name);
  let lastError: Error | null = null;
  for (const candidate of candidates) {
    const apiUrl = `${HOMEBREW_API_BASE}/formula/${encodeURIComponent(candidate)}.json`;
    try {
      const info = (await fetchJson(apiUrl)) as HomebrewApiInfo;
      const token = info.name || candidate;
      return { token, info };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error(`Homebrew formula not found for ${name}`);
}

export async function generateHomebrewFormula(name: string, options: any = {}) {
  const { token, info } = await resolveHomebrewFormulaInfo(name);

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
