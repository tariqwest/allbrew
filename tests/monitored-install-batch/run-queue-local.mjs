#!/usr/bin/env bun
/**
 * Host-side queue driver for the monitored-install batch.
 *
 * Reads agent-queue.json, picks queued items, runs vm-install-one.mjs per item
 * across the two enabled VM endpoints (local + homeserver), and updates the
 * queue status/result for each completed item.
 *
 * Usage:
 *   bun tests/monitored-install-batch/run-queue-local.mjs [--limit N] [--once]
 *
 * Env:
 *   TH_BATCH_MAX_RUNS=0            # max items to process (0 = unlimited)
 *   TH_BATCH_INSTALL_TIMEOUT_MS=720000
 */
import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { listEnabledEndpoints } from "./lib/vm-pool.mjs";

const BATCH_DIR = resolve(import.meta.dir);
const REPO_ROOT = resolve(BATCH_DIR, "../..");
const QUEUE_PATH = join(BATCH_DIR, "state/agent-queue.json");
const INDEX_PATH = join(BATCH_DIR, "state/index.jsonl");
const WORKER_RUN = join(BATCH_DIR, "worker-run-one.mjs");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function loadQueue() {
  return JSON.parse(readFileSync(QUEUE_PATH, "utf8"));
}

function saveQueue(q) {
  q.updatedAt = new Date().toISOString();
  writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2) + "\n");
}

function slugify(name, url) {
  return (
    (name || url || "pkg")
      .toLowerCase()
      .replace(/https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "pkg"
  );
}

function runOne(item) {
  return new Promise((resolvePromise) => {
    const slug = slugify(item.name, item.url);
    const endpoint = item.endpoint || "local";
    const args = [
      WORKER_RUN,
      "--url",
      item.url,
      "--name",
      slug,
      "--idx",
      String(item.idx),
      "--endpoint",
      endpoint,
    ];
    const child = spawn("bun", args, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        TH_BATCH_INSTALL_TIMEOUT_MS: "720000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      const outcomeMatch = stdout.match(/OUTCOME_JSON=(.+)/);
      let outcomeData = null;
      if (outcomeMatch) {
        try {
          outcomeData = JSON.parse(outcomeMatch[1]);
        } catch {}
      }

      const exitMatch = stdout.match(/EXIT_CODE=(\d+)/);
      const pkgMatch = stdout.match(/PACKAGE=(\S+)/);
      const verifyMatch = stdout.match(/VERIFY_OK=(true|false)/);

      const outcome = {
        idx: item.idx,
        name: item.name,
        url: item.url,
        slug,
        endpoint,
        exitCode: outcomeData?.exitCode ?? (exitMatch ? Number(exitMatch[1]) : (code ?? 1)),
        packageName: outcomeData?.packageName ?? (pkgMatch ? pkgMatch[1] : slug),
        verifyOk: outcomeData?.verifyOk ?? (verifyMatch ? verifyMatch[1] === "true" : false),
        status: outcomeData?.status ?? (code === 0 ? "success" : "failed"),
        failureClass: outcomeData?.failureClass ?? null,
        runId: outcomeData?.runId ?? null,
        batchRunId: outcomeData?.batchRunId ?? null,
        fixPackage: outcomeData?.fixPackage ?? null,
        processExitCode: code ?? 1,
        stderrTail: stderr.split("\n").slice(-5).join("\n"),
        finishedAt: new Date().toISOString(),
      };
      resolvePromise(outcome);
    });
  });
}

function appendIndex(outcome) {
  if (!existsSync(INDEX_PATH)) {
    writeFileSync(INDEX_PATH, "");
  }
  const line =
    JSON.stringify({
      ...outcome,
      source: "run-queue-local",
    }) + "\n";
  writeFileSync(INDEX_PATH, readFileSync(INDEX_PATH, "utf8") + line);
}

async function main() {
  const once = process.argv.includes("--once");
  const maxRuns = Number(arg("--limit", "0")) || 0;

  let processed = 0;
  while (true) {
    if (maxRuns && processed >= maxRuns) {
      console.log(`[run-queue-local] reached limit ${maxRuns}; stopping.`);
      break;
    }

    const q = loadQueue();
    const queued = q.items.filter((i) => i.status === "queued");
    if (!queued.length) {
      console.log("[run-queue-local] no queued items remaining; done.");
      break;
    }

    // Dynamically query enabled VM pool endpoints (e.g. local-1, local-2, homeserver)
    const activeEndpoints = listEnabledEndpoints().map((e) => e.id);
    const endpoints = activeEndpoints.length ? activeEndpoints : ["local-1"];
    const concurrency = endpoints.length;
    const batch = queued.slice(0, concurrency).map((item, i) => {
      item.status = "running";
      item.launchedAt = new Date().toISOString();
      item.endpoint = endpoints[i % endpoints.length];
      return item;
    });
    saveQueue(q);

    console.log(
      `[run-queue-local] running batch: ${batch.map((i) => `idx=${i.idx}(@${i.endpoint})`).join(", ")}`,
    );
    const outcomes = await Promise.all(batch.map((item) => runOne(item)));

    const q2 = loadQueue();
    for (const outcome of outcomes) {
      const it = q2.items.find((i) => i.idx === outcome.idx);
      if (it) {
        it.status = outcome.status;
        it.finishedAt = outcome.finishedAt;
        it.exitCode = outcome.exitCode;
        it.packageName = outcome.packageName;
        it.verifyOk = outcome.verifyOk;
        it.failureClass = outcome.failureClass;
        it.runId = outcome.runId;
        it.fixPackage = outcome.fixPackage;
        it.endpoint = outcome.endpoint;
      }
      appendIndex(outcome);
      console.log(
        `[run-queue-local] idx=${outcome.idx} -> ${outcome.status} class=${outcome.failureClass || 'ok'} exit=${outcome.exitCode} verify=${outcome.verifyOk}`,
      );
    }
    saveQueue(q2);

    processed += batch.length;
    if (once) break;
  }
}

await main();
