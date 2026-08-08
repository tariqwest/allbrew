#!/usr/bin/env bun
/**
 * Probe Lume VM pool endpoints for guest health / install readiness.
 *
 * Usage:
 *   bun tests/monitored-install-batch/vm-guest-health.mjs
 *   bun tests/monitored-install-batch/vm-guest-health.mjs --endpoint local-1
 *   bun tests/monitored-install-batch/vm-guest-health.mjs --json
 *   bun tests/monitored-install-batch/vm-guest-health.mjs --deep
 *   bun tests/monitored-install-batch/vm-guest-health.mjs --clear-stale
 *   bun tests/monitored-install-batch/vm-guest-health.mjs --write-snapshot
 *
 * Exit codes:
 *   0 — at least one endpoint is usable (guest SSH ok + free mutex)
 *   1 — no usable endpoint (SSH/VM/mutex issues)
 *   2 — usage / config error
 *
 * Does not acquire exclusive Homebrew. Read-only guest probes only.
 */
import {
  probePool,
  formatHealthReport,
  writeHealthSnapshot,
} from "./lib/guest-health.mjs";
import { join, resolve } from "node:path";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function arg(flag, fallback = "") {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

if (hasFlag("--help") || hasFlag("-h")) {
  console.log(`Usage: bun tests/monitored-install-batch/vm-guest-health.mjs [options]

Options:
  --endpoint <id>   Probe one pool endpoint (homeserver|local-1|local-2)
  --json            Machine-readable JSON on stdout
  --deep            Extra guest checks (brew path if mounted, root disk free)
  --clear-stale     Remove host mutex dirs whose holder PID is dead
  --write-snapshot  Write logs/vm-guest-health.json
  --ssh-timeout <s> lume ssh --timeout seconds (default 15)

Exit 0 if any endpoint is usable (SSH ok + free mutex); else 1.
`);
  process.exit(0);
}

const endpointId = arg("--endpoint", "") || undefined;
const asJson = hasFlag("--json");
const deep = hasFlag("--deep");
const clearStaleMutex = hasFlag("--clear-stale");
const writeSnap = hasFlag("--write-snapshot");
const sshTimeoutS = Number(arg("--ssh-timeout", "15")) || 15;

let report;
try {
  report = await probePool({
    endpointId,
    deep,
    clearStaleMutex,
    sshTimeoutS,
  });
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(2);
}

if (writeSnap) {
  const path = writeHealthSnapshot(
    report,
    resolve(import.meta.dir, "logs", "vm-guest-health.json"),
  );
  if (!asJson) console.error(`snapshot: ${path}`);
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatHealthReport(report));
  console.log("");
  console.log(
    "usable = guest SSH OK and host mutex free (ready for a new vm-install-one).",
  );
  console.log(
    "busy = guest looks fine but mutex held; ssh_unavailable / vm_stopped = not installable.",
  );
}

process.exit(report.summary.usable > 0 ? 0 : 1);
