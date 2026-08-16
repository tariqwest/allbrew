#!/usr/bin/env bun
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const endpoint = process.argv[2];
const listFile = process.argv[3];
const src = process.argv[4];
const branch = process.argv[5];

if (!endpoint || !listFile || !src || !branch) {
  console.error("Usage: bun smoke-batch.mjs <endpoint> <listFile> <src> <branch>");
  process.exit(2);
}

const PER_URL_TIMEOUT_MS = Number(process.env.TH_SMOKE_PER_URL_TIMEOUT_MS) || 3 * 60 * 1000;

const list = JSON.parse(readFileSync(listFile, "utf8"));
const outcomesPath = resolve(src, "tests/monitored-install-batch/logs/smoke-outcomes.jsonl");
mkdirSync(resolve(src, "tests/monitored-install-batch/logs"), { recursive: true });

for (const entry of list) {
  const { name, url } = entry;
  const log = resolve(src, `tests/monitored-install-batch/logs/smoke-${endpoint}-${name}-${Date.now()}.log`);
  console.log(`[smoke ${endpoint}] ${name}: ${url} -> ${log}`);
  const started = Date.now();

  const child = spawn(
    "bun",
    [
      resolve(src, "tests/monitored-install-batch/vm-install-one.mjs"),
      "--url",
      url,
      "--name",
      name,
      "--endpoint",
      endpoint,
      "--allbrew-src",
      src,
      "--allbrew-branch",
      branch,
      "--log",
      log,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GITHUB_TOKEN: process.env.GITHUB_TOKEN || "" },
    },
  );

  const chunks = [];
  child.stdout.on("data", (d) => chunks.push(d.toString()));
  child.stderr.on("data", (d) => chunks.push(d.toString()));

  let exitCode = null;
  let status = "pending";
  let timeout = false;

  const timer = setTimeout(() => {
    timeout = true;
    console.log(`[smoke ${endpoint}] ${name} timed out after ${PER_URL_TIMEOUT_MS}ms; killing child`);
    try { child.kill("SIGKILL"); } catch {}
    try { child.kill("SIGTERM"); } catch {}
  }, PER_URL_TIMEOUT_MS);

  await new Promise((resolvePromise) => {
    child.on("close", (code) => {
      clearTimeout(timer);
      exitCode = code;
      status = timeout
        ? "failed_system_timeout"
        : code === 0
          ? "success"
          : "failed";
      try {
        // vm-install-one already wrote the full guest transcript to this path;
        // append the orchestrator's captured child output instead of overwriting.
        appendFileSync(log, chunks.join(""));
      } catch (e) {
        console.error(`[smoke ${endpoint}] ${name} failed to write log: ${e.message}`);
      }
      const finished = Date.now();
      const durationMs = finished - started;
      const outcome = {
        runId: `${endpoint}-${name}-${finished}`,
        name,
        url,
        endpoint,
        exitCode,
        durationMs,
        status,
        finishedAt: new Date(finished).toISOString(),
      };
      try {
        appendFileSync(outcomesPath, JSON.stringify(outcome) + "\n");
      } catch (e) {
        console.error(`[smoke ${endpoint}] ${name} failed to write outcome: ${e.message}`);
      }
      console.log(`[smoke ${endpoint}] ${name} finished with status=${status} code=${exitCode} durationMs=${durationMs}`);
      resolvePromise();
    });
  });
}
