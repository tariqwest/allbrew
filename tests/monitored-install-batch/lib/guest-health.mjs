#!/usr/bin/env bun
/**
 * Guest / VM-pool health probes for monitored-install-batch.
 *
 * Read-only by default: does not acquire exclusive Homebrew, does not mutate
 * guest mounts. Clears host-side mutex dirs only when the holder PID is dead
 * and clearStaleMutex is true.
 */
import {
  existsSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  listEnabledEndpoints,
  loadPoolConfig,
  isEndpointLocked,
} from "./vm-pool.mjs";

const BATCH_DIR = resolve(import.meta.dir, "..");
const DEFAULT_SSH_TIMEOUT_S = Number(process.env.TH_GUEST_HEALTH_SSH_TIMEOUT_S || 15);
const DEFAULT_CMD_TIMEOUT_MS = Number(
  process.env.TH_GUEST_HEALTH_CMD_TIMEOUT_MS || 45000,
);

function mutexAbs(rel) {
  return resolve(BATCH_DIR, rel);
}

function isAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Parse mutex owner file (tab-separated or legacy concatenated). */
export function parseMutexOwner(raw) {
  const line = String(raw || "").trim().split(/\r?\n/)[0] || "";
  if (!line) return null;
  if (line.includes("\t")) {
    const [pidS, owner = "", endpointId = "", ts = ""] = line.split("\t");
    const pid = Number(pidS);
    return {
      raw: line,
      pid: Number.isFinite(pid) ? pid : null,
      owner: owner || null,
      endpointId: endpointId || null,
      ts: ts || null,
    };
  }
  const m = line.match(
    /^(\d+)(.+?)(homeserver|local-\d+|local)(\d{4}-\d{2}-\d{2}T.+)?$/,
  );
  if (m) {
    return {
      raw: line,
      pid: Number(m[1]),
      owner: m[2] || null,
      endpointId: m[3] || null,
      ts: m[4] || null,
    };
  }
  const pidOnly = line.match(/^(\d+)/);
  return {
    raw: line,
    pid: pidOnly ? Number(pidOnly[1]) : null,
    owner: null,
    endpointId: null,
    ts: null,
  };
}

export function readMutexStatus(endpoint, { clearStale = false } = {}) {
  const dir = mutexAbs(endpoint.mutexDir || `logs/vm-mutex-${endpoint.id}.lockdir`);
  if (!existsSync(dir)) {
    return { locked: false, path: dir, holder: null, pidAlive: false, cleared: false };
  }
  let raw = "";
  try {
    raw = readFileSync(join(dir, "owner"), "utf8");
  } catch {
    return {
      locked: true,
      path: dir,
      holder: null,
      pidAlive: false,
      cleared: false,
      error: "owner file unreadable",
    };
  }
  const holder = parseMutexOwner(raw);
  const pidAlive = isAlive(holder?.pid);
  if (holder?.pid && !pidAlive && clearStale) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return {
        locked: false,
        path: dir,
        holder,
        pidAlive: false,
        cleared: true,
      };
    } catch (e) {
      return {
        locked: true,
        path: dir,
        holder,
        pidAlive: false,
        cleared: false,
        error: `failed to clear stale mutex: ${e?.message || e}`,
      };
    }
  }
  return {
    locked: true,
    path: dir,
    holder,
    pidAlive,
    cleared: false,
  };
}

function q(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/** Strip terminal OSC / ANSI noise (e.g. Warp bash_profile hooks) that break JSON.parse. */
export function scrubOutput(text) {
  return String(text || "")
    .replace(/\u001bP[^\u001b]*\u001b\\/g, "")
    .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\r/g, "");
}

/**
 * Run a shell command with an endpoint env overlay (does not mutate process.env).
 * Uses non-login bash so host/profile hooks cannot inject OSC into stdout.
 */
