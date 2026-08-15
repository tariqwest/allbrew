#!/usr/bin/env bun
/**
 * Dual-endpoint Lume pool: homeserver (remote) + local twin.
 * Each endpoint has its own host mutex so two installs can run in parallel.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";

const BATCH_DIR = resolve(import.meta.dir, "..");
const POOL_PATH = join(BATCH_DIR, "vm-pool.json");
const STATE_PATH = join(BATCH_DIR, "logs", "vm-pool-state.json");

const DEFAULT_POLL_MS = Number(process.env.TH_VM_MUTEX_POLL_MS || 5000);
const DEFAULT_MAX_MS = Number(process.env.TH_VM_MUTEX_MAX_MS || 45 * 60 * 1000);

export function loadPoolConfig() {
  if (!existsSync(POOL_PATH)) {
    return {
      strategy: "least-busy",
      endpoints: [
        {
          id: "homeserver",
          enabled: true,
          env: { LUME_REMOTE_ENABLED: "true" },
          mutexDir: "logs/vm-mutex-homeserver.lockdir",
        },
      ],
    };
  }
  return JSON.parse(readFileSync(POOL_PATH, "utf8"));
}

function loadState() {
  try {
    if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    /* ignore */
  }
  return { busy: {}, lastAssigned: {} };
}

