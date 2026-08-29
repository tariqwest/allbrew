#!/usr/bin/env bun
/**
 * Apply the persisted rustup + native-clang toolchain to every enabled VM endpoint.
 * Idempotent: safe to re-run after hygiene cleanups or VM recreation.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  listEnabledEndpoints,
  acquireEndpointMutex,
  releaseEndpointMutex,
  applyEndpointEnv,
} from "./lib/vm-pool.mjs";
import { loadHarness, guest } from "./lib/guest-ops.mjs";

const SCRIPT_PATH = resolve(
  import.meta.dir,
  "lib",
  "setup-vm-toolchain.sh",
);

process.env.TH_PROJECT_USER = process.env.TH_PROJECT_USER || "th-allbrew";
process.env.TH_HOMEBREW_MOUNT_POINT =
  process.env.TH_HOMEBREW_MOUNT_POINT || "/opt/homebrew";
process.env.TH_HOMEBREW_LOCK_PATH =
  process.env.TH_HOMEBREW_LOCK_PATH || "/var/run/lume-homebrew.lock";

const script = readFileSync(SCRIPT_PATH, "utf8");

async function setupOne(endpoint) {
  const owner = `setup-vm-toolchain-${process.pid}`;
  let lock;
  try {
    lock = await acquireEndpointMutex(endpoint, owner);
  } catch (e) {
    console.error(`[toolchain] could not lock ${endpoint.id}: ${e.message}`);
    return { ok: false, error: e.message };
  }

  applyEndpointEnv(endpoint);
  process.env.TH_VM_WORKSPACE = "/Users/th-allbrew";

  const h = await loadHarness();
  const session = await h.acquireHomebrewPrefix();
  const result = await guest(
    h.runAsProjectUser,
    session,
    script,
    `toolchain-setup-${endpoint.id}`,
    { timeout: 600000, stream: true },
  );
  await h.releaseHomebrewPrefix(session);

  releaseEndpointMutex(endpoint, lock);

  const ok = result.exitCode === 0;
  console.log(
    `[toolchain] ${endpoint.id}: ${ok ? "OK" : `failed (exit ${result.exitCode})`}`,
  );
  if (!ok && result.stdout) {
    console.error(result.stdout.slice(-2000));
  }
  return { ok, exitCode: result.exitCode, output: result.stdout };
}

const endpoints = listEnabledEndpoints();
if (!endpoints.length) {
  console.error("[toolchain] no enabled VM pool endpoints");
  process.exit(2);
}

const results = [];
for (const endpoint of endpoints) {
  results.push(await setupOne(endpoint));
}

const allOk = results.every((r) => r.ok);
process.exit(allOk ? 0 : 1);