export async function runWithEnv(baseEnv, cmd, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CMD_TIMEOUT_MS;
  const env = { ...baseEnv };
  for (const [k, v] of Object.entries(opts.env || {})) {
    if (v === undefined || v === null) continue;
    env[k] = String(v);
  }
  // Prefer a clean PATH for local lume/ssh without loading interactive rc files.
  if (!env.PATH) {
    env.PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  } else if (!env.PATH.includes("/opt/homebrew/bin")) {
    env.PATH = `/opt/homebrew/bin:${env.PATH}`;
  }
  const proc = Bun.spawn(["bash", "--noprofile", "--norc", "-c", cmd], {
    env,
    stdout: "pipe",
    stderr: "pipe",
    cwd: opts.cwd || BATCH_DIR,
  });
  let timedOut = false;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          try {
            proc.kill();
          } catch {
            /* ignore */
          }
        }, timeoutMs)
      : null;
  const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (timer) clearTimeout(timer);
  return {
    exitCode: timedOut ? 124 : exitCode,
    stdout: scrubOutput(stdoutBuf || ""),
    stderr: scrubOutput(stderrBuf || ""),
    timedOut,
  };
}

/** Extract first JSON value (object or array) from mixed stdout. */
export function extractJson(text) {
  const s = scrubOutput(text).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  const start = s.search(/[\[{]/);
  if (start < 0) return null;
  const open = s[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === open) depth += 1;
    else if (s[i] === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function endpointBaseEnv(endpoint) {
  const env = { ...process.env };
  for (const [k, v] of Object.entries(endpoint.env || {})) {
    if (v === undefined || v === null) continue;
    env[k] = String(v);
  }
  if (
    endpoint.env?.LUME_REMOTE_ENABLED === "false" ||
    endpoint.env?.LUME_REMOTE_ENABLED === false
  ) {
    env.LUME_REMOTE_ENABLED = "false";
  }
  return env;
}

function isRemote(endpoint) {
  const v = endpoint.env?.LUME_REMOTE_ENABLED;
  return v === true || v === "true" || v === "1";
}

function hostWrap(endpoint, innerCmd) {
  if (!isRemote(endpoint)) return innerCmd;
  const host = endpoint.env?.LUME_REMOTE_HOST || process.env.LUME_REMOTE_HOST;
  if (!host) {
    return `echo 'missing LUME_REMOTE_HOST' >&2; exit 2`;
  }
  // Non-interactive remote shell: avoid profile OSC noise + ensure lume on PATH.
  const wrapped = `export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; ${innerCmd}`;
  return `ssh -q -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ${q(
    host,
  )} bash --noprofile --norc -c ${q(wrapped)}`;
}

function lumeBin(endpoint) {
  // Prefer PATH on host / remote; no absolute path required.
  return "lume";
}

/**
 * Probe one pool endpoint for guest usability.
 * @param {object} endpoint from vm-pool.json
 * @param {{ deep?: boolean, clearStaleMutex?: boolean, sshTimeoutS?: number }} opts
 */
export async function probeEndpoint(endpoint, opts = {}) {
  const deep = opts.deep === true;
  const clearStaleMutex = opts.clearStaleMutex === true;
  const sshTimeoutS = opts.sshTimeoutS ?? DEFAULT_SSH_TIMEOUT_S;
  const issues = [];
  const checkedAt = new Date().toISOString();
  const env = endpointBaseEnv(endpoint);
  const remote = isRemote(endpoint);
  const vmName = endpoint.env?.LUME_VM_NAME || process.env.LUME_VM_NAME || "";
  const projectUser = endpoint.env?.TH_PROJECT_USER || "th-allbrew";
  const mountPoint = endpoint.env?.TH_HOMEBREW_MOUNT_POINT || "/opt/homebrew";
  const lockPath = endpoint.env?.TH_HOMEBREW_LOCK_PATH || "/var/run/lume-homebrew.lock";

  const result = {
    id: endpoint.id,
    label: endpoint.label || endpoint.id,
    enabled: endpoint.enabled !== false,
    checkedAt,
    remote,
    vmName,
    usable: false,
    guestOk: false,
    free: false,
    status: "unknown",
    issues: [],
    mutex: null,
    remoteHost: null,
    lume: null,
    vm: null,
    ssh: null,
    guest: null,
  };

  if (!result.enabled) {
    result.status = "disabled";
    result.issues.push("endpoint disabled in vm-pool.json");
    result.issues = issues.concat(result.issues);
    return result;
  }

  // --- mutex (host-side) ---
  result.mutex = readMutexStatus(endpoint, { clearStale: clearStaleMutex });
  result.free = !result.mutex.locked;
  if (result.mutex.locked) {
    const h = result.mutex.holder;
    if (result.mutex.pidAlive) {
      issues.push(
        `mutex held by pid=${h?.pid ?? "?"} owner=${h?.owner ?? "?"} since=${h?.ts ?? "?"}`,
      );
    } else if (h?.pid) {
      issues.push(
        `mutex held by dead pid=${h.pid} owner=${h.owner ?? "?"} (stale${
          result.mutex.cleared ? "; cleared" : "; not cleared"
        })`,
      );
    } else {
      issues.push(`mutex locked (${result.mutex.error || "unknown holder"})`);
    }
  }

  // --- remote host reachability ---
  if (remote) {
    const host = endpoint.env?.LUME_REMOTE_HOST;
    if (!host) {
      issues.push("LUME_REMOTE_ENABLED but LUME_REMOTE_HOST missing");
      result.remoteHost = { ok: false, error: "missing LUME_REMOTE_HOST" };
    } else {
      const r = await runWithEnv(
        env,
        `ssh -q -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new ${q(
          host,
        )} 'echo REMOTE_OK; hostname; uname -m'`,
        { timeoutMs: 20000 },
      );
      const ok = r.exitCode === 0 && /REMOTE_OK/.test(r.stdout);
      result.remoteHost = {
        ok,
        host,
        exitCode: r.exitCode,
        stdout: (r.stdout || "").trim().slice(0, 400),
        stderr: (r.stderr || "").trim().slice(0, 400),
        timedOut: r.timedOut,
      };
      if (!ok) {
        issues.push(
          `remote host SSH failed (${host}): ${
            r.timedOut ? "timeout" : (r.stderr || r.stdout || `exit ${r.exitCode}`).split("\n")[0]
          }`,
        );
        result.status = "remote_unreachable";
        result.issues = issues;
        return finalize(result, issues);
      }
    }
  }

  // --- lume CLI ---
  {
    const r = await runWithEnv(
      env,
      hostWrap(endpoint, `command -v ${lumeBin(endpoint)} && ${lumeBin(endpoint)} --help >/dev/null 2>&1; echo LUME_OK=$?`),
      { timeoutMs: 20000 },
    );
    const ok = r.exitCode === 0 && /LUME_OK=0/.test(r.stdout);
    result.lume = {
      ok,
      exitCode: r.exitCode,
      detail: (r.stdout || r.stderr || "").trim().slice(0, 300),
    };
    if (!ok) {
      issues.push(`lume CLI not available on ${remote ? "remote host" : "local host"}`);
      result.status = "lume_missing";
      result.issues = issues;
      return finalize(result, issues);
    }
  }

  if (!vmName) {
    issues.push("LUME_VM_NAME not set for endpoint");
    result.status = "misconfigured";
    result.issues = issues;
    return finalize(result, issues);
  }

  // --- VM state ---
  {
    const r = await runWithEnv(
      env,
      hostWrap(
        endpoint,
        `${lumeBin(endpoint)} get ${q(vmName)} --format json 2>/dev/null || echo '{}'`,
      ),
      { timeoutMs: 30000 },
    );
    let state = "missing";
    let ip = "";
    let sshAvailable = null;
    let rawSnippet = (r.stdout || "").trim().slice(0, 500);
    const parsed = extractJson(r.stdout || "");
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    if (entry && (entry.status || entry.name || entry.ipAddress)) {
      state = entry.status || "unknown";
      ip = entry.ipAddress || entry.ip || "";
      if (typeof entry.sshAvailable === "boolean") {
        sshAvailable = entry.sshAvailable;
      }
    } else if (r.exitCode !== 0) {
      state = "missing";
    } else {
      state = "unknown";
    }
    result.vm = {
      name: vmName,
      state,
      ip,
      sshAvailable,
      exitCode: r.exitCode,
      raw: rawSnippet,
    };
    if (state === "missing") {
      issues.push(`VM '${vmName}' missing (lume get failed)`);
      result.status = "vm_missing";
      result.issues = issues;
      return finalize(result, issues);
    }
    if (state !== "running") {
      issues.push(`VM '${vmName}' state=${state} (not running)`);
      result.status = "vm_stopped";
      result.issues = issues;
      return finalize(result, issues);
    }
    if (sshAvailable === false) {
      issues.push(
        `lume reports sshAvailable=false for '${vmName}' (Remote Login / guest SSH not ready)`,
      );
      // Still attempt lume ssh below for a concrete error, but pre-flag.
    }
  }

  // --- guest SSH (lume ssh) ---
  {
    const r = await runWithEnv(
      env,
      hostWrap(
        endpoint,
        `${lumeBin(endpoint)} ssh ${q(vmName)} --timeout ${sshTimeoutS} 'echo SSH_OK; hostname; whoami; date -u +%Y-%m-%dT%H:%M:%SZ'`,
      ),
      { timeoutMs: (sshTimeoutS + 10) * 1000 },
    );
    const ok = r.exitCode === 0 && /SSH_OK/.test(r.stdout);
    const errLine = (r.stderr || r.stdout || "")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-3)
      .join(" | ");
    result.ssh = {
      ok,
      exitCode: r.exitCode,
      timedOut: r.timedOut,
      error: ok ? null : errLine.slice(0, 500),
      stdout: (r.stdout || "").trim().slice(0, 400),
    };
    if (!ok) {
      const sshHint =
        /SSH is not available|Remote Login|Connection refused|Permission denied|timed out|Timeout/i.test(
          errLine,
        )
          ? errLine
          : errLine || `lume ssh exit ${r.exitCode}`;
      issues.push(`guest SSH failed: ${sshHint}`);
      result.status = "ssh_unavailable";
      result.issues = issues;
      return finalize(result, issues);
    }
    result.guestOk = true;
  }

  // --- light guest facts (still no exclusive brew acquire) ---
  {
    const probe = [
      "set +e",
      "echo GUEST_PROBE_BEGIN",
      "id -un",
      "id -un th-allbrew 2>/dev/null || echo NO_PROJECT_USER",
      `df -h ${q(mountPoint)} 2>/dev/null | tail -1 || df -h / | tail -1`,
      `if mount | grep -q " on ${mountPoint} "; then echo HB_MOUNT=mounted; else echo HB_MOUNT=absent; fi`,
      `if [ -e ${q(lockPath)} ]; then echo HB_LOCK=present; cat ${q(lockPath)}/pid 2>/dev/null | sed 's/^/HB_LOCK_PID=/'; else echo HB_LOCK=absent; fi`,
      "echo GUEST_PROBE_END",
    ].join("; ");
    const r = await runWithEnv(
      env,
      hostWrap(
        endpoint,
        `${lumeBin(endpoint)} ssh ${q(vmName)} --timeout ${sshTimeoutS} ${q(probe)}`,
      ),
      { timeoutMs: (sshTimeoutS + 15) * 1000 },
    );
    const out = r.stdout || "";
    const diskLine =
      out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => /\d+%/.test(l) && /\//.test(l)) || null;
    const hbMount = /HB_MOUNT=(\w+)/.exec(out)?.[1] || null;
    const hbLock = /HB_LOCK=(\w+)/.exec(out)?.[1] || null;
    const hbLockPid = /HB_LOCK_PID=(\S+)/.exec(out)?.[1] || null;
    const hasProjectUser = !/NO_PROJECT_USER/.test(out) && out.includes(projectUser);
    result.guest = {
      ok: r.exitCode === 0 && /GUEST_PROBE_BEGIN/.test(out),
      exitCode: r.exitCode,
      projectUserExpected: projectUser,
      projectUserPresent: hasProjectUser,
      diskLine,
      homebrewMount: hbMount,
      homebrewLock: hbLock,
      homebrewLockPid: hbLockPid,
      stdout: out.trim().slice(0, 800),
    };
    if (!result.guest.ok) {
      issues.push("guest probe command failed after SSH ok");
    }
    if (hbLock === "present") {
      issues.push(
        `guest Homebrew lock present at ${lockPath}${
          hbLockPid ? ` (pid file: ${hbLockPid})` : ""
        } — next install may need force-unlock`,
      );
    }
    if (deep) {
      // Read-only brew presence check if mounted; do not acquire lock.
      const deepProbe = [
        "set +e",
        `if [ -x ${q(mountPoint + "/bin/brew")} ]; then`,
        `  ${q(mountPoint + "/bin/brew")} --version 2>/dev/null | head -1 | sed 's/^/BREW_VER=/'`,
        `  command -v allbrew >/dev/null && allbrew --version 2>/dev/null | head -1 | sed 's/^/ALLBREW_VER=/' || echo ALLBREW_VER=missing`,
        "else",
        "  echo BREW_VER=not_mounted",
        "fi",
        "df -k / | tail -1 | awk '{print \"ROOT_AVAIL_KB=\" $4}'",
      ].join("; ");
      const dr = await runWithEnv(
        env,
        hostWrap(
          endpoint,
          `${lumeBin(endpoint)} ssh ${q(vmName)} --timeout ${sshTimeoutS} ${q(deepProbe)}`,
        ),
        { timeoutMs: (sshTimeoutS + 20) * 1000 },
      );
      result.guest.deep = {
        ok: dr.exitCode === 0,
        brewVersion: /BREW_VER=(.+)/.exec(dr.stdout || "")?.[1]?.trim() || null,
        allbrewVersion: /ALLBREW_VER=(.+)/.exec(dr.stdout || "")?.[1]?.trim() || null,
        rootAvailKb: /ROOT_AVAIL_KB=(\d+)/.exec(dr.stdout || "")?.[1] || null,
        stdout: (dr.stdout || "").trim().slice(0, 500),
      };
      const rootKb = Number(result.guest.deep.rootAvailKb);
      if (Number.isFinite(rootKb) && rootKb < 1024 * 1024) {
        // < 1 GiB free on /
        issues.push(
          `guest root disk low: ~${Math.round(rootKb / 1024)} MiB free (env_fail risk)`,
        );
      }
    }
  }

  result.issues = issues;
  if (result.guestOk && result.free) {
    result.usable = true;
    result.status = issues.some((i) => /lock present|disk low/i.test(i))
      ? "healthy_with_warnings"
      : "healthy";
  } else if (result.guestOk && !result.free) {
    result.usable = false;
    result.status = "busy";
  } else {
    result.usable = false;
    result.status = result.status === "unknown" ? "unhealthy" : result.status;
  }
  return finalize(result, issues);
}

function finalize(result, issues) {
  result.issues = [...new Set(issues.length ? issues : result.issues || [])];
  result.usable = Boolean(result.guestOk && result.free);
  if (result.guestOk && !result.free && result.status === "unknown") {
    result.status = "busy";
  }
  return result;
}

/**
 * Probe all enabled endpoints (or a filtered list).
 */
export async function probePool(opts = {}) {
  const pool = loadPoolConfig();
  let endpoints = (pool.endpoints || []).filter((e) => e.enabled !== false);
  if (opts.endpointId) {
    endpoints = (pool.endpoints || []).filter((e) => e.id === opts.endpointId);
    if (!endpoints.length) {
      throw new Error(`Unknown endpoint: ${opts.endpointId}`);
    }
  }
  const results = [];
  for (const ep of endpoints) {
    // Sequential: avoids hammering local lume / remote SSH concurrently.
    // eslint-disable-next-line no-await-in-loop
    results.push(await probeEndpoint(ep, opts));
  }
  const summary = {
    checkedAt: new Date().toISOString(),
    total: results.length,
    healthy: results.filter((r) => r.status === "healthy" || r.status === "healthy_with_warnings")
      .length,
    usable: results.filter((r) => r.usable).length,
    busy: results.filter((r) => r.status === "busy").length,
    sshUnavailable: results.filter((r) => r.status === "ssh_unavailable").length,
    vmStopped: results.filter((r) => r.status === "vm_stopped" || r.status === "vm_missing")
      .length,
    otherUnhealthy: results.filter(
      (r) =>
        !r.usable &&
        r.status !== "busy" &&
        r.status !== "disabled" &&
        r.status !== "ssh_unavailable" &&
        r.status !== "vm_stopped" &&
        r.status !== "vm_missing",
    ).length,
  };
  return {
    checkedAt: summary.checkedAt,
    poolPath: join(BATCH_DIR, "vm-pool.json"),
    summary,
    endpoints: results,
  };
}

/** Human-readable table for CLI / orchestrator logs. */
export function formatHealthReport(report) {
  const lines = [];
  lines.push(`VM guest health  ${report.checkedAt}`);
  lines.push(
    `summary: usable=${report.summary.usable}/${report.summary.total}  healthy=${report.summary.healthy}  busy=${report.summary.busy}  ssh_fail=${report.summary.sshUnavailable}  vm_down=${report.summary.vmStopped}`,
  );
  lines.push("");
  const cols = [
    "endpoint",
    "status",
    "mutex",
    "vm",
    "ssh",
    "usable",
  ];
  lines.push(cols.join("\t"));
  for (const e of report.endpoints) {
    const mutex = !e.mutex?.locked
      ? "free"
      : e.mutex.pidAlive
        ? `busy:${e.mutex.holder?.owner || e.mutex.holder?.pid || "?"}`
        : `stale:${e.mutex.holder?.pid || "?"}`;
    const vm = e.vm ? `${e.vm.state}${e.vm.ip ? `@${e.vm.ip}` : ""}` : "-";
    const ssh = e.ssh?.ok ? "ok" : e.ssh ? "FAIL" : e.remoteHost && !e.remoteHost.ok ? "n/a" : "-";
    lines.push(
      [
        e.id,
        e.status,
        mutex,
        vm,
        ssh,
        e.usable ? "yes" : "no",
      ].join("\t"),
    );
  }
  const issueLines = [];
  for (const e of report.endpoints) {
    for (const issue of e.issues || []) {
      issueLines.push(`  [${e.id}] ${issue}`);
    }
  }
  if (issueLines.length) {
    lines.push("");
    lines.push("issues:");
    lines.push(...issueLines);
  }
  return lines.join("\n");
}

/**
 * Prefer a free + guest-healthy endpoint for installs.
 * Falls back to any free endpoint, then pool pick order.
 */
export async function pickHealthyEndpoint(opts = {}) {
  const report = await probePool({ ...opts, clearStaleMutex: opts.clearStaleMutex ?? true });
  const usable = report.endpoints.filter((e) => e.usable);
  if (usable.length) {
    const ep = listEnabledEndpoints().find((e) => e.id === usable[0].id);
    if (ep) return { endpoint: ep, health: usable[0], report };
  }
  const freeGuestOk = report.endpoints.filter((e) => e.guestOk && e.free);
  if (freeGuestOk.length) {
    const ep = listEnabledEndpoints().find((e) => e.id === freeGuestOk[0].id);
    if (ep) return { endpoint: ep, health: freeGuestOk[0], report };
  }
  return { endpoint: null, health: null, report };
}

export function writeHealthSnapshot(report, path = join(BATCH_DIR, "logs", "vm-guest-health.json")) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  return path;
}
