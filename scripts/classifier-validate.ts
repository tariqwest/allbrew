#!/usr/bin/env bun
/**
 * Classifier multi-URL validation harness.
 *
 * Materializes locations from the test-cases table + seed URLs, runs
 * classify (optional classifyWithHead), diffs against:
 *   1. manual ground truth (column + URL shape + curated overrides)
 *   2. the rule oracle (re-implements classify regexes — drift detector)
 *   3. optional agent judgments (bootstrap or curated)
 * and writes results.json + summary.md.
 *
 * Usage:
 *   bun run scripts/classifier-validate.ts
 *   bun run scripts/classifier-validate.ts --head
 *   bun run scripts/classifier-validate.ts --limit 20 --only-column in_npm
 *   bun run scripts/classifier-validate.ts --write-agent-judgments
 *   bun run scripts/classifier-validate.ts --fail-on-ground-truth
 *
 * --write-agent-judgments seeds missing judgment entries from the rule oracle
 * (bootstrap). Prefer ground-truth-overrides.json for true manual expectations.
 * Never treats catalog generators as classifier expected types.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, classifyWithHead } from "../lib/classifier.ts";
import {
  DEFAULT_TEST_CASES_TABLE,
  materializeFromTable,
  materializeSeeds,
  type MaterializedLocation,
  type SeedUrl,
} from "../tests/helpers/test-case-locations.ts";
import {
  oracleClassify,
  type OracleResult,
} from "../tests/helpers/classifier-oracle.ts";
import {
  expectedClassifierType,
  loadGroundTruthOverrides,
  type GroundTruthExpectation,
  type GroundTruthOverridesFile,
} from "../tests/helpers/classifier-ground-truth.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const DEFAULT_OUT = resolve(
  REPO_ROOT,
  "tests/fixtures/classifier-validation",
);
const DEFAULT_SEEDS = resolve(DEFAULT_OUT, "seed-urls.json");
const DEFAULT_JUDGMENTS = resolve(DEFAULT_OUT, "agent-judgments.json");
const DEFAULT_GT_OVERRIDES = resolve(
  DEFAULT_OUT,
  "ground-truth-overrides.json",
);

type AgentJudgment = {
  expected_type: string;
  expected_fields?: Record<string, string>;
  confidence?: "high" | "medium" | "low";
  rationale?: string;
  source?: string;
};

type AgentJudgmentsFile = {
  version: number;
  description?: string;
  updated_at: string | null;
  judgments: Record<string, AgentJudgment>;
};

type ResultRecord = {
  app: string;
  source_column: string;
  raw_cell: string;
  url: string;
  seed_name?: string;
  mode: "classify" | "classifyWithHead";
  classifier: Record<string, unknown>;
  ground_truth: GroundTruthExpectation;
  ground_truth_agree: boolean;
  oracle: OracleResult;
  oracle_agree: boolean;
  agent: AgentJudgment | null;
  agent_agree: boolean | null;
};

function parseArgs(argv: string[]) {
  const flag = (name: string) => argv.includes(name);
  const opt = (name: string, fallback = ""): string => {
    const i = argv.indexOf(name);
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : fallback;
  };
  return {
    help: flag("--help") || flag("-h"),
    head: flag("--head"),
    headAll: flag("--head-all"),
    table: opt("--table", DEFAULT_TEST_CASES_TABLE),
    out: opt("--out", DEFAULT_OUT),
    seeds: opt("--seeds", DEFAULT_SEEDS),
    judgments: opt("--judgments", DEFAULT_JUDGMENTS),
    gtOverrides: opt("--ground-truth-overrides", DEFAULT_GT_OVERRIDES),
    limit: Number(opt("--limit", "0")) || 0,
    onlyColumn: opt("--only-column", ""),
    noSeeds: flag("--no-seeds"),
    writeAgentJudgments: flag("--write-agent-judgments"),
    failOnOracle: flag("--fail-on-oracle"),
    failOnGroundTruth: flag("--fail-on-ground-truth"),
  };
}

function printHelp() {
  console.log(`classifier-validate — multi-URL classifier validation harness

Options:
  --table <path>                 Test-cases markdown (default: .agents/plans/allbrew-test-cases.md)
  --out <dir>                    Output directory (default: tests/fixtures/classifier-validation)
  --seeds <path>                 Seed URL JSON (default: <out>/seed-urls.json)
  --judgments <path>             Agent judgments JSON (default: <out>/agent-judgments.json)
  --ground-truth-overrides <path> Manual GT overrides JSON (default: <out>/ground-truth-overrides.json)
  --only-column <col>            Restrict to one location column (e.g. in_npm)
  --limit <n>                    Cap number of locations after filters
  --head                         classifyWithHead for classifier type === unknown
  --head-all                     classifyWithHead for every URL (network-heavy)
  --no-seeds                     Skip seed-urls.json
  --write-agent-judgments        Bootstrap missing judgments from rule oracle
  --fail-on-oracle               Exit 1 if any classifier vs oracle type mismatch
  --fail-on-ground-truth         Exit 1 if any classifier vs manual ground-truth mismatch
  -h, --help                     Show help
`);
}

function loadJudgments(path: string): AgentJudgmentsFile {
  if (!existsSync(path)) {
    return {
      version: 1,
      description: "agent judgments",
      updated_at: null,
      judgments: {},
    };
  }
  return JSON.parse(readFileSync(path, "utf-8")) as AgentJudgmentsFile;
}

function loadSeeds(path: string): SeedUrl[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8")) as SeedUrl[];
}

function countBy<T>(items: T[], keyFn: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = keyFn(item);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function buildSummary(opts: {
  records: ResultRecord[];
  skipped: { skip_reason: string }[];
  head: boolean;
  headAll: boolean;
}): string {
  const { records, skipped, head, headAll } = opts;
  const byCol = countBy(records, (r) => r.source_column);
  const byType = countBy(records, (r) => String(r.classifier.type));
  const byGtBasis = countBy(records, (r) => r.ground_truth.basis);
  const gtAgree = records.filter((r) => r.ground_truth_agree).length;
  const gtDisagree = records.filter((r) => !r.ground_truth_agree);
  const gtDisagreeByCol = countBy(gtDisagree, (r) => r.source_column);
  const oracleAgree = records.filter((r) => r.oracle_agree).length;
  const oracleDisagree = records.filter((r) => !r.oracle_agree);
  const withAgent = records.filter((r) => r.agent);
  const agentAgree = withAgent.filter((r) => r.agent_agree).length;
  const agentDisagree = withAgent.filter((r) => r.agent_agree === false);
  const skipBy = countBy(skipped, (s) => s.skip_reason);

  const lines: string[] = [];
  lines.push("# Classifier validation summary");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(
    `Mode: ${headAll ? "classifyWithHead (all)" : head ? "classify + HEAD on unknown" : "classify (offline)"}`,
  );
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- Locations classified: **${records.length}**`);
  lines.push(`- Skipped cells: **${skipped.length}**`);
  lines.push(
    `- Classifier vs **manual ground truth**: **${gtAgree}** agree / **${gtDisagree.length}** disagree`,
  );
  lines.push(
    `- Classifier vs rule oracle: **${oracleAgree}** agree / **${oracleDisagree.length}** disagree`,
  );
  lines.push(
    `- Classifier vs agent: **${agentAgree}** agree / **${agentDisagree.length}** disagree / **${records.length - withAgent.length}** no judgment`,
  );
  lines.push("");
  lines.push("## Ground-truth basis mix");
  lines.push("");
  for (const [k, n] of Object.entries(byGtBasis).sort((a, b) => b[1] - a[1])) {
    lines.push(`- \`${k}\`: ${n}`);
  }
  lines.push("");
  lines.push("## By source column");
  lines.push("");
  for (const [k, n] of Object.entries(byCol).sort((a, b) => b[1] - a[1])) {
    lines.push(`- \`${k}\`: ${n}`);
  }
  lines.push("");
  lines.push("## By classifier type");
  lines.push("");
  for (const [k, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    lines.push(`- \`${k}\`: ${n}`);
  }
  lines.push("");
  lines.push("## Skips by reason");
  lines.push("");
  if (Object.keys(skipBy).length === 0) {
    lines.push("_none_");
  } else {
    for (const [k, n] of Object.entries(skipBy).sort((a, b) => b[1] - a[1])) {
      lines.push(`- \`${k}\`: ${n}`);
    }
  }
  lines.push("");
  lines.push(
    "## Ground-truth mismatches (classifier type ≠ manual expected type)",
  );
  lines.push("");
  if (gtDisagree.length === 0) {
    lines.push("_none_");
  } else {
    lines.push("By column:");
    lines.push("");
    for (const [k, n] of Object.entries(gtDisagreeByCol).sort(
      (a, b) => b[1] - a[1],
    )) {
      lines.push(`- \`${k}\`: ${n}`);
    }
    lines.push("");
    for (const r of gtDisagree.slice(0, 60)) {
      lines.push(
        `- **${r.app}** [\`${r.source_column}\`] \`${r.url}\` → classifier=\`${r.classifier.type}\` ground_truth=\`${r.ground_truth.expected_type}\` (${r.ground_truth.basis}: ${r.ground_truth.rationale})`,
      );
    }
    if (gtDisagree.length > 60) {
      lines.push(`- _…and ${gtDisagree.length - 60} more_`);
    }
  }
  lines.push("");
  lines.push("## Oracle mismatches (classifier type ≠ oracle type)");
  lines.push("");
  if (oracleDisagree.length === 0) {
    lines.push("_none_");
  } else {
    for (const r of oracleDisagree.slice(0, 40)) {
      lines.push(
        `- **${r.app}** [\`${r.source_column}\`] \`${r.url}\` → classifier=\`${r.classifier.type}\` oracle=\`${r.oracle.type}\``,
      );
    }
    if (oracleDisagree.length > 40) {
      lines.push(`- _…and ${oracleDisagree.length - 40} more_`);
    }
  }
  lines.push("");
  lines.push("## Agent mismatches");
  lines.push("");
  if (agentDisagree.length === 0) {
    lines.push(
      withAgent.length === 0
        ? "_no agent judgments loaded — run with --write-agent-judgments to bootstrap, or fill agent-judgments.json_"
        : "_none_",
    );
  } else {
    for (const r of agentDisagree.slice(0, 40)) {
      lines.push(
        `- **${r.app}** [\`${r.source_column}\`] \`${r.url}\` → classifier=\`${r.classifier.type}\` agent=\`${r.agent?.expected_type}\`${r.agent?.rationale ? ` — ${r.agent.rationale}` : ""}`,
      );
    }
    if (agentDisagree.length > 40) {
      lines.push(`- _…and ${agentDisagree.length - 40} more_`);
    }
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- **Manual ground truth** = column priors + URL-shape + `ground-truth-overrides.json`. It is independent of the rule oracle.",
  );
  lines.push(
    "- This harness scores **classifier strategy** only (`github-repo`, `npm-package`, …), not generator selection (`binary-release`, `cask-app-release`, …).",
  );
  lines.push(
    "- `in_go_mod` / GitHub-shaped `in_cargo` cells correctly classify as `github-repo`.",
  );
  lines.push(
    "- `has_script_install` extensionless hosts (e.g. rustup) are expected `bash-script` by ground truth; offline `classify` may still return `unknown` until HEAD or host allowlists land.",
  );
  lines.push(
    "- `in_dev_website` bare domains typically classify as `unknown` without `--head` / discovery.",
  );
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  mkdirSync(args.out, { recursive: true });

  console.log(`Materializing locations from ${args.table}...`);
  const { locations: tableLocs, skipped } = await materializeFromTable(
    args.table,
  );

  let locations: MaterializedLocation[] = [...tableLocs];
  if (!args.noSeeds) {
    const seeds = loadSeeds(args.seeds);
    locations.push(...materializeSeeds(seeds));
  }

  if (args.onlyColumn) {
    locations = locations.filter((l) => l.source_column === args.onlyColumn);
  }
  if (args.limit > 0) {
    locations = locations.slice(0, args.limit);
  }

  console.log(
    `Classifying ${locations.length} URLs (${skipped.length} skipped cells)...`,
  );

  const gtOverrides: GroundTruthOverridesFile = loadGroundTruthOverrides(
    args.gtOverrides,
  );
  console.log(
    `Ground-truth overrides: ${Object.keys(gtOverrides.overrides).length} URL(s)`,
  );

  let judgmentsFile = loadJudgments(args.judgments);
  if (args.writeAgentJudgments) {
    let added = 0;
    for (const loc of locations) {
      if (judgmentsFile.judgments[loc.url]) continue;
      const o = oracleClassify(loc.url);
      const fields: Record<string, string> = {};
      for (const k of [
        "owner",
        "repo",
        "packageName",
        "gemName",
        "crateName",
        "slug",
      ] as const) {
        if (o[k]) fields[k] = String(o[k]);
      }
      judgmentsFile.judgments[loc.url] = {
        expected_type: o.type,
        expected_fields: Object.keys(fields).length ? fields : undefined,
        confidence: "medium",
        rationale:
          "Bootstrapped from rule oracle — replace with independent agent judgment",
        source: "rule-oracle-bootstrap",
      };
      added++;
    }
    judgmentsFile.updated_at = new Date().toISOString();
    writeFileSync(
      args.judgments,
      JSON.stringify(judgmentsFile, null, 2) + "\n",
    );
    console.log(
      `Wrote ${added} new agent judgments (bootstrap) → ${args.judgments}`,
    );
    judgmentsFile = loadJudgments(args.judgments);
  }

  const records: ResultRecord[] = [];
  for (const loc of locations) {
    let mode: "classify" | "classifyWithHead" = "classify";
    let result: Record<string, unknown> = classify(loc.url) as Record<
      string,
      unknown
    >;

    if (
      args.headAll ||
      (args.head && result.type === "unknown")
    ) {
      result = (await classifyWithHead(loc.url)) as Record<string, unknown>;
      mode = "classifyWithHead";
    }

    const ground_truth = expectedClassifierType(
      loc.source_column,
      loc.url,
      gtOverrides,
    );
    const ground_truth_agree = result.type === ground_truth.expected_type;
    const oracle = oracleClassify(loc.url);
    const oracle_agree = result.type === oracle.type;
    const agent = judgmentsFile.judgments[loc.url] ?? null;
    const agent_agree = agent
      ? result.type === agent.expected_type
      : null;

    records.push({
      app: loc.app,
      source_column: loc.source_column,
      raw_cell: loc.raw_cell,
      url: loc.url,
      seed_name: loc.seed_name,
      mode,
      classifier: result,
      ground_truth,
      ground_truth_agree,
      oracle,
      oracle_agree,
      agent,
      agent_agree,
    });
  }

  const resultsPath = resolve(args.out, "results.json");
  const summaryPath = resolve(args.out, "summary.md");

  const payload = {
    generated_at: new Date().toISOString(),
    table: args.table,
    mode: args.headAll
      ? "classifyWithHead-all"
      : args.head
        ? "classify+head-unknown"
        : "classify",
    counts: {
      locations: records.length,
      skipped: skipped.length,
      ground_truth_agree: records.filter((r) => r.ground_truth_agree).length,
      ground_truth_disagree: records.filter((r) => !r.ground_truth_agree)
        .length,
      oracle_agree: records.filter((r) => r.oracle_agree).length,
      oracle_disagree: records.filter((r) => !r.oracle_agree).length,
      agent_agree: records.filter((r) => r.agent_agree === true).length,
      agent_disagree: records.filter((r) => r.agent_agree === false).length,
      agent_missing: records.filter((r) => r.agent === null).length,
    },
    skipped,
    records,
  };

  writeFileSync(resultsPath, JSON.stringify(payload, null, 2) + "\n");
  writeFileSync(
    summaryPath,
    buildSummary({
      records,
      skipped,
      head: args.head,
      headAll: args.headAll,
    }),
  );

  console.log(`Wrote ${resultsPath}`);
  console.log(`Wrote ${summaryPath}`);
  console.log(
    `Ground truth: ${payload.counts.ground_truth_agree} agree / ${payload.counts.ground_truth_disagree} disagree`,
  );
  console.log(
    `Oracle:       ${payload.counts.oracle_agree} agree / ${payload.counts.oracle_disagree} disagree`,
  );
  console.log(
    `Agent:        ${payload.counts.agent_agree} agree / ${payload.counts.agent_disagree} disagree / ${payload.counts.agent_missing} missing`,
  );

  if (args.failOnGroundTruth && payload.counts.ground_truth_disagree > 0) {
    process.exit(1);
  }
  if (args.failOnOracle && payload.counts.oracle_disagree > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
