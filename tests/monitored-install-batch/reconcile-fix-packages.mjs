#!/usr/bin/env node
/**
 * Staged reconciler for option-A fix packages.
 *
 * Applies patches only inside disposable git worktrees under
 * tests/monitored-install-batch/worktrees/, promotes a local fix/* branch
 * on success, and enqueues a linked retry. Never mutates the user's
 * working tree or default branch.
 *
 * Usage:
 *   node tests/monitored-install-batch/reconcile-fix-packages.mjs [flags]
 *
 * Flags:
 *   --dry-run            Validate + plan only; no worktree apply/promote
 *   --limit N            Max packages to process (default: unlimited)
 *   --path DIR           Single runDir or fix-package directory
 *   --runDir DIR         Alias for --path
 *   --skip-validation    Skip validateBeforePromote commands
 *   --cleanup / --no-cleanup  Remove worktree after promote (default: cleanup)
 *   --baseline REF       Git ref/commit for worktree base (default: HEAD)
 *   --queue PATH         Agent queue JSON path (default: agent-queue.json)
 *   --json               Emit machine-readable JSON on stdout
 *   --help               Show this help
 */
import { resolve } from "node:path";
import {
  reconcileOne,
  reconcilePending,
  discoverFixPackages,
} from "./lib/patch-coordinator.mjs";
import { BATCH_DIR, AGENT_QUEUE_PATH } from "./lib/batch-helpers.mjs";

function printHelp() {
  console.log(`Usage: node tests/monitored-install-batch/reconcile-fix-packages.mjs [flags]

Staged fix-package reconciler (option A). Applies only in disposable worktrees.

Flags:
  --dry-run              Validate + plan only; no apply/promote
  --limit N              Max packages to process
  --path DIR             Single runDir or fix-package directory
  --runDir DIR           Alias for --path
  --skip-validation      Skip host validation commands before promote
  --cleanup              Remove worktree after promote (default)
  --no-cleanup           Keep worktree for inspection
  --baseline REF         Worktree base ref (default: HEAD)
  --queue PATH           Agent queue path (default: agent-queue.json)
  --json                 Print JSON result
  --help                 Show help
`);
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    limit: Infinity,
    path: null,
    skipValidation: false,
    cleanup: true,
    baselineCommit: "HEAD",
    queuePath: AGENT_QUEUE_PATH,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null || v.startsWith("--")) {
        throw new Error(`Missing value for ${a}`);
      }
      return v;
    };
    switch (a) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--limit":
        opts.limit = Number(next());
        if (!Number.isFinite(opts.limit) || opts.limit < 0) {
          throw new Error(`Invalid --limit: ${opts.limit}`);
        }
        break;
      case "--path":
      case "--runDir":
        opts.path = resolve(next());
        break;
      case "--skip-validation":
        opts.skipValidation = true;
        break;
      case "--cleanup":
        opts.cleanup = true;
        break;
      case "--no-cleanup":
        opts.cleanup = false;
        break;
      case "--baseline":
        opts.baselineCommit = next();
        break;
      case "--queue":
        opts.queuePath = resolve(next());
        break;
      case "--json":
        opts.json = true;
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(String(err?.message || err));
    process.exitCode = 2;
    return;
  }

  if (opts.help) {
    printHelp();
    return;
  }

  const common = {
    dryRun: opts.dryRun,
    cleanup: opts.cleanup,
    skipValidation: opts.skipValidation,
    baselineCommit: opts.baselineCommit,
    queuePath: opts.queuePath,
  };

  let result;
  if (opts.path) {
    const one = reconcileOne(opts.path, common);
    result = {
      mode: "one",
      path: opts.path,
      count: 1,
      results: [{ path: opts.path, result: one }],
    };
  } else {
    const pending = reconcilePending({
      ...common,
      limit: opts.limit,
      runsRoots: undefined, // library defaults
    });
    result = {
      mode: "pending",
      batchDir: BATCH_DIR,
      discovered: discoverFixPackages().length,
      ...pending,
    };
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const rows = result.results || [];
    console.log(
      `reconcile-fix-packages: mode=${result.mode} count=${result.count ?? rows.length}` +
        (opts.dryRun ? " dryRun=true" : ""),
    );
    for (const row of rows) {
      const r = row.result || row;
      const id = row.sourceRunId || row.path || r.fixDir || "?";
      const ok = r.ok ? "ok" : "fail";
      const event = r.event || r.error || "unknown";
      console.log(`  [${ok}] ${id}  event=${event}`);
      if (r.branchName) console.log(`         branch=${r.branchName}`);
      if (r.commit) console.log(`         commit=${r.commit}`);
      if (r.worktreePath) console.log(`         worktree=${r.worktreePath}`);
      if (r.error) console.log(`         error=${r.error}`);
    }
  }

  const failed = (result.results || []).some((row) => {
    const r = row.result || row;
    return r && r.ok === false;
  });
  if (failed) process.exitCode = 1;
}

main();
