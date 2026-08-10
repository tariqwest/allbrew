#!/usr/bin/env bun
/**
 * Batch ops: search, manage, and batch-operate over current + archived batch items
 * and their records/outputs.
 *
 * Usage:
 *   bun tests/monitored-install-batch/batch-ops.mjs --list [--status succeeded] [--search warp] [--failure-class brew_fail] [--archived]
 *   bun tests/monitored-install-batch/batch-ops.mjs --show <slug|idx|agentName>
 *   bun tests/monitored-install-batch/batch-ops.mjs --restore <slug> [--dest <path>]
 *   bun tests/monitored-install-batch/batch-ops.mjs --reconcile <slug> [--dry-run]
 *   bun tests/monitored-install-batch/batch-ops.mjs --requeue <slug> [--to pending]
 *   bun tests/monitored-install-batch/batch-ops.mjs --mark-done <slug> <status>
 *   bun tests/monitored-install-batch/batch-ops.mjs --archive-status
 *
 * Reads:
 *   - tests/monitored-install-batch/state/agent-queue.json (current, with legacy aliases)
 *   - tests/monitored-install-batch/state/fix-index.jsonl + agent-index.jsonl
 *   - tests/monitored-install-batch/archive/manifest.json + ~/.cache/allbrew/batch-artifacts/<date>/*.tar.zst
 *   - tests/monitored-install-runs/<runId>/ (current) and archived tarballs
 *
 * Writes: only via --requeue/--mark-done/--restore/--reconcile (delegates to run-agent-batch.mjs / reconcile-fix-packages.mjs)
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const BATCH_DIR = resolve(import.meta.dir || fileURLToPath(new URL(".", import.meta.url)));
const REPO_ROOT = resolve(BATCH_DIR, "../..");
const QUEUE_PATH = join(BATCH_DIR, "state/agent-queue.json");
const FIX_INDEX = join(BATCH_DIR, "state/fix-index.jsonl");
const ARCHIVE_MANIFEST = join(BATCH_DIR, "archive/manifest.json");
const CACHE_BASE = resolve((process.env.HOME || "") + "/.cache/allbrew/batch-artifacts");
const RUNS_DIR = join(REPO_ROOT, "tests/monitored-install-runs");
const FIX_PKGS = join(BATCH_DIR, "fix-packages");

const STATUS_ALIASES = {
  queued: "pending", retry: "pending", launching: "pending",
  success: "succeeded", "success-not-fixed": "succeeded", fixed_success: "succeeded", "failed-fix-applied": "succeeded",
  "failed-agent-runtime": "failed_system", "failed-timeout": "failed_system", infrastructure_failed: "failed_system", done: "failed_system",
};
function normalizeStatus(s) { return STATUS_ALIASES[String(s)] || String(s); }

function loadQueue() {
  if (!existsSync(QUEUE_PATH)) return [];
  const data = JSON.parse(readFileSync(QUEUE_PATH, "utf8"));
  return data.items || [];
}

function loadFixIndex() {
  if (!existsSync(FIX_INDEX)) return [];
  return readFileSync(FIX_INDEX, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function loadArchiveManifest() {
  if (!existsSync(ARCHIVE_MANIFEST)) return null;
  try { return JSON.parse(readFileSync(ARCHIVE_MANIFEST, "utf8")); } catch { return null; }
}

function listCacheArchives() {
  if (!existsSync(CACHE_BASE)) return [];
  try {
    return readdirSync(CACHE_BASE).flatMap(d => {
      const dir = join(CACHE_BASE, d);
      try { return readdirSync(dir).filter(f => f.endsWith(".tar.zst") || f.endsWith(".tar.gz")).map(f => ({ date: d, file: f, path: join(dir, f) })); } catch { return []; }
    });
  } catch { return []; }
}

function findItem(query) {
  const items = loadQueue();
  const q = String(query).toLowerCase();
  return items.find(i => String(i.idx) === q || i.slug?.toLowerCase() === q || i.agentName?.toLowerCase() === q || i.url?.toLowerCase().includes(q));
}

function formatItem(i, withArchived = false) {
  const archived = withArchived ? " (archived? check cache)" : "";
  return `${String(i.idx).padStart(3)} ${i.slug?.padEnd(20) || "?".padEnd(20)} ${String(i.status).padEnd(14)} ${i.url || ""}${i.legacyStatus ? ` [legacy:${i.legacyStatus}]` : ""}`;
}

function cmdList(opts) {
  const statusFilter = opts.status ? normalizeStatus(opts.status) : null;
  const search = opts.search ? String(opts.search).toLowerCase() : null;
  const failureClass = opts.failureClass ? String(opts.failureClass).toLowerCase() : null;
  const includeArchived = !!opts.archived;

  let items = loadQueue();
  if (statusFilter) items = items.filter(i => normalizeStatus(i.status) === statusFilter);
  if (failureClass) items = items.filter(i => (i.failureClass || i.notes || "").toLowerCase().includes(failureClass));
  if (search) items = items.filter(i => [i.slug, i.agentName, i.url, i.name].join(" ").toLowerCase().includes(search));

  console.log(`[batch-ops] queue: ${items.length}/${loadQueue().length} matched${statusFilter ? ` status=${statusFilter}` : ""}${search ? ` search=${search}` : ""}`);
  for (const i of items.slice(0, 100)) console.log(formatItem(i));
  if (items.length > 100) console.log(`... and ${items.length - 100} more (use --search to narrow)`);

  if (includeArchived) {
    const manifest = loadArchiveManifest();
    const archives = listCacheArchives();
    console.log(`\n[batch-ops] archives: ${archives.length} tarballs in ${CACHE_BASE}`);
    if (manifest) console.log(`  manifest: ${manifest.tarball} ${manifest.sizeHuman} sha256:${String(manifest.sha256).slice(0, 12)} counts fixPackages=${manifest.counts?.fixPackages} runs=${manifest.counts?.runs}`);
    for (const a of archives) console.log(`  ${a.date}/${a.file} ${existsSync(a.path) ? (statSync(a.path).size / 1024 / 1024).toFixed(1) + "M" : "missing"}`);
    // List archived slugs via tar tf (first 20)
    if (archives[0]) {
      const { spawnSync } = require("node:child_process");
      const r = spawnSync("bash", ["-c", `tar tf ${JSON.stringify(archives[0].path)} 2>&1 | grep "fix-packages/" | cut -d/ -f3 | sort -u | head -n 20`], { encoding: "utf8", timeout: 15000 });
      if (r.stdout) {
        console.log(`\n  archived slugs (sample from ${archives[0].file}):`);
        console.log(r.stdout.split("\n").filter(Boolean).map(s => `    ${s}`).join("\n"));
      }
    }
  }

  const fixIdx = loadFixIndex();
  if (fixIdx.length) console.log(`\n[batch-ops] fix-index.jsonl: ${fixIdx.length} entries (reconcile-ready)`);
}

function cmdShow(query) {
  const item = findItem(query);
  if (!item) { console.error(`[batch-ops] no queue item for "${query}"`); process.exit(1); }
  console.log(JSON.stringify(item, null, 2));
  const runs = existsSync(RUNS_DIR) ? readdirSync(RUNS_DIR).filter(d => d.includes(item.slug || "")) : [];
  if (runs.length) {
    console.log(`\n[runs] ${runs.length} local run(s) for ${item.slug}:`);
    for (const r of runs.slice(0, 5)) {
      const runDir = join(RUNS_DIR, r);
      const hasOutcome = existsSync(join(runDir, "outcome.json"));
      const hasFix = existsSync(join(runDir, "fix-package"));
      const hasLog = existsSync(join(runDir, "vm-install.log")) || existsSync(join(runDir, "allbrew-initial.log"));
      console.log(`  ${r} outcome:${hasOutcome} fix:${hasFix} log:${hasLog} ${join("tests/monitored-install-runs", r)}`);
      try {
        const j = JSON.parse(readFileSync(join(runDir, "agent-judgment.json"), "utf8"));
        console.log(`    expected: ${j.expected?.generator} service:${j.expected?.service} deltas:${j.deltas?.length || 0}`);
      } catch {}
    }
  } else {
    console.log(`\n[runs] no local runs for ${item.slug} (archived? see --archived)`);
    const manifest = loadArchiveManifest();
    if (manifest) console.log(`  archived in ${manifest.tarPath} — restore via --restore ${item.slug}`);
  }
  const fixPath = join(FIX_PKGS, item.slug || "");
  if (existsSync(fixPath)) {
    console.log(`\n[fix-package] ${fixPath} (${readdirSync(fixPath).join(", ")})`);
  } else {
    const cacheFix = join(CACHE_BASE, "2026-08-10", "fix-packages", item.slug || "");
    // try to find in cache via tar
    const archives = listCacheArchives();
    if (archives[0]) {
      const { spawnSync } = require("node:child_process");
      const r = spawnSync("bash", ["-c", `tar tf ${JSON.stringify(archives[0].path)} 2>&1 | grep "${item.slug || query}/" | head -n 10`], { encoding: "utf8", timeout: 10000 });
      if (r.stdout?.trim()) console.log(`\n[fix-package] archived (in ${archives[0].file}):\n${r.stdout}`);
      else console.log(`\n[fix-package] not found locally or in archive`);
    }
  }
  // vm-meta if present
  const vmMeta = join(RUNS_DIR, runs[0] || "", "vm-meta.json");
  if (existsSync(vmMeta)) {
    console.log(`\n[vm-meta] ${vmMeta}:`);
    console.log(readFileSync(vmMeta, "utf8").slice(0, 800));
  }
}

function spawn(m, args) {
  const { spawnSync } = require("node:child_process");
  const r = spawnSync("bun", [m, ...args], { encoding: "utf8", timeout: 120000, stdio: "inherit" });
  process.exit(r.status ?? 0);
}

const args = process.argv.slice(2);
function hasFlag(f) { return args.includes(f); }
function getFlag(f) { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; }

if (args.length === 0 || hasFlag("--help") || hasFlag("-h")) {
  console.log(`batch-ops — search, manage, batch-operate over current + archived batch items

Current queue: ${loadQueue().length} items, fix-index: ${loadFixIndex().length}, cache archives: ${listCacheArchives().length}

Usage:
  --list [--status <pending|running|succeeded|failed|failed_system|skipped|blocked>]
         [--search <term>] [--failure-class <class>] [--archived]
  --show <slug|idx|agentName>            detail: queue item + runs + fix-package + vm-meta
  --restore <slug> [--dest <path>]        tar -xf archived patch/runs back to repo
  --reconcile <slug> [--dry-run]          batch:reconcile-fixes for local or cached fix-package
  --requeue <slug>                        mark pending (requeue once)
  --mark-done <slug> <status>             mark queue item done
  --archive-status                        show cache + manifest

Examples:
  bun tests/monitored-install-batch/batch-ops.mjs --list --status failed --search warp
  bun tests/monitored-install-batch/batch-ops.mjs --list --archived
  bun tests/monitored-install-batch/batch-ops.mjs --show warp-agent-cli
  bun tests/monitored-install-batch/batch-ops.mjs --restore warp-agent-cli
  bun tests/monitored-install-batch/batch-ops.mjs --reconcile warp-agent-cli --dry-run
`);
  process.exit(0);
}

if (hasFlag("--archive-status")) {
  const m = loadArchiveManifest();
  console.log(m ? JSON.stringify(m, null, 2) : "[archive] no manifest (run archive-batch-artifacts.mjs)");
  const archives = listCacheArchives();
  console.log(`\narchives in ${CACHE_BASE}: ${archives.length}`);
  for (const a of archives) console.log(`  ${a.path}`);
  process.exit(0);
}

if (hasFlag("--list")) {
  cmdList({ status: getFlag("--status"), search: getFlag("--search"), failureClass: getFlag("--failure-class"), archived: hasFlag("--archived") });
  process.exit(0);
}

if (hasFlag("--show")) {
  const q = getFlag("--show");
  if (!q) { console.error("--show requires <slug|idx|agentName>"); process.exit(1); }
  cmdShow(q);
  process.exit(0);
}

if (hasFlag("--restore")) {
  const slug = getFlag("--restore");
  const dest = getFlag("--dest") || REPO_ROOT;
  const archives = listCacheArchives();
  if (!slug || !archives[0]) { console.error("--restore requires <slug> and a cached tarball"); process.exit(1); }
  const tar = archives[0].path;
  const { spawnSync } = require("node:child_process");
  console.log(`[restore] tar -xf ${tar} -C ${dest} -- tests/monitored-install-batch/fix-packages/${slug} tests/monitored-install-runs/*${slug}*`);
  const r = spawnSync("bash", ["-c", `tar -xf ${JSON.stringify(tar)} -C ${JSON.stringify(dest)} -- "tests/monitored-install-batch/fix-packages/${slug}" "tests/monitored-install-runs" 2>&1 | head -n 20; echo RESTORE_EXIT:$?`], { encoding: "utf8", timeout: 30000 });
  console.log(r.stdout || ""); console.error(r.stderr || "");
  // also try direct extract for fix-packages
  const r2 = spawnSync("bash", ["-c", `tar -xf ${JSON.stringify(tar)} -C ${JSON.stringify(dest)} --wildcards "*/fix-packages/${slug}/*" "*/${slug}*"`], { encoding: "utf8", timeout: 30000 });
  if (r2.status === 0) console.log(`[restore] done, check tests/monitored-install-batch/fix-packages/${slug}`);
  else console.log(`[restore] hint: tar tf ${tar} | grep ${slug} | head`);
  process.exit(r.status ?? 0);
}

