#!/usr/bin/env bun
/**
 * Skill-aligned monitored-install batch orchestrator.
 *
 * Spawns TH_BATCH_CONCURRENCY long-lived workers. Each worker acquires the
 * Homebrew prefix ONCE and processes many URLs, avoiding host-PID lock thrash
 * from per-URL acquire/release.
 *
 * Env:
 *   TH_BATCH_CONCURRENCY=1
 *   TH_BATCH_WORKERS=th-allbrew
 *   TH_BATCH_START=0 TH_BATCH_LIMIT=
 *   TH_BATCH_FIX_MODE=docs|off
 *   TH_BATCH_SKIP_BOOTSTRAP=0
 *   TH_BATCH_URLS=path/to/urls-shuffled.json
 *   GITHUB_TOKEN
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  BATCH_DIR,
  ensureDirs,
  buildWorkerDefs,
  workerProcessEnv,
  envInt,
  writeProgress,
  DEFAULT_WORKERS,
} from "./lib/batch-helpers.mjs";
import { loadHarness, forceUnlockHomebrewPrefix } from "./lib/guest-ops.mjs";

process.env.LUME_REMOTE_ENABLED = process.env.LUME_REMOTE_ENABLED ?? "true";
ensureDirs();

const concurrency = Math.max(1, envInt("TH_BATCH_CONCURRENCY", 1));
const workerNames = (process.env.TH_BATCH_WORKERS || "th-allbrew")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, concurrency);
const workers = buildWorkerDefs(workerNames.length ? workerNames : DEFAULT_WORKERS);

const urlsPath = resolve(
  process.env.TH_BATCH_URLS || join(BATCH_DIR, "urls-shuffled.json"),
);
const urls = JSON.parse(readFileSync(urlsPath, "utf8"));
const startIdx = envInt("TH_BATCH_START", 0);
const limit = process.env.TH_BATCH_LIMIT
  ? envInt("TH_BATCH_LIMIT", urls.length)
  : urls.length;
const slice = urls.slice(startIdx, startIdx + limit).map((u, i) => ({
  ...u,
  idx: startIdx + i,
}));

const workerLoopScript = join(BATCH_DIR, "worker-loop.mjs");
const bootstrapScript = join(BATCH_DIR, "bootstrap-workers.mjs");

async function ensureVmRunning() {
  const harnessRoot = resolve(
    import.meta.dir,
    "../../node_modules/macos-testing-harness/src",
  );
  const importTs = (rel) => import(pathToFileURL(join(harnessRoot, rel)).href);
  const { execHost } = await importTs("lib/shell.ts");
  const { config } = await importTs("config.ts");
  const API = "http://" + ["127", "0", "0", "1"].join(".") + ":7777";

  const getVm = async () =>
    execHost(
      `export PATH="$HOME/.local/bin:$PATH"; curl -s ${API}/lume/vms/${config.lumeVmName}`,
      { nothrow: true },
    );
  const isReady = (stdout) =>
    stdout.includes('"status":"running"') &&
    (stdout.includes('"sshAvailable":true') ||
      stdout.includes('"sshAvailable": true'));

  let check = await getVm();
  if (isReady(check.stdout)) {
    const ssh = await execHost(
      `export PATH="$HOME/.local/bin:$PATH"; lume ssh ${config.lumeVmName} --timeout 15 true`,
      { nothrow: true },
    );
    if (ssh.exitCode === 0) return config;
  }

  console.log("[orch] starting VM…");
  await execHost(
    `export PATH="$HOME/.local/bin:$PATH"; curl -s -X POST ${API}/lume/vms/${config.lumeVmName}/run -H 'Content-Type: application/json' -d '{"noDisplay":true}'`,
    { nothrow: true },
  );

  for (let i = 0; i < 90; i++) {
    await Bun.sleep(2000);
    const st = await getVm();
    if (!isReady(st.stdout)) {
      if (i > 0 && i % 20 === 0 && st.stdout.includes('"status":"stopped"')) {
        await execHost(
          `export PATH="$HOME/.local/bin:$PATH"; curl -s -X POST ${API}/lume/vms/${config.lumeVmName}/run -H 'Content-Type: application/json' -d '{"noDisplay":true}'`,
          { nothrow: true },
        );
      }
      continue;
    }
    const ssh = await execHost(
      `export PATH="$HOME/.local/bin:$PATH"; lume ssh ${config.lumeVmName} --timeout 15 true`,
      { nothrow: true },
    );
    if (ssh.exitCode === 0) {
      console.log("[orch] VM ready");
      return config;
    }
  }
  throw new Error("VM failed to become ready");
}

async function preflightUnlockAll() {
  // Best-effort clear of default lock before workers start. Each long-lived
  // worker also force-unlocks its own lock path on acquire/release.
  try {
    // Use first worker env so config points at the lock we'll use.
    const env = workerProcessEnv(workers[0], process.env);
    for (const [k, v] of Object.entries(env)) {
      if (v !== undefined) process.env[k] = String(v);
    }
    const h = await loadHarness();
    const r = await forceUnlockHomebrewPrefix(h, "orch-preflight");
    console.log("[orch] preflight unlock", r.ok ? "ok" : "warn", (r.stdout || "").split("\n").slice(-3).join(" | "));
  } catch (e) {
    console.warn("[orch] preflight unlock failed:", e?.message || e);
  }
}

function startLongLivedWorker(worker) {
  const env = workerProcessEnv(worker, process.env);
  env.TH_BATCH_FIX_MODE = process.env.TH_BATCH_FIX_MODE || "docs";
  env.TH_BATCH_STRICT_VERIFY = process.env.TH_BATCH_STRICT_VERIFY || "1";
  env.TH_BATCH_KEEP_PREFIX = process.env.TH_BATCH_KEEP_PREFIX || "1";
  env.TH_BATCH_ORCH_CHILD = "1";

  console.log(`[orch] start long-lived ${worker.id}/${worker.user}`);
  const child = spawn("bun", [workerLoopScript], {
    env,
    cwd: resolve(BATCH_DIR, "../.."),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const state = {
    worker,
    child,
    busy: false,
    queue: [],
    closed: false,
    stdoutBuf: "",
  };

  child.stderr.on("data", (d) => process.stderr.write(d));
  child.stdout.on("data", (d) => {
    state.stdoutBuf += d.toString();
    let idx;
    while ((idx = state.stdoutBuf.indexOf("\n")) >= 0) {
      const line = state.stdoutBuf.slice(0, idx);
      state.stdoutBuf = state.stdoutBuf.slice(idx + 1);
      const m = line.match(/^OUTCOME_JSON=(.+)$/);
      if (m && state.pending) {
        let outcome = null;
        try {
          outcome = JSON.parse(m[1]);
        } catch {
          outcome = {
            status: "error",
            error: "bad OUTCOME_JSON",
            raw: m[1].slice(0, 500),
          };
        }
        const resolve = state.pending.resolve;
        state.pending = null;
        state.busy = false;
        resolve(outcome);
        pump(state);
      }
    }
  });

  child.on("close", (code) => {
    state.closed = true;
    if (state.pending) {
      state.pending.resolve({
        status: "error",
        failureClass: "env_fail",
        error: `worker exited ${code} while busy`,
        workerId: worker.id,
        finishedAt: new Date().toISOString(),
      });
      state.pending = null;
    }
    // Fail remaining queued
    while (state.queue.length) {
      const { entry, resolve } = state.queue.shift();
      resolve({
        idx: entry.idx,
        name: entry.name,
        url: entry.url,
        workerId: worker.id,
        status: "error",
        failureClass: "env_fail",
        error: `worker exited ${code} before processing`,
        finishedAt: new Date().toISOString(),
      });
    }
  });

  return state;
}

function pump(state) {
  if (state.closed || state.busy || !state.queue.length) return;
  const item = state.queue.shift();
  state.busy = true;
  state.pending = item;
  try {
    state.child.stdin.write(JSON.stringify(item.entry) + "\n");
  } catch (e) {
    state.busy = false;
    state.pending = null;
    item.resolve({
      idx: item.entry.idx,
      name: item.entry.name,
      url: item.entry.url,
      workerId: state.worker.id,
      status: "error",
      failureClass: "env_fail",
      error: `stdin write failed: ${e?.message || e}`,
      finishedAt: new Date().toISOString(),
    });
  }
}

function enqueue(state, entry) {
  return new Promise((resolve) => {
    state.queue.push({ entry, resolve });
    pump(state);
  });
}

async function stopWorker(state) {
  if (state.closed) return;
  try {
    state.child.stdin.write("__STOP__\n");
    state.child.stdin.end();
  } catch {
    /* ignore */
  }
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        state.child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      resolve();
    }, 120000);
    state.child.on("close", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function runBootstrap() {
  if (process.env.TH_BATCH_SKIP_BOOTSTRAP === "1") {
    console.log("[orch] skip bootstrap");
    return;
  }
  console.log("[orch] bootstrap workers…");
  await new Promise((resolvePromise, reject) => {
    const child = spawn("bun", [bootstrapScript], {
      env: {
        ...process.env,
        TH_BATCH_WORKERS: workers.map((w) => w.user).join(","),
        TH_BATCH_CONCURRENCY: String(concurrency),
      },
      cwd: resolve(BATCH_DIR, "../.."),
      stdio: "inherit",
    });
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`bootstrap exited ${code}`));
    });
  });
}

