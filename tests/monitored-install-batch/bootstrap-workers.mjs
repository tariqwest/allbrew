#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BATCH_DIR, BATCH_LOGS, buildWorkerDefs, workerProcessEnv, DEFAULT_WORKERS, ensureDirs } from "./lib/batch-helpers.mjs";
process.env.LUME_REMOTE_ENABLED = process.env.LUME_REMOTE_ENABLED ?? "true";
ensureDirs(); mkdirSync(BATCH_LOGS, { recursive: true });
const workerNames = (process.env.TH_BATCH_WORKERS || DEFAULT_WORKERS.join(",")).split(",").map(s=>s.trim()).filter(Boolean);
const workers = buildWorkerDefs(workerNames);
const oneShot = join(import.meta.dir, "bootstrap-one-worker.mjs");
function runOne(worker) {
  return new Promise((resolve, reject) => {
    const env = workerProcessEnv(worker, process.env);
    console.log(`[bootstrap] spawn ${worker.id} ${worker.user}`);
    const child = spawn("bun", [oneShot], { env, cwd: join(import.meta.dir, "../.."), stdio: "inherit" });
    child.on("close", (code) => code === 0 ? resolve({ user: worker.user, ok: true }) : reject(new Error(`bootstrap-one-worker ${worker.user} exited ${code}`)));
  });
}
async function main() {
  console.log("[bootstrap] workers", workers.map(w=>w.user));
  const results = [];
  for (const w of workers) {
    try { results.push(await runOne(w)); }
    catch (e) {
      results.push({ user: w.user, ok: false, error: String(e?.message || e) });
      writeFileSync(join(BATCH_DIR, "state/bootstrap-status.json"), JSON.stringify({ results, at: new Date().toISOString() }, null, 2));
      throw e;
    }
  }
  writeFileSync(join(BATCH_DIR, "state/bootstrap-status.json"), JSON.stringify({ results, at: new Date().toISOString() }, null, 2));
  console.log("[bootstrap] done", results);
}
await main();