if (hasFlag("--reconcile")) {
  const slug = getFlag("--reconcile");
  const dry = hasFlag("--dry-run") ? "--dry-run" : "";
  // try local first, then cache
  let path = join(FIX_PKGS, slug || "");
  if (!existsSync(path)) {
    path = join(CACHE_BASE, "2026-08-10", "fix-packages", slug || "");
    if (!existsSync(path)) {
      // try tar extraction hint
      console.log(`[reconcile] local ${join(FIX_PKGS, slug || "")} missing, cache ${path} missing — run --restore ${slug} first`);
      process.exit(1);
    }
  }
  spawn("tests/monitored-install-batch/reconcile-fix-packages.mjs", dry ? ["--dry-run", "--path", path] : ["--path", path]);
}

if (hasFlag("--requeue")) {
  const slug = getFlag("--requeue");
  const to = getFlag("--to") || "pending";
  spawn("tests/monitored-install-batch/run-agent-batch.mjs", ["--mark-done", slug, to]);
}

if (hasFlag("--mark-done")) {
  const idx = args.indexOf("--mark-done");
  const slug = args[idx + 1];
  const status = args[idx + 2];
  if (!slug || !status) { console.error("--mark-done <slug|idx> <status>"); process.exit(1); }
  spawn("tests/monitored-install-batch/run-agent-batch.mjs", ["--mark-done", slug, status]);
}

console.error("[batch-ops] unknown command, see --help");
process.exit(1);
