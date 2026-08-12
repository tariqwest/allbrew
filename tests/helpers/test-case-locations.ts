import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

export const DEFAULT_TEST_CASES_TABLE = resolve(
  REPO_ROOT,
  ".agents/plans/allbrew-test-cases.md",
);

export const LOCATION_COLUMNS = [
  "in_dev_website",
  "in_github",
  "in_setapp",
  "in_mas",
  "in_npm",
  "in_pip",
  "in_cargo",
  "in_go_mod",
  "in_ruby_gem",
  "in_dotnet",
  "has_script_install",
] as const;

export type LocationColumn = (typeof LOCATION_COLUMNS)[number];

export type MaterializedLocation = {
  app: string;
  source_column: LocationColumn | "seed";
  raw_cell: string;
  url: string;
  seed_name?: string;
};

export type SkippedLocation = {
  app: string;
  source_column: string;
  raw_cell: string;
  skip_reason: string;
};

export type MaterializeResult = {
  locations: MaterializedLocation[];
  skipped: SkippedLocation[];
};

const EMPTY_CELL = new Set([
  "",
  "-",
  "—",
  "–",
  "n/a",
  "N/A",
  "no",
  "No",
  "false",
  "False",
  "0",
]);

const YES_CELL = new Set(["yes", "Yes", "y", "Y", "true", "True"]);

function stripCell(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/^`+|`+$/g, "")
    .trim();
}

