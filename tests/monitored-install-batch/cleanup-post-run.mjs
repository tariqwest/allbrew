#!/usr/bin/env bun
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const REPO_ROOT = resolve(import.meta.dir || fileURLToPath(new URL(".", import.meta.url)), "../..");

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose");
  const slug = args[args.indexOf("--slug") + 1] || null;
  const hostOnly = args.includes("--host-only");
  const vmOnly = args.includes("--vm-only");

  if (!hostOnly) {
    // guest cleanup will be called from vm-install-one's finally; host-only mode skips
  }

  const { hostCleanup } = await import("./lib/cleanup.mjs");
  console.log(`[cleanup] host ${dryRun ? "dry-run" : "live"}${slug ? " slug=" + slug : ""}`);
  const res = hostCleanup({ dryRun, verbose });
  console.log(`[cleanup] removedWorktrees=${res.removedWorktrees}`);
  if (dryRun) console.log("[cleanup] dry-run complete — no mutations");
  else console.log("[cleanup] host cleanup done");

  // Also prune stale mutex lockdirs where holder pid is dead (parent reaper)
  if (!dryRun) {
    const { execSync } = await import("node:child_process");
    try {
      const out = execSync("bun tests/monitored-install-batch/vm-guest-health.mjs --clear-stale --json 2>&1 | head -n 50", { encoding: "utf8", cwd: REPO_ROOT });
      console.log(out.slice(0, 1000));
    } catch (e) { console.log("clear-stale failed: " + e.message.slice(0, 300)); }
  }

  // Per-item VM ephemera is handled inside vm-install-one.mjs's finally (brew cleanup, /tmp purge, services stop, hdiutil compact).
  // This host script ensures worktrees/tmp don't accumulate across waves.
}

main().catch((e) => { console.error(e); process.exit(1); });
