#!/usr/bin/env bun
/**
 * Create a monitored-install run directory under tests/monitored-install-runs/.
 * Usage:
 *   bun .agents/skills/monitored-install/scripts/init-run-record.mjs \
 *     --url <url> [--slug <name>] [--allbrew-bin <path>] [--repo-root <path>]
 * Prints: RUN_DIR=...
 *         RUN_ID=...
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function arg(flag, fallback = "") {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function slugify(s) {
  return (
    String(s || "pkg")
      .toLowerCase()
      .replace(/https?:\/\//g, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "pkg"
  );
}

function isoStamp(d = new Date()) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

function cmdOut(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) return "";
  return (r.stdout || "").trim();
}

function findRepoRoot(start) {
  let dir = resolve(start);
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "lib"))) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        if (pkg.name === "allbrew") return dir;
      } catch {
        /* continue */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}

const url = arg("--url");
if (!url) {
  console.error("--url is required");
  process.exit(2);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(arg("--repo-root") || findRepoRoot(join(scriptDir, "../../../..")));
const runsRoot = join(repoRoot, "tests/monitored-install-runs");
const slug = slugify(arg("--slug") || url.split("/").filter(Boolean).pop());
const startedAt = new Date();
const runId = `${isoStamp(startedAt)}__${slug}`;
const runDir = join(runsRoot, runId);
const allbrewBin = arg("--allbrew-bin", "/opt/homebrew/bin/allbrew");

mkdirSync(runDir, { recursive: true });

const allbrewVersion = existsSync(allbrewBin)
  ? cmdOut(allbrewBin, ["--version"])
  : cmdOut("allbrew", ["--version"]);
const sourceGitSha = cmdOut("git", ["-C", repoRoot, "rev-parse", "HEAD"]);
const brewPrefix = cmdOut("brew", ["--prefix"]);
const brewVersion = cmdOut("brew", ["--version"]);
const nodeVersion = cmdOut("node", ["-v"]);
const bunVersion = cmdOut("bun", ["-v"]);
const arch = cmdOut("uname", ["-m"]);
const os = `${cmdOut("uname", ["-s"])} ${cmdOut("uname", ["-r"])}`.trim();
const swVers = cmdOut("sw_vers", []);
const productName = (swVers.match(/ProductName:\s*(.+)/) || [])[1] || "";
const productVersion = (swVers.match(/ProductVersion:\s*(.+)/) || [])[1] || "";
const buildVersion = (swVers.match(/BuildVersion:\s*(.+)/) || [])[1] || "";

let brewConfigJson = null;
try {
  const raw = cmdOut("brew", ["config", "--json"]);
  if (raw) {
    const parsed = JSON.parse(raw);
    const conf = Array.isArray(parsed) ? parsed[0] : parsed;
    if (conf && typeof conf === "object") {
      brewConfigJson = {};
      for (const [k, v] of Object.entries(conf)) {
        if (/token|secret|password|key|auth/i.test(k)) {
          brewConfigJson[k] = "[REDACTED]";
        } else {
          brewConfigJson[k] = v;
        }
      }
    }
  }
} catch {
  /* ignore malformed brew config */
}

const brewFormulae = cmdOut("brew", ["list", "--formula"])
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, 100);
const brewCasks = cmdOut("brew", ["list", "--cask"])
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, 100);

let tapPath = "";
try {
  const cfgPath = join(process.env.HOME || "", ".config/allbrew/config.json");
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    tapPath = cfg.tapPath || "";
  }
} catch {
  /* ignore */
}

const metadata = {
  schemaVersion: 1,
  runId,
  startedAt: startedAt.toISOString(),
  finishedAt: null,
  url,
  slug,
  host: {
    os,
    arch,
    node: nodeVersion,
    bun: bunVersion,
    brewPrefix,
    productName,
    productVersion,
    buildVersion,
  },
  homebrew: {
    version: brewVersion ? brewVersion.split(/\r?\n/)[0] : null,
    prefix: brewPrefix,
    config: brewConfigJson,
    formulae: brewFormulae,
    casks: brewCasks,
  },
  allbrew: {
    binary: allbrewBin,
    versionInitial: allbrewVersion,
    versionFinal: null,
    tapPath,
    sourceGitSha,
  },
  attempts: [],
  release: null,
  files: {
    metadata: "metadata.json",
    agentJudgment: "agent-judgment.json",
    outcome: "outcome.json",
    summary: "summary.md",
  },
};

writeFileSync(join(runDir, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n");

const judgmentStub = {
  schemaVersion: 1,
  url,
  inputShape: {
    kind: null,
    host: null,
    owner: null,
    repo: null,
    hints: [],
  },
  expected: {
    strategy: null,
    generator: null,
    packageName: null,
    formulaName: slug,
    binName: slug,
    service: null,
    serviceCommand: null,
    allbrewArgs: [],
    rationale: "",
  },
  codebaseObserved: {
    strategy: null,
    generator: null,
    packageNameDetected: null,
    packageNameUsed: null,
    serviceDetected: null,
    serviceCommand: null,
    formulaPath: null,
    logSignals: [],
  },
  deltas: [],
  proposedRule: null,
  notes: "",
};
writeFileSync(join(runDir, "agent-judgment.json"), JSON.stringify(judgmentStub, null, 2) + "\n");

writeFileSync(
  join(runDir, "summary.md"),
  `# Monitored install: ${slug}\n\n- URL: ${url}\n- Run ID: ${runId}\n- Started: ${startedAt.toISOString()}\n\n## Agent thought process\n\n(fill during run)\n\n## Outcome\n\n(pending)\n`,
);

console.log(`RUN_DIR=${runDir}`);
console.log(`RUN_ID=${runId}`);