function ensureHttps(hostOrUrl: string): string {
  if (/^https?:\/\//i.test(hostOrUrl)) return hostOrUrl;
  return `https://${hostOrUrl.replace(/^\/+/, "")}`;
}

/** Normalize npm hostpaths so classifier NPM_PACKAGE_RE matches. */
function normalizeNpmUrl(value: string): string | null {
  const v = stripCell(value);
  if (!v || EMPTY_CELL.has(v) || YES_CELL.has(v)) return null;
  if (/^https?:\/\/(?:www\.)?npmjs\.com\/package\//i.test(v)) return v;
  const m = v.match(/^(?:www\.)?npmjs\.com\/package\/(@[^/]+\/[^/]+|[^/]+)/i);
  if (m) return `https://www.npmjs.com/package/${m[1]}`;
  // bare package name
  if (/^@?[\w.-]+(?:\/[\w.-]+)?$/.test(v) && !v.includes(" ")) {
    return `https://www.npmjs.com/package/${v}`;
  }
  return null;
}

function normalizePypiUrl(value: string): string | null {
  const v = stripCell(value);
  if (!v || EMPTY_CELL.has(v) || YES_CELL.has(v)) return null;
  if (/^https?:\/\/(?:www\.)?pypi\.org\/project\//i.test(v)) {
    return v.replace(/\/?$/, "/");
  }
  const m = v.match(/^(?:www\.)?pypi\.org\/project\/([^/?#]+)/i);
  if (m) return `https://pypi.org/project/${m[1]}/`;
  if (/^[\w.-]+$/.test(v)) return `https://pypi.org/project/${v}/`;
  return null;
}

function normalizeCratesUrl(value: string): string | null {
  const v = stripCell(value);
  if (!v || EMPTY_CELL.has(v) || YES_CELL.has(v)) return null;
  if (/^https?:\/\/(?:www\.)?crates\.io\/crates\//i.test(v)) return v;
  const m = v.match(/^(?:www\.)?crates\.io\/crates\/([^/?#]+)/i);
  if (m) return `https://crates.io/crates/${m[1]}`;
  if (v.startsWith("github.com/") || /^https?:\/\/github\.com\//i.test(v)) {
    return ensureHttps(v.replace(/\.git$/, "").replace(/\/$/, ""));
  }
  if (/^[\w.-]+$/.test(v)) return `https://crates.io/crates/${v}`;
  return null;
}

function normalizeRubygemsUrl(value: string): string | null {
  const v = stripCell(value);
  if (!v || EMPTY_CELL.has(v) || YES_CELL.has(v)) return null;
  if (/^https?:\/\/(?:www\.)?rubygems\.org\/gems\//i.test(v)) return v;
  const m = v.match(/^(?:www\.)?rubygems\.org\/gems\/([^/?#]+)/i);
  if (m) return `https://rubygems.org/gems/${m[1]}`;
  // Some table cells put the GitHub repo in in_ruby_gem — classify as github URL.
  if (v.startsWith("github.com/") || /^https?:\/\/github\.com\//i.test(v)) {
    return normalizeGithubUrl(v);
  }
  if (/^[\w.-]+$/.test(v)) return `https://rubygems.org/gems/${v}`;
  return null;
}

function normalizeNugetUrl(value: string): string | null {
  const v = stripCell(value);
  if (!v || EMPTY_CELL.has(v) || YES_CELL.has(v)) return null;
  if (/^https?:\/\/(?:www\.)?nuget\.org\/packages\//i.test(v)) return v;
  const m = v.match(/^(?:www\.)?nuget\.org\/packages\/([^/?#]+)/i);
  if (m) return `https://www.nuget.org/packages/${m[1]}`;
  if (/^[\w.-]+$/.test(v)) return `https://www.nuget.org/packages/${v}`;
  return null;
}

function normalizeGithubUrl(value: string): string | null {
  const v = stripCell(value);
  if (!v || EMPTY_CELL.has(v) || YES_CELL.has(v)) return null;
  if (/^https?:\/\/github\.com\//i.test(v)) {
    return v.replace(/\.git$/i, "").replace(/\/$/, "");
  }
  const m = v.match(/^github\.com\/([^/]+)\/([^/?#]+)/i);
  if (m) {
    const repo = m[2].replace(/\.git$/i, "");
    return `https://github.com/${m[1]}/${repo}`;
  }
  // bare owner/repo (no host). Skip domain-looking first segments (zgo.at/foo).
  const bare = v.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\.git)?\/?$/);
  if (bare && !bare[1].includes(".")) {
    return `https://github.com/${bare[1]}/${bare[2].replace(/\.git$/i, "")}`;
  }
  return null;
}

function normalizeSetappUrl(value: string): string | null {
  const v = stripCell(value);
  if (!v || EMPTY_CELL.has(v) || YES_CELL.has(v)) return null;
  if (/^https?:\/\/setapp\.com\/apps\//i.test(v)) return v;
  const m = v.match(/^(?:www\.)?setapp\.com\/apps\/([^/?#]+)/i);
  if (m) return `https://setapp.com/apps/${m[1]}`;
  if (/^[\w-]+$/.test(v)) return `https://setapp.com/apps/${v}`;
  return null;
}

function normalizeMasUrl(value: string): string | null {
  const v = stripCell(value);
  if (!v || EMPTY_CELL.has(v) || YES_CELL.has(v)) return null;
  if (/^https?:\/\/(apps\.apple\.com|itunes\.apple\.com)\//i.test(v)) return v;
  const idMatch = v.match(/\bid(\d+)\b/i) || v.match(/\((\d{6,})\)/);
  if (idMatch) return `https://apps.apple.com/app/id${idMatch[1]}`;
  if (/^(?:www\.)?(apps\.apple\.com|itunes\.apple\.com)\//i.test(v)) {
    return ensureHttps(v);
  }
  return null;
}

function normalizeDevWebsite(value: string): string | null {
  const v = stripCell(value);
  if (!v || EMPTY_CELL.has(v) || YES_CELL.has(v)) return null;
  if (/^https?:\/\//i.test(v)) return v;
  // bare domain
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(v) && !v.includes(" ")) {
    return ensureHttps(v);
  }
  return null;
}

function normalizeScriptInstall(value: string): string | null {
  const v = stripCell(value);
  if (!v || EMPTY_CELL.has(v)) return null;
  if (YES_CELL.has(v)) return null; // flag only — no URL
  if (/^https?:\/\//i.test(v)) return v;
  if (/\.(sh|bash)(\?|#|$)/i.test(v) || v.includes("raw.githubusercontent.com")) {
    return ensureHttps(v);
  }
  return null;
}

/**
 * Convert a single table cell into a classifier-ready absolute URL, or null.
 */
export function materializeCell(
  column: LocationColumn,
  raw: string,
): { url: string } | { skip_reason: string } {
  const cell = stripCell(raw);
  if (!cell || EMPTY_CELL.has(cell)) {
    return { skip_reason: "empty" };
  }

  switch (column) {
    case "in_github":
    case "in_go_mod": {
      const url = normalizeGithubUrl(cell);
      if (!url) return { skip_reason: "unparseable_github_or_module_path" };
      return { url };
    }
    case "in_npm": {
      const url = normalizeNpmUrl(cell);
      if (!url) return { skip_reason: "unparseable_npm" };
      return { url };
    }
    case "in_pip": {
      const url = normalizePypiUrl(cell);
      if (!url) return { skip_reason: "unparseable_pypi" };
      return { url };
    }
    case "in_cargo": {
      const url = normalizeCratesUrl(cell);
      if (!url) return { skip_reason: "unparseable_cargo" };
      return { url };
    }
    case "in_ruby_gem": {
      const url = normalizeRubygemsUrl(cell);
      if (!url) return { skip_reason: "unparseable_rubygems" };
      return { url };
    }
    case "in_dotnet": {
      const url = normalizeNugetUrl(cell);
      if (!url) return { skip_reason: "unparseable_nuget" };
      return { url };
    }
    case "in_setapp": {
      const url = normalizeSetappUrl(cell);
      if (!url) return { skip_reason: "unparseable_setapp" };
      return { url };
    }
    case "in_mas": {
      const url = normalizeMasUrl(cell);
      if (!url) return { skip_reason: "unparseable_mas" };
      return { url };
    }
    case "in_dev_website": {
      const url = normalizeDevWebsite(cell);
      if (!url) return { skip_reason: "unparseable_dev_website" };
      return { url };
    }
    case "has_script_install": {
      if (YES_CELL.has(cell)) {
        return { skip_reason: "script_flag_without_url" };
      }
      const url = normalizeScriptInstall(cell);
      if (!url) return { skip_reason: "unparseable_script_install" };
      return { url };
    }
    default:
      return { skip_reason: "unknown_column" };
  }
}

function rowToObject(
  headers: string[],
  row: string[],
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = row[i] ?? "";
  }
  return obj;
}

/**
 * Extract the first contiguous GFM table that has `app` + `in_github` headers.
 * Isolating the block avoids md-spreadsheet-parser absorbing prose as rows.
 */
export function extractTestCasesGfmTable(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (
      t.startsWith("|") &&
      /\|\s*app\s*\|/i.test(t) &&
      t.includes("in_github")
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error("Could not find test-cases table header (app + in_github)");
  }

  const block: string[] = [lines[headerIdx]];
  // optional separator + data rows
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) break;
    block.push(line);
  }
  if (block.length < 3) {
    throw new Error("Test-cases table block is too short");
  }
  return block.join("\n") + "\n";
}

type ParsedTable = { headers: string[]; rows: string[][] };

/**
 * Parse a GFM table via Node + md-spreadsheet-parser.
 * Bun cannot run the parser's WASM worker (tcp_wrap missing), so we always
 * bridge through `node` the same way add-row.mjs does under Node.
 */
export function parseGfmTableWithNode(gfmTableMarkdown: string): ParsedTable {
  const parserPath = resolve(
    REPO_ROOT,
    "node_modules/md-spreadsheet-parser/dist/index.js",
  );
  const dir = mkdtempSync(join(tmpdir(), "allbrew-table-"));
  const mdPath = join(dir, "table.md");
  const outPath = join(dir, "out.json");
  try {
    writeFileSync(mdPath, gfmTableMarkdown, "utf-8");
    const script = `
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { scanTables } = await import(pathToFileURL(${JSON.stringify(parserPath)}).href);
const md = readFileSync(${JSON.stringify(mdPath)}, "utf-8");
const tables = scanTables(md);
if (!tables?.length) throw new Error("scanTables returned no tables");
const t = tables.find((x) => Array.isArray(x.headers) && x.headers.includes("app") && x.headers.includes("in_github")) || tables[0];
writeFileSync(${JSON.stringify(outPath)}, JSON.stringify({ headers: t.headers || [], rows: t.rows || [] }));
`;
    const scriptPath = join(dir, "parse.mjs");
    writeFileSync(scriptPath, script, "utf-8");
    const res = spawnSync("node", [scriptPath], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    if (res.status !== 0) {
      throw new Error(
        `Node table parse failed: ${res.stderr || res.stdout || res.error}`,
      );
    }
    const parsed = JSON.parse(readFileSync(outPath, "utf-8")) as ParsedTable;
    return parsed;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

function isRealAppName(app: string): boolean {
  if (!app || app === "app") return false;
  if (app.startsWith("#") || app.startsWith(">") || app.startsWith("-")) {
    return false;
  }
  // prose / section labels absorbed as fake rows
  if (/\s{2,}/.test(app) && app.length > 40) return false;
  if (/^(blank cell|table column|data provenance|originally extracted)/i.test(app)) {
    return false;
  }
  return true;
}

/**
 * Parse the master test-cases table and materialize classifier URLs.
 */
export async function materializeFromTable(
  tablePath: string = DEFAULT_TEST_CASES_TABLE,
): Promise<MaterializeResult> {
  const markdown = readFileSync(tablePath, "utf-8");
  const gfm = extractTestCasesGfmTable(markdown);
  const table = parseGfmTableWithNode(gfm);

  const headers: string[] = table.headers || [];
  const rows: string[][] = table.rows || [];
  const locations: MaterializedLocation[] = [];
  const skipped: SkippedLocation[] = [];

  if (!headers.includes("app")) {
    throw new Error(`Parsed table missing app header: ${headers.join(", ")}`);
  }

  for (const row of rows) {
    const obj = rowToObject(headers, row);
    const app = stripCell(obj.app || "");
    if (!isRealAppName(app)) continue;

    for (const col of LOCATION_COLUMNS) {
      if (!headers.includes(col)) continue;
      const raw = obj[col] ?? "";
      const cell = stripCell(raw);
      if (!cell || EMPTY_CELL.has(cell)) continue;

      const result = materializeCell(col, cell);
      if ("url" in result) {
        locations.push({
          app,
          source_column: col,
          raw_cell: cell,
          url: result.url,
        });
      } else {
        skipped.push({
          app,
          source_column: col,
          raw_cell: cell,
          skip_reason: result.skip_reason,
        });
      }
    }
  }

  return { locations, skipped };
}

export type SeedUrl = {
  name: string;
  url: string;
  notes?: string;
};

export function materializeSeeds(seeds: SeedUrl[]): MaterializedLocation[] {
  return seeds.map((s) => ({
    app: s.name,
    source_column: "seed" as const,
    raw_cell: s.url,
    url: s.url,
    seed_name: s.name,
  }));
}
