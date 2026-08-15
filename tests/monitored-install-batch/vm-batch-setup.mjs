#!/usr/bin/env bun
/**
 * Minimal batch endpoint setup.
 * Creates the project user, ensures the Homebrew sparsebundle, and installs bun.
 * Does NOT require the harness shared-mount /Volumes/Shared; vm-install-one
 * syncs source itself.
 */
import {
  listEnabledEndpoints,
  applyEndpointEnv,
} from "./lib/vm-pool.mjs";
import { loadHarness } from "./lib/guest-ops.mjs";

const endpointId = process.argv[2];
if (!endpointId) {
  console.error("Usage: bun vm-batch-setup.mjs <endpoint>");
  process.exit(2);
}

const ep = listEnabledEndpoints().find((e) => e.id === endpointId);
if (!ep) {
  console.error("Unknown endpoint", endpointId);
  process.exit(2);
}

// The harness runAsProjectUser cd's to TH_VM_WORKSPACE before running the
// user's command. Use the project user's home so it always exists.
applyEndpointEnv(ep);
process.env.TH_VM_WORKSPACE = "/Users/th-allbrew";

const h = await loadHarness();

// 1. Project user
if (await h.projectUserExists()) {
  console.log(`[setup ${endpointId}] project user already exists`);
} else {
  console.log(`[setup ${endpointId}] creating project user`);
  await h.createProjectUser();
}

// 2. Ensure project user home and workspace
await h.lumeSshExec(
  `sudo mkdir -p /Users/th-allbrew && sudo chown th-allbrew:staff /Users/th-allbrew`,
  { timeout: 60_000 }
);

// 3. Homebrew sparsebundle
console.log(`[setup ${endpointId}] ensuring sparsebundle`);
await h.ensureSparsebundle();

// 4. Bun runtime in project user's home (vm-install-one runs source with bun)
console.log(`[setup ${endpointId}] installing bun`);
await h.runAsProjectUser(
  'curl -fsSL https://bun.sh/install | bash',
  'install-bun',
  { timeout: 120_000 }
);

console.log(`[setup ${endpointId}] BATCH_SETUP_OK`);
