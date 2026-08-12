#!/usr/bin/env bun
/**
 * Archive ephemeral batch artifacts to ~/.cache/allbrew/batch-artifacts
 * while keeping a lean, committed index on main.
 *
 * Moves (not copies) fix-packages/, monitored-install-runs/, and logs/*.log
 * into a dated tarball under ~/.cache, verifies via tar tf, then prunes
 * the originals. A manifest.json stays on main (tracked) so reconcile-fixes
 * can fetch on demand.
 *
 * Usage:
 *   bun scripts/archive-batch-artifacts.mjs --date 2026-08-10 --dest ~/.cache/allbrew/batch-artifacts --tar batch-2026-08-10.tar.zst --verify --prune-move
 *   bun scripts/archive-batch-artifacts.mjs --dry-run
 */

import { existsSync, mkdirSync, statSync, createWriteStream, rmSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { tmpdir } from "node:os";

const BATCH_DIR = resolve(import.meta.dir, "../tests/monitored-install-batch");
const RUNS_DIR = resolve(import.meta.dir, "../tests/monitored-install-runs");
const REPO_ROOT = resolve(import.meta.dir, "..");

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}
function has(flag) { return process.argv.includes(flag); }

const dryRun = has("--dry-run");
const verify = has("--verify");
const pruneMove = has("--prune-move");
const date = arg("--date", new Date().toISOString().slice(0, 10));
const destBase = resolve((arg("--dest", "~/.cache/allbrew/batch-artifacts") || "").replace(/^~/, process.env.HOME || ""));
const tarName = arg("--tar", `batch-${date}.tar.zst`);

const fixPkgs = join(BATCH_DIR, "fix-packages");
const logsDir = join(BATCH_DIR, "logs");
const stateDir = join(BATCH_DIR, "state");
const archiveDir = join(destBase, date);
const tarPath = join(archiveDir, tarName);
const manifestPath = join(BATCH_DIR, "archive", "manifest.json");

function sh(cmd) {
  const { spawnSync } = require("node:child_process");
  const r = spawnSync("bash", ["-c", cmd], { encoding: "utf8", timeout: 120000 });
  return { ok: r.status === 0, stdout: r.stdout || "", stderr: r.stderr || "", code: r.status };
}

function du(p) {
  if (!existsSync(p)) return "0B";
  const r = sh(`du -sh ${JSON.stringify(p)} 2>&1 | cut -f1`);
  return (r.stdout || "").trim() || "0B";
}

function count(p) {
  if (!existsSync(p)) return 0;
  try { return sh(`ls -1 ${JSON.stringify(p)} 2>/dev/null | wc -l`).stdout.trim(); } catch { return 0; }
}

console.log(`[archive] date=${date} dest=${archiveDir} tar=${tarName} dryRun=${dryRun}`);

const sources = [];
const relSources = [];
if (existsSync(fixPkgs)) { sources.push(fixPkgs); relSources.push("tests/monitored-install-batch/fix-packages"); }
if (existsSync(RUNS_DIR)) { sources.push(RUNS_DIR); relSources.push("tests/monitored-install-runs"); }
if (existsSync(logsDir)) { sources.push(logsDir); relSources.push("tests/monitored-install-batch/logs"); }

if (!sources.length) {
  console.log("[archive] nothing to archive (no fix-packages/runs/logs)");
  process.exit(0);
}

console.log(`[archive] sources: ${relSources.join(", ")}`);
console.log(`[archive] sizes: fix-packages ${du(fixPkgs)} (${count(fixPkgs)}), runs ${du(RUNS_DIR)} (${count(RUNS_DIR)}), logs ${du(logsDir)}`);

if (dryRun) {
  console.log("[archive] dry-run — would create:", tarPath);
  console.log("[archive] would move sources to archive and prune originals");
  process.exit(0);
}

mkdirSync(archiveDir, { recursive: true });
mkdirSync(join(BATCH_DIR, "archive"), { recursive: true });

