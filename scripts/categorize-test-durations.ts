#!/usr/bin/env bun
/**
 * Parse macos-test-harness / bun test-output logs and bucket individual tests
 * by wall-clock duration.
 *
 * Usage:
 *   bun run scripts/categorize-test-durations.ts
 *   bun run scripts/categorize-test-durations.ts tests/e2e-runs/latest/test-output.log
 *   bun run scripts/categorize-test-durations.ts --fast-ms 30000 --slow-ms 120000 --json
 *   bun run scripts/categorize-test-durations.ts --status fail --top 40
 *
 * Defaults:
 *   - Input: tests/e2e-runs/latest/test-output.log (falls back to newest run dir)
 *   - fast:  < 30s
 *   - medium: 30s–120s (inclusive lower bound of slow is exclusive of medium)
 *   - slow:  >= 120s
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

type Status = "pass" | "fail" | "skip" | "todo" | "unknown";
type Bucket = "fast" | "medium" | "slow";

type TestResult = {
  status: Status;
  name: string;
  durationMs: number;
  line: number;
  section: string | null;
};

type Options = {
  paths: string[];
  fastMs: number;
  slowMs: number;
  json: boolean;
  top: number | null;
  statusFilter: Set<Status> | null;
  includeSkip: boolean;
  csv: boolean;
};

const RESULT_RE =
  /^\((pass|fail|skip|todo)\)\s+(.+?)\s+\[(\d+(?:\.\d+)?)ms\]\s*$/;
const SECTION_RE = /^---\s+(.+?)\s+---\s*$/;
const SUITE_RE =
  /^(\d+)\s+pass(?:,\s*(\d+)\s+skip)?(?:,\s*(\d+)\s+fail)?(?:,\s*(\d+)\s+error(?:s)?)?\s*$/i;
const RAN_RE = /^Ran\s+(\d+)\s+tests?\s+across\s+(\d+)\s+files?\.\s+\[(\d+(?:\.\d+)?)s\]\s*$/i;

function printHelp(): void {
  console.log(`Usage: bun run scripts/categorize-test-durations.ts [options] [log...]

Parse bun/macos-test-harness test-output.log files and categorize tests by duration.

Options:
  --fast-ms <n>     Max duration (ms) for the fast bucket (default: 30000)
  --slow-ms <n>     Min duration (ms) for the slow bucket (default: 120000)
  --top <n>         Show only the N slowest tests overall (still bucketed)
  --status <list>   Comma list: pass,fail,skip,todo (default: all)
  --include-skip    Include skip results (default: yes if --status includes skip)
  --no-skip         Exclude skip results
  --json            Emit JSON instead of a human table
  --csv             Emit CSV (status,bucket,duration_ms,duration_s,section,name)
  --help            Show this help

If no log paths are given, uses tests/e2e-runs/latest/test-output.log when present,
otherwise the newest tests/e2e-runs/<timestamp>/test-output.log.
`);
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    paths: [],
    fastMs: 30_000,
    slowMs: 120_000,
    json: false,
    top: null,
    statusFilter: null,
    includeSkip: true,
    csv: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
    if (a === "--json") {
      opts.json = true;
      continue;
    }
    if (a === "--csv") {
      opts.csv = true;
      continue;
    }
    if (a === "--no-skip") {
      opts.includeSkip = false;
      continue;
    }
    if (a === "--include-skip") {
      opts.includeSkip = true;
      continue;
    }
    if (a === "--fast-ms") {
      opts.fastMs = Number(argv[++i]);
      continue;
    }
    if (a === "--slow-ms") {
      opts.slowMs = Number(argv[++i]);
      continue;
    }
    if (a === "--top") {
      opts.top = Number(argv[++i]);
      continue;
    }
    if (a === "--status") {
      const raw = String(argv[++i] ?? "");
      const parts = raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean) as Status[];
      opts.statusFilter = new Set(parts);
      continue;
    }
    if (a.startsWith("-")) {
      console.error(`Unknown option: ${a}`);
      printHelp();
      process.exit(2);
    }
    opts.paths.push(a);
  }

  if (!(opts.fastMs > 0) || !(opts.slowMs > opts.fastMs)) {
    console.error("--fast-ms must be > 0 and --slow-ms must be > --fast-ms");
    process.exit(2);
  }
  if (opts.top != null && (!(opts.top > 0) || !Number.isFinite(opts.top))) {
    console.error("--top must be a positive number");
    process.exit(2);
  }

  return opts;
}

function resolveDefaultLogPaths(cwd: string): string[] {
  const runsDir = join(cwd, "tests/e2e-runs");
  const latestLink = join(runsDir, "latest/test-output.log");
  if (existsSync(latestLink)) return [latestLink];

  if (!existsSync(runsDir)) {
    console.error(`No log path given and ${runsDir} does not exist`);
    process.exit(2);
  }

  const candidates = readdirSync(runsDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name))
    .map((name) => {
      const logPath = join(runsDir, name, "test-output.log");
      return {
        logPath,
        mtime: existsSync(logPath) ? statSync(logPath).mtimeMs : 0,
      };
    })
    .filter((c) => c.mtime > 0)
    .sort((a, b) => b.mtime - a.mtime);

  if (candidates.length === 0) {
    console.error(`No test-output.log files found under ${runsDir}`);
    process.exit(2);
  }
  return [candidates[0].logPath];
}

function parseLog(text: string, source: string): {
  results: TestResult[];
  suiteSummaries: { source: string; line: number; text: string }[];
} {
  const results: TestResult[] = [];
  const suiteSummaries: { source: string; line: number; text: string }[] = [];
  let section: string | null = source;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    const ranMatch = line.match(RAN_RE);
    if (ranMatch) {
      suiteSummaries.push({ source, line: lineNo, text: line.trim() });
      continue;
    }
    if (SUITE_RE.test(line.trim())) {
      suiteSummaries.push({ source, line: lineNo, text: line.trim() });
      continue;
    }

    const m = line.match(RESULT_RE);
    if (!m) continue;

    results.push({
      status: m[1] as Status,
      name: m[2].trim(),
      durationMs: Number(m[3]),
      line: lineNo,
      section,
    });
  }

  return { results, suiteSummaries };
}

function bucketFor(ms: number, fastMs: number, slowMs: number): Bucket {
  if (ms < fastMs) return "fast";
  if (ms < slowMs) return "medium";
  return "slow";
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : 0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = (ms % 60_000) / 1000;
  return `${mins}m${secs.toFixed(0).padStart(2, "0")}s`;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const paths = (opts.paths.length ? opts.paths : resolveDefaultLogPaths(cwd)).map((p) =>
    resolve(cwd, p),
  );

  const allResults: (TestResult & { source: string; bucket: Bucket })[] = [];
  const allSummaries: { source: string; line: number; text: string }[] = [];

  for (const path of paths) {
    if (!existsSync(path)) {
      console.error(`Log not found: ${path}`);
      process.exit(2);
    }
    const text = readFileSync(path, "utf8");
    const { results, suiteSummaries } = parseLog(text, path);
    allSummaries.push(...suiteSummaries);
    for (const r of results) {
      allResults.push({
        ...r,
        source: path,
        bucket: bucketFor(r.durationMs, opts.fastMs, opts.slowMs),
      });
    }
  }

  let filtered = allResults.filter((r) => {
    if (!opts.includeSkip && r.status === "skip") return false;
    if (opts.statusFilter && !opts.statusFilter.has(r.status)) return false;
    return true;
  });

  filtered.sort((a, b) => b.durationMs - a.durationMs);
  if (opts.top != null) filtered = filtered.slice(0, opts.top);

  const byBucket: Record<Bucket, typeof filtered> = {
    fast: filtered.filter((r) => r.bucket === "fast"),
    medium: filtered.filter((r) => r.bucket === "medium"),
    slow: filtered.filter((r) => r.bucket === "slow"),
  };

  const totals = {
    count: filtered.length,
    durationMs: filtered.reduce((s, r) => s + r.durationMs, 0),
    fastMs: opts.fastMs,
    slowMs: opts.slowMs,
    paths,
    buckets: {
      fast: {
        count: byBucket.fast.length,
        durationMs: byBucket.fast.reduce((s, r) => s + r.durationMs, 0),
      },
      medium: {
        count: byBucket.medium.length,
        durationMs: byBucket.medium.reduce((s, r) => s + r.durationMs, 0),
      },
      slow: {
        count: byBucket.slow.length,
        durationMs: byBucket.slow.reduce((s, r) => s + r.durationMs, 0),
      },
    },
    suiteSummaries: allSummaries,
    results: filtered,
  };

  if (opts.json) {
    console.log(JSON.stringify(totals, null, 2));
    return;
  }

  if (opts.csv) {
    console.log("status,bucket,duration_ms,duration_s,section,name,source,line");
    for (const r of filtered) {
      console.log(
        [
          r.status,
          r.bucket,
          r.durationMs.toFixed(2),
          (r.durationMs / 1000).toFixed(3),
          csvEscape(r.section ?? ""),
          csvEscape(r.name),
          csvEscape(r.source),
          String(r.line),
        ].join(","),
      );
    }
    return;
  }

  console.log("Test duration buckets");
  console.log(`  logs:     ${paths.join(", ")}`);
  console.log(
    `  thresholds: fast < ${fmtMs(opts.fastMs)} <= medium < ${fmtMs(opts.slowMs)} <= slow`,
  );
  console.log(
    `  totals:   ${totals.count} tests, wall-sum ${fmtMs(totals.durationMs)} (sum of reported durations; concurrent runs overlap)`,
  );
  for (const bucket of ["fast", "medium", "slow"] as Bucket[]) {
    const b = totals.buckets[bucket];
    console.log(
      `  ${bucket.padEnd(6)}  ${String(b.count).padStart(4)} tests  sum ${fmtMs(b.durationMs)}`,
    );
  }

  if (allSummaries.length) {
    console.log("\nSuite summaries:");
    for (const s of allSummaries.slice(-12)) {
      console.log(`  ${s.text}`);
    }
  }

  for (const bucket of ["slow", "medium", "fast"] as Bucket[]) {
    const rows = byBucket[bucket];
    if (!rows.length) continue;
    console.log(`\n## ${bucket} (${rows.length})`);
    for (const r of rows) {
      const st = r.status.padEnd(4);
      const dur = fmtMs(r.durationMs).padStart(8);
      const sec = r.section ? `[${r.section}] ` : "";
      console.log(`  ${st} ${dur}  ${sec}${r.name}`);
    }
  }

  if (!filtered.length) {
    console.log("\nNo matching test result lines found.");
    console.log(
      "Expected bun lines like: (pass) suite > test name [1234.56ms]",
    );
    process.exitCode = 1;
  }
}

main();
