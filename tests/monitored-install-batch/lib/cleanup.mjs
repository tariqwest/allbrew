#!/usr/bin/env bun
/**
 * Post-run cleanup for monitored-install-batch.
 * - Host: prunes disposable worktrees, tmp files, brew cache
 * - Guest (VM): brew cleanup, /tmp purge, services stop, sparsebundle compact
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const REPO_ROOT = resolve(import.meta.dir || fileURLToPath(new URL(".", import.meta.url)), "../../..");
const BATCH_DIR = resolve(REPO_ROOT, "tests/monitored-install-batch");
const WORKTREES_DIR = join(BATCH_DIR, "worktrees");
const STATE_DIR = join(BATCH_DIR, "state");

function sh(cmd, opts = {}) {
  try { return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim(); } catch (e) { return (e.stdout || "") + (e.stderr || ""); }
}

export function hostCleanup(opts = {}) {
  const dryRun = !!opts.dryRun;
  const verbose = !!opts.verbose;
  const out = [];
  const log = (m) => { out.push(m); if (verbose) console.log(m); };

  // 1. Prune git worktrees that are prunable (including /private/tmp/allbrew-wt-*)
  try {
    const before = sh("git worktree list --porcelain 2>&1 | head -n 200");
    log("worktree list before:\n" + before.slice(0, 800));
  } catch {}

  if (!dryRun) {
    try { sh("git worktree prune 2>&1"); log("git worktree prune done"); } catch (e) { log("prune failed: " + e.message); }
  } else log("[dry-run] git worktree prune");

  // 2. Batch worktrees are kept until explicitly archived; only log them here.
  // Removal of batch worktrees for terminal items is deferred to parent reaper after patch export
  // to avoid deleting a running item's worktree when multiple queue rows share the same slug.
  let removedWorktrees = 0;
  try {
    if (existsSync(WORKTREES_DIR)) {
      const entries = readdirSync(WORKTREES_DIR);
      for (const ent of entries) {
        const wtPath = join(WORKTREES_DIR, ent);
        const list = sh(`git worktree list --porcelain 2>&1 | grep -F "${wtPath}" || true`);
        const isPrunable = list.includes("prunable");
        if (isPrunable) {
          if (dryRun) log(`[dry-run] would remove prunable batch worktree ${wtPath}`);
          else {
            const r = sh(`git worktree remove --force "${wtPath}" 2>&1 || rm -rf "${wtPath}" 2>&1; echo REMOVED`);
            if (r.includes("REMOVED")) { removedWorktrees++; log(`removed prunable batch worktree ${wtPath}`); }
          }
        } else {
          log(`keep batch worktree ${wtPath} (not prunable)`);
        }
      }
    }
  } catch (e) { log("batch worktree check failed: " + e.message); }

  // 3. Host brew cache + tmp
  if (!dryRun) {
    try { sh("brew cleanup --prune=all 2>&1 | tail -5"); log("brew cleanup done"); } catch {}
    try { sh("rm -rf /tmp/allbrew-* /private/tmp/allbrew-* 2>&1; echo tmp-cleaned"); log("tmp cleaned"); } catch {}
  } else log("[dry-run] brew cleanup + tmp rm");

  // 4. Remove orphan /private/tmp/allbrew-wt-* that are prunable but not in batch dir
  try {
    const prunable = sh("git worktree list --porcelain 2>&1 | grep 'prunable' || true");
    if (prunable) log("prunable worktrees:\n" + prunable.slice(0, 800));
    if (!dryRun) {
      // git worktree prune already handles, but ensure /private/tmp/allbrew-wt-* leftovers are gone
      sh("rm -rf /private/tmp/allbrew-wt-* 2>/dev/null; echo prunable-tmp-cleaned");
      log("prunable /private/tmp cleaned");
    }
  } catch {}

  return { removedWorktrees, logs: out };
}

function awaitImportSync(p) { // sync JSON read without async import
  const { readFileSync } = require("node:fs");
  return readFileSync(p, "utf8");
}

export async function guestCleanup(h, session, mountPoint) {
  const logs = [];
  const run = async (cmd, desc) => {
    try {
      const { guest } = await import("./guest-ops.mjs");
      const r = await guest(h.runAsProjectUser, session, cmd, desc, { timeout: 120000 });
      logs.push(`${desc}: exit ${r.exitCode} ${ (r.stdout||"").slice(0,300)}`);
      return r;
    } catch (e) { logs.push(`${desc} failed: ${e.message}`); return null; }
  };
  const mp = mountPoint || "/opt/homebrew";
  // brew services stop + cleanup + tmp purge
  await run(`${`export PATH="${mp}/bin:$HOME/.bun/bin:$PATH"`}
brew services stop --all 2>&1 || true
brew cleanup --prune=all 2>&1 | tail -10; echo CLEANUP_OK
brew autoremove 2>&1 | tail -10 || true
rm -rf /tmp/allbrew-* /private/tmp/allbrew-* 2>/dev/null || true
rm -rf "$TMPDIR"/allbrew-* 2>/dev/null || true
rm -rf ~/Library/Caches/Homebrew/* 2>/dev/null || true
df -h / 2>&1 | head -10; echo DF_OK
`, "guest-post-cleanup");

  // compact sparsebundle if not mounted (host side mount point absent)
  await run(`if ! mount | grep -q " on ${mp} "; then
  SPARSE="$HOME/Library/LumeHomebrew/homebrew.sparsebundle"
  if [ -d "$SPARSE" ]; then
    echo "compact start $SPARSE"
    hdiutil compact "$SPARSE" 2>&1 | tail -20; echo COMPACT_OK
  fi
fi
`, "guest-compact");

  return logs;
}