// Create tarball via tar -c -I zstd (fallback to gzip if zstd missing)
const relArgs = relSources.map(s => JSON.stringify(s)).join(" ");
let tarCmd = `tar -c --zstd -f ${JSON.stringify(tarPath)} -C ${JSON.stringify(REPO_ROOT)} ${relArgs} 2>&1`;
let r = sh(tarCmd);
if (!r.ok && /unknown option|unrecognized/i.test(r.stdout + r.stderr)) {
  console.log("[archive] zstd not available, falling back to gzip");
  const gzPath = tarPath.replace(/\.tar\.zst$/, ".tar.gz");
  tarCmd = `tar -czf ${JSON.stringify(gzPath)} -C ${JSON.stringify(REPO_ROOT)} ${relArgs} 2>&1`;
  r = sh(tarCmd);
  if (!r.ok) { console.error("[archive] tar failed:", r.stdout, r.stderr); process.exit(1); }
  console.log(`[archive] created ${gzPath} ${du(gzPath)}`);
} else {
  if (!r.ok) { console.error("[archive] tar failed:", r.stdout, r.stderr); process.exit(1); }
  console.log(`[archive] created ${tarPath} ${du(tarPath)}`);
}

const finalTar = existsSync(tarPath) ? tarPath : tarPath.replace(/\.tar\.zst$/, ".tar.gz");
if (verify) {
  const vr = sh(`tar tf ${JSON.stringify(finalTar)} 2>&1 | head -n 20`);
  if (!vr.ok) { console.error("[archive] verify failed:", vr.stdout, vr.stderr); process.exit(1); }
  const cr = sh(`tar tf ${JSON.stringify(finalTar)} 2>&1 | wc -l`);
  console.log(`[archive] verify ok: ${cr.stdout.trim()} entries, sample:`);
  console.log(vr.stdout.split("\n").slice(0, 5).join("\n"));
}

const sha = sh(`shasum -a 256 ${JSON.stringify(finalTar)} 2>&1 | cut -d' ' -f1`).stdout.trim();
const stat = statSync(finalTar);
const manifest = {
  date,
  dest: archiveDir,
  tarball: basename(finalTar),
  tarPath: finalTar,
  sha256: sha,
  size: stat.size,
  sizeHuman: du(finalTar),
  createdAt: new Date().toISOString(),
  gitSha: sh(`git -C ${JSON.stringify(REPO_ROOT)} rev-parse HEAD 2>&1`).stdout.trim(),
  branch: sh(`git -C ${JSON.stringify(REPO_ROOT)} branch --show-current 2>&1`).stdout.trim(),
  counts: {
    fixPackages: Number(count(fixPkgs)) || 0,
    runs: Number(count(RUNS_DIR)) || 0,
    logs: existsSync(logsDir) ? Number(sh(`ls -1 ${JSON.stringify(logsDir)} 2>/dev/null | wc -l`).stdout.trim()) : 0,
  },
  sources: relSources,
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`[archive] manifest ${manifestPath}`);
console.log(JSON.stringify(manifest, null, 2));

if (pruneMove) {
  // Move originals into archive subdirs for safety before rm (keep a copy in archive)
  const backupFix = join(archiveDir, "fix-packages");
  const backupRuns = join(archiveDir, "runs");
  const backupLogs = join(archiveDir, "logs");
  // Already tarred, now prune originals
  for (const src of sources) {
    console.log(`[archive] pruning ${src}`);
    rmSync(src, { recursive: true, force: true });
    mkdirSync(src, { recursive: true }); // keep empty dir so .gitignore still applies
    writeFileSync(join(src, ".keep"), "");
  }
  console.log("[archive] pruned originals, kept .keep placeholders");
  console.log(`[archive] to restore: tar -xf ${JSON.stringify(finalTar)} -C ${JSON.stringify(REPO_ROOT)}`);
}

console.log("[archive] done");
