#!/usr/bin/env node
/**
 * add-row.mjs — insert a row into .agents/plans/allbrew-test-cases.md
 *
 * Run from the repo root (or any directory) — paths are resolved correctly.
 *
 * USAGE
 *   node .agents/skills/add-test-case/add-row.mjs [OPTIONS]
 *
 * REQUIRED
 *   --app <name>               App name as it should appear in the table
 *
 * POSITIONING  (choose one; default is --at-end)
 *   --ecosystem <key>          Insert after the last row of an ecosystem group.
 *                              Valid keys: python | node | ruby | rust | go | swift | dotnet | cask | other
 *   --after-app <name>         Insert immediately after the named app row
 *   --at-end                   Insert after the last real app row (default)
 *
 * DATA COLUMNS  (all optional; omit = leave cell blank)
 *   --lang <value>             lang/runtime
 *   --framework <value>        framework
 *   --in-dev-website <value>   in_dev_website
 *   --in-github <value>        in_github          e.g. "github.com/owner/repo"
 *   --in-homebrew <value>      in_homebrew        formula/cask name if present
 *   --in-setapp <value>        in_setapp
 *   --in-mas <value>           in_mas
 *   --in-npm <value>           in_npm             e.g. "npmjs.com/package/foo"
 *   --in-pip <value>           in_pip             e.g. "pypi.org/project/foo"
 *   --in-cargo <value>         in_cargo           e.g. "github.com/owner/repo"
 *   --in-go-mod <value>        in_go_mod          e.g. "github.com/owner/repo"
 *   --in-ruby-gem <value>      in_ruby_gem
 *   --in-swiftpm <value>       in_swiftpm
 *   --in-mint <value>          in_mint
 *   --in-dotnet <value>        in_dotnet
 *   --is-tui-app               flag → is_tui_app = "yes"
 *   --is-gui-app               flag → is_gui_app = "yes"
 *   --is-webui-app             flag → is_webui_app = "yes"
 *   --is-cask-dist <value>     is_cask_dist       e.g. "MyApp-1.0.0-arm64.dmg"
 *   --has-source-dist          flag → has_source_dist = "yes"
 *   --has-prebuilt-bin <value> has_prebuilt_bin_dist  e.g. "yes" or "yes (4)"
 *   --has-script-install       flag → has_script_install = "yes"
 *   --notes <value>            notes column
 *
 * OTHER
 *   --table-file <path>        Markdown file to edit
 *                              (default: <repo-root>/.agents/plans/allbrew-test-cases.md)
 *   --dry-run                  Print what would be written; do not modify the file
 *   --help | -h                Show this help
 *
 * ECOSYSTEM DETECTION
 *   When --ecosystem is given, the script scans existing rows to find the last row
 *   that belongs to that ecosystem (using in_pip / in_npm / in_cargo / in_go_mod /
 *   in_ruby_gem / in_swiftpm / in_mint / in_dotnet / is_cask_dist signals and the
 *   lang/runtime value) and inserts the new row immediately after it.
 *
 * EXAMPLES
 *   # Python PyPI CLI — append after the last Python row
 *   node .agents/skills/add-test-case/add-row.mjs \
 *     --app "my-cli" --ecosystem python \
 *     --lang Python --in-github "github.com/owner/my-cli" \
 *     --in-pip "pypi.org/project/my-cli" \
 *     --is-tui-app --has-source-dist \
 *     --notes "TUI tool; MIT; v1.2.3; 500 stars; in HB; pip-package"
 *
 *   # Tauri 2 cask — append after a specific row
 *   node .agents/skills/add-test-case/add-row.mjs \
 *     --app "MyApp" --after-app "KnowNote" \
 *     --lang TypeScript --framework "Tauri 2" \
 *     --in-github "github.com/owner/myapp" \
 *     --is-gui-app --is-cask-dist "MyApp-1.0.0-aarch64.dmg" \
 *     --has-source-dist --has-prebuilt-bin "yes (4)" \
 *     --notes "agent manager; Apache-2.0; v1.0.0; 1k stars; not in HB; cask-app-release"
 *
 *   # Dry-run — preview without writing
 *   node .agents/skills/add-test-case/add-row.mjs \
 *     --app "preview-app" --ecosystem cask --dry-run \
 *     --lang Rust --in-github "github.com/owner/preview-app" \
 *     --is-gui-app --is-cask-dist "PreviewApp-0.1.0-aarch64.dmg"
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// md-spreadsheet-parser lives in the repo root node_modules.
// This script is at <repo>/.agents/skills/add-test-case/add-row.mjs
// so the repo root is three levels up.
const REPO_ROOT   = resolve(__dirname, "../../..");
const parserPath  = resolve(REPO_ROOT, "node_modules/md-spreadsheet-parser/dist/index.js");

const { scanTables } = await import(parserPath);

// ---------------------------------------------------------------------------
// Tiny argument parser (no external deps)
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

const flag = (name) => args.includes(name);

const opt = (name, fallback = "") => {
  const i = args.indexOf(name);
  return (i !== -1 && i + 1 < args.length) ? args[i + 1] : fallback;
};

// ---------------------------------------------------------------------------
// --help
// ---------------------------------------------------------------------------
if (flag("--help") || flag("-h")) {
  const src   = readFileSync(__filename, "utf-8");
  const lines = src.split("\n");
  const help  = [];
  let inside  = false;
  for (const line of lines) {
    if (!inside && line.startsWith(" * ")) { inside = true; }
    if (inside) {
      if (line === " */") break;
      help.push(line.replace(/^ \* ?/, ""));
    }
  }
  console.log(help.join("\n"));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Required arg