async function main() {
  console.log("[orch] skill-aligned batch (long-lived workers)", {
    concurrency,
    workers: workers.map((w) => w.user),
    count: slice.length,
    startIdx,
  });

  if (!existsSync(urlsPath)) throw new Error(`URLs file missing: ${urlsPath}`);

  await ensureVmRunning();
  await preflightUnlockAll();
  await runBootstrap();
  // Unlock again after bootstrap (bootstrap acquires+releases and may leave host-PID lock).
  await preflightUnlockAll();

  const workerStates = workers.map((w) => startLongLivedWorker(w));
  // Round-robin assign URLs
  const summary = [];
  let done = 0;
  const total = slice.length;
  let rr = 0;

  // Process with bounded in-flight = number of workers
  const inflight = new Set();
  async function schedule(entry) {
    const state = workerStates[rr % workerStates.length];
    rr += 1;
    const p = enqueue(state, entry).then((outcome) => {
      summary.push(outcome);
      done += 1;
      writeProgress(done, total, outcome);
      console.log(
        `[orch] progress ${done}/${total} last=${outcome?.status} ${outcome?.name || ""}`,
      );
      inflight.delete(p);
    });
    inflight.add(p);
    // Keep at most N in flight (one per worker queue depth is fine; wait if all busy deeply)
    if (inflight.size >= workerStates.length * 2) {
      await Promise.race(inflight);
    }
  }

  try {
    for (const entry of slice) {
      await schedule(entry);
    }
    await Promise.all([...inflight]);
  } finally {
    console.log("[orch] stopping workers…");
    await Promise.all(workerStates.map((s) => stopWorker(s)));
    await preflightUnlockAll();
  }

  writeFileSync(join(BATCH_DIR, "summary/summary.json"), JSON.stringify(summary, null, 2));
  const ok = summary.filter((s) => s.status === "success").length;
  const failed = summary.filter((s) => s.status === "failed" || s.status === "error").length;
  const blocked = summary.filter((s) => s.status === "blocked").length;
  const final = {
    finishedAt: new Date().toISOString(),
    total: summary.length,
    success: ok,
    failed,
    blocked,
    concurrency,
    workers: workers.map((w) => w.user),
    mode: "long-lived-prefix",
  };
  writeFileSync(
    join(BATCH_DIR, "final-summary-skill.json"),
    JSON.stringify(final, null, 2),
  );
  console.log("[orch] finished", final);
}

await main();