function saveState(state) {
  mkdirSync(join(BATCH_DIR, "logs"), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

function mutexAbs(rel) {
  return resolve(BATCH_DIR, rel);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isEndpointLocked(endpoint) {
  const dir = mutexAbs(endpoint.mutexDir);
  if (!existsSync(dir)) return false;
  try {
    const holder = readFileSync(join(dir, "owner"), "utf8").trim();
    // owner: "pid\towner\tid\tiso" (preferred) or legacy "pidOwnerEndpointIso"
    const pidMatch = String(holder).match(/^(\d+)/);
    const pid = pidMatch ? Number(pidMatch[1]) : Number(String(holder).split("\t")[0]);
    if (pid && !isAlive(pid)) {
      rmSync(dir, { recursive: true, force: true });
      return false;
    }
  } catch {
    /* treat as locked */
  }
  return existsSync(dir);
}

export function listEnabledEndpoints() {
  const pool = loadPoolConfig();
  return (pool.endpoints || []).filter((e) => e.enabled !== false);
}

/** Prefer free endpoints; among them least-busy / oldest assignment. */
export function pickEndpoint() {
  const enabled = listEnabledEndpoints();
  if (!enabled.length) throw new Error("No enabled VM pool endpoints");
  const state = loadState();
  const free = enabled.filter((e) => !isEndpointLocked(e));
  const candidates = free.length ? free : enabled;
  candidates.sort((a, b) => {
    const ba = state.busy?.[a.id] || 0;
    const bb = state.busy?.[b.id] || 0;
    if (ba !== bb) return ba - bb;
    const la = state.lastAssigned?.[a.id] || 0;
    const lb = state.lastAssigned?.[b.id] || 0;
    return la - lb;
  });
  return candidates[0];
}

export async function acquireEndpointMutex(endpoint, owner) {
  const dir = mutexAbs(endpoint.mutexDir);
  mkdirSync(join(BATCH_DIR, "logs"), { recursive: true });
  const started = Date.now();
  let attempt = 0;
  while (Date.now() - started < DEFAULT_MAX_MS) {
    attempt += 1;
    try {
      mkdirSync(dir);
      writeFileSync(
        join(dir, "owner"),
        `${process.pid}\t${owner}\t${endpoint.id}\t${new Date().toISOString()}\n`,
      );
      const state = loadState();
      state.busy = state.busy || {};
      state.lastAssigned = state.lastAssigned || {};
      state.busy[endpoint.id] = (state.busy[endpoint.id] || 0) + 1;
      state.lastAssigned[endpoint.id] = Date.now();
      saveState(state);
      console.error(
        `[vm-pool] acquired endpoint=${endpoint.id} owner=${owner} pid=${process.pid} attempt=${attempt}`,
      );
      return { endpoint, dir };
    } catch (e) {
      if (e && (e.code === "EEXIST" || e.code === "EPERM")) {
        let holder = "unknown";
        try {
          holder = readFileSync(join(dir, "owner"), "utf8").trim();
        } catch {
          /* ignore */
        }
        try {
          const pid = Number(String(holder).split("\t")[0]);
          if (pid && !isAlive(pid)) {
            console.error(
              `[vm-pool] clearing stale mutex endpoint=${endpoint.id} deadPid=${pid}`,
            );
            rmSync(dir, { recursive: true, force: true });
            continue;
          }
        } catch {
          /* ignore */
        }
        if (attempt === 1 || attempt % 6 === 0) {
          console.error(
            `[vm-pool] waiting endpoint=${endpoint.id} heldBy=${holder} attempt=${attempt}`,
          );
        }
        await new Promise((r) => setTimeout(r, DEFAULT_POLL_MS));
        continue;
      }
      throw e;
    }
  }
  throw new Error(
    `Could not acquire VM pool mutex for ${endpoint.id} within ${DEFAULT_MAX_MS}ms`,
  );
}

export function releaseEndpointMutex(lease) {
  if (!lease?.dir) return;
  try {
    if (existsSync(lease.dir)) {
      rmSync(lease.dir, { recursive: true, force: true });
      console.error(
        `[vm-pool] released endpoint=${lease.endpoint?.id} pid=${process.pid}`,
      );
    }
    const state = loadState();
    if (lease.endpoint?.id && state.busy?.[lease.endpoint.id]) {
      state.busy[lease.endpoint.id] = Math.max(
        0,
        state.busy[lease.endpoint.id] - 1,
      );
      saveState(state);
    }
  } catch (e) {
    console.error(`[vm-pool] release failed: ${e?.message || e}`);
  }
}

/** Apply endpoint env before loadHarness(). */
export function applyEndpointEnv(endpoint) {
  const env = endpoint.env || {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined || v === null) continue;
    process.env[k] = String(v);
  }
  if (env.LUME_REMOTE_ENABLED === "false" || env.LUME_REMOTE_ENABLED === false) {
    process.env.LUME_REMOTE_ENABLED = "false";
  }
  // Batch mode does not stage a project workspace under /Volumes/Shared;
  // run commands from the project user's home and let vm-install-one sync
  // the source branch it needs.
  process.env.TH_VM_WORKSPACE = "/Users/th-allbrew";
  console.error(
    `[vm-pool] using endpoint=${endpoint.id} remote=${process.env.LUME_REMOTE_ENABLED} vm=${process.env.LUME_VM_NAME}`,
  );
}

/** Acquire least-busy free endpoint (or wait on least-busy if all busy). */
export async function acquirePoolSlot(owner) {
  // Try free endpoints first in least-busy order; if none free, wait on preferred.
  const enabled = listEnabledEndpoints();
  if (!enabled.length) throw new Error("No enabled VM pool endpoints");

  // Fast path: any free endpoint
  const free = enabled.filter((e) => !isEndpointLocked(e));
  if (free.length) {
    free.sort((a, b) => {
      const state = loadState();
      return (state.lastAssigned?.[a.id] || 0) - (state.lastAssigned?.[b.id] || 0);
    });
    // Prefer free endpoints; try each once without long wait, then fall through
    for (const ep of free) {
      try {
        const lease = await acquireEndpointMutexWithTimeout(ep, owner, 100);
        applyEndpointEnv(ep);
        return lease;
      } catch {
        /* try next free */
      }
    }
  }

  const endpoint = pickEndpoint();
  const lease = await acquireEndpointMutex(endpoint, owner);
  applyEndpointEnv(endpoint);
  return lease;
}

async function acquireEndpointMutexWithTimeout(endpoint, owner, maxMs) {
  const dir = mutexAbs(endpoint.mutexDir);
  mkdirSync(join(BATCH_DIR, "logs"), { recursive: true });
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      mkdirSync(dir);
      writeFileSync(
        join(dir, "owner"),
        `${process.pid}\t${owner}\t${endpoint.id}\t${new Date().toISOString()}\n`,
      );
      const state = loadState();
      state.busy = state.busy || {};
      state.lastAssigned = state.lastAssigned || {};
      state.busy[endpoint.id] = (state.busy[endpoint.id] || 0) + 1;
      state.lastAssigned[endpoint.id] = Date.now();
      saveState(state);
      console.error(
        `[vm-pool] acquired endpoint=${endpoint.id} owner=${owner} pid=${process.pid} (fast)`,
      );
      return { endpoint, dir };
    } catch (e) {
      if (e && (e.code === "EEXIST" || e.code === "EPERM")) {
        await new Promise((r) => setTimeout(r, 20));
        continue;
      }
      throw e;
    }
  }
  throw new Error("fast acquire timeout");
}