// ---------------------------------------------------------------------------
const appName = opt("--app");
if (!appName) {
  console.error("ERROR: --app <name> is required. Run with --help for usage.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
const ecosystem = opt("--ecosystem");
const afterApp  = opt("--after-app");
const dryRun    = flag("--dry-run");

const defaultTable = resolve(REPO_ROOT, ".agents/plans/allbrew-test-cases.md");
const tableFile    = opt("--table-file", defaultTable);

// ---------------------------------------------------------------------------
// Column values — map CLI flags → column names
// ---------------------------------------------------------------------------
const VALID_ECOSYSTEMS = ["python", "node", "ruby", "rust", "go", "swift", "dotnet", "cask", "other"];

const colValues = {
  "app":                   appName,
  "lang/runtime":          opt("--lang"),
  "framework":             opt("--framework"),
  "in_dev_website":        opt("--in-dev-website"),
  "in_github":             opt("--in-github"),
  "in_homebrew":           opt("--in-homebrew"),
  "in_setapp":             opt("--in-setapp"),
  "in_mas":                opt("--in-mas"),
  "in_npm":                opt("--in-npm"),
  "in_pip":                opt("--in-pip"),
  "in_cargo":              opt("--in-cargo"),
  "in_go_mod":             opt("--in-go-mod"),
  "in_ruby_gem":           opt("--in-ruby-gem"),
  "in_swiftpm":            opt("--in-swiftpm"),
  "in_mint":               opt("--in-mint"),
  "in_dotnet":             opt("--in-dotnet"),
  "is_tui_app":            flag("--is-tui-app")       ? "yes" : "",
  "is_gui_app":            flag("--is-gui-app")       ? "yes" : "",
  "is_webui_app":          flag("--is-webui-app")     ? "yes" : "",
  "is_cask_dist":          opt("--is-cask-dist"),
  "has_source_dist":       flag("--has-source-dist")  ? "yes" : "",
  "has_prebuilt_bin_dist": opt("--has-prebuilt-bin"),
  "has_script_install":    flag("--has-script-install") ? "yes" : "",
  "notes":                 opt("--notes"),
};

// ---------------------------------------------------------------------------
// Classify a row's ecosystem from its column values
// ---------------------------------------------------------------------------
function rowEcosystem(row, headers) {
  const get = (col) => (row[headers.indexOf(col)] ?? "").toLowerCase();
  const lang = get("lang/runtime");
  if (get("in_pip")      || lang.includes("python"))                     return "python";
  if (get("in_ruby_gem") || lang.includes("ruby"))                       return "ruby";
  if (get("in_npm")      || lang.includes("node") || lang.includes("javascript")) return "node";
  if (get("in_cargo")    || lang.includes("rust"))                       return "rust";
  if (get("in_go_mod")   || lang.includes("go"))                         return "go";
  if (get("in_swiftpm")  || get("in_mint") || lang.includes("swift"))    return "swift";
  if (get("in_dotnet")   || lang.includes(".net") || lang.includes("csharp")) return "dotnet";
  if (get("is_cask_dist"))                                               return "cask";
  return "other";
}

// Returns true for real app rows; false for provenance notes, section headers, etc.
function isAppRow(row) {
  const app = (row[0] ?? "").trim();
  if (!app) return false;
  if (app.startsWith("**") || app.startsWith("#") || app.startsWith("-") ||
      app.startsWith("---") || app === "app") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Load and parse the table
// ---------------------------------------------------------------------------
const fileContent = readFileSync(tableFile, "utf-8");
const tables = scanTables(fileContent);
const table  = tables[0];

if (!table?.headers?.length) {
  console.error("ERROR: Could not locate the main table in", tableFile);
  process.exit(1);
}

const headers = table.headers;

// Validate that every colValues key matches an actual header
for (const key of Object.keys(colValues)) {
  if (!headers.includes(key)) {
    console.error(`ERROR: column "${key}" not found. Table headers:\n  ${headers.join(", ")}`);
    process.exit(1);
  }
}

// Build the full row array (one entry per header; blank for unspecified columns)
const newRow = headers.map((col) => colValues[col] ?? "");

// ---------------------------------------------------------------------------
// Determine insert position
// ---------------------------------------------------------------------------
let insertAt = -1;
let insertReason = "";

if (afterApp) {
  const idx = table.rows.findIndex((r) => r[0] === afterApp);
  if (idx === -1) {
    console.error(`ERROR: No row found with app="${afterApp}".`);
    process.exit(1);
  }
  insertAt     = idx + 1;
  insertReason = `after "${afterApp}" (row ${idx})`;

} else if (ecosystem) {
  const ecoKey = ecosystem.toLowerCase();
  if (!VALID_ECOSYSTEMS.includes(ecoKey)) {
    console.error(`ERROR: Unknown ecosystem "${ecosystem}". Valid: ${VALID_ECOSYSTEMS.join(", ")}`);
    process.exit(1);
  }

  let lastEcoIdx = -1;
  for (let i = 0; i < table.rows.length; i++) {
    if (isAppRow(table.rows[i]) && rowEcosystem(table.rows[i], headers) === ecoKey) {
      lastEcoIdx = i;
    }
  }

  if (lastEcoIdx === -1) {
    console.warn(`WARN: No rows found for ecosystem "${ecoKey}" — falling back to --at-end.`);
  } else {
    insertAt     = lastEcoIdx + 1;
    insertReason = `after last "${ecoKey}" row: "${table.rows[lastEcoIdx][0]}" (row ${lastEcoIdx})`;
  }
}

if (insertAt === -1) {
  // Default: after the last real app row, before trailing markers
  let lastAppIdx = -1;
  for (let i = 0; i < table.rows.length; i++) {
    if (isAppRow(table.rows[i])) lastAppIdx = i;
  }
  insertAt     = lastAppIdx + 1;
  insertReason = `after last app row: "${table.rows[lastAppIdx]?.[0]}" (row ${lastAppIdx})`;
}

// ---------------------------------------------------------------------------
// Warn on duplicate
// ---------------------------------------------------------------------------
const dupIdx = table.rows.findIndex((r) => r[0] === appName);
if (dupIdx !== -1) {
  console.warn(`WARN: app="${appName}" already exists at row ${dupIdx}. Inserting anyway — remove the duplicate if unintended.`);
}

// ---------------------------------------------------------------------------
// Dry-run: just show what would happen
// ---------------------------------------------------------------------------
if (dryRun) {
  console.log(`\nDRY RUN — would insert "${appName}" ${insertReason}\n`);
  const populated = headers.map((col, i) => [col, newRow[i]]).filter(([, v]) => v !== "");
  const maxLen    = Math.max(...populated.map(([col]) => col.length));
  for (const [col, val] of populated) {
    console.log(`  ${col.padEnd(maxLen)}  ${val}`);
  }
  console.log("\nNo file written.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Mutate the table and write
// ---------------------------------------------------------------------------
table.insertRow(insertAt);
for (let i = 0; i < headers.length; i++) {
  if (newRow[i] !== "") table.updateCell(insertAt, i, newRow[i]);
}

const srcLines = fileContent.split("\n");

// Render the updated table.
// When startLine === 0 the parser has absorbed a title line (e.g. "# Heading")
// that sits immediately before the GFM table with no blank separator.
// toMarkdown() re-emits it as a table row: "| # Heading | | | ...|".
// We strip that row and prepend it as a standalone line so the file stays valid.
let renderedTable = table.toMarkdown();
let titlePrefix = "";
if (table.startLine === 0) {
  const titleRow = srcLines[0];
  if (titleRow && !titleRow.startsWith("|") && !titleRow.startsWith("#|")) {
    // Strip the escaped title row from the rendered markdown
    const escapedTitle = titleRow.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    renderedTable = renderedTable
      .split("\n")
      .filter(l => !new RegExp(`^\\|\\s*${escapedTitle}`).test(l))
      .join("\n");
    titlePrefix = titleRow + "\n";
  }
}

// Content before the table (empty when startLine === 0)
const before = table.startLine > 1
  ? srcLines.slice(0, table.startLine - 1).join("\n") + "\n"
  : "";

// Content after the table — only the FIRST non-table block that immediately
// follows; stop before any subsequent table header to avoid re-attaching
// duplicate table copies that may exist in the file.
const rawAfterLines = srcLines.slice(table.endLine);
const nextTableHeader = rawAfterLines.findIndex(l => l.trimStart().startsWith("| app |"));
const afterLines = nextTableHeader !== -1
  ? rawAfterLines.slice(0, nextTableHeader)
  : rawAfterLines;
const after = afterLines.join("\n");

writeFileSync(tableFile, before + titlePrefix + renderedTable + after, "utf-8");
console.log(`Inserted "${appName}" ${insertReason} → ${tableFile}`);
