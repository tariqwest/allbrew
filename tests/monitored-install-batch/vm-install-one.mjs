#!/usr/bin/env bun
/**
 * Run one allbrew install/verify/uninstall cycle inside the Lume VM
 * (th-allbrew + exclusive Homebrew prefix). Host stays clean.
 *
 * Usage:
 *   LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
 *     --url <url> --name <slug> [--log <host-path>]
 *
 * Prints:
 *   EXIT_CODE=...
 *   PACKAGE=...
 *   VERIFY_OK=true|false
 *   LOG=...
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadHarness,
  guest,
  ensureAllbrew,
  ensureTapConfigured,
  installCmd,
  strictVerifyCmd,
  uninstallCmd,
  fetchFormulaCmd,
  acquireHomebrewPrefixDurable,
  releaseHomebrewPrefixDurable,
} from "./lib/guest-ops.mjs";
import { extractExitCode } from "./lib/batch-helpers.mjs";
import {
  acquirePoolSlot,
  releaseEndpointMutex,
} from "./lib/vm-pool.mjs";

function arg(flag, fallback = "") {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

// Defaults; pool endpoint env overrides these before loadHarness().
process.env.TH_PROJECT_USER = process.env.TH_PROJECT_USER || "th-allbrew";
process.env.TH_HOMEBREW_MOUNT_POINT =
  process.env.TH_HOMEBREW_MOUNT_POINT || "/opt/homebrew";
process.env.TH_HOMEBREW_LOCK_PATH =
  process.env.TH_HOMEBREW_LOCK_PATH || "/var/run/lume-homebrew.lock";

const url = arg("--url");
const name = arg("--name");
const endpointOverride = arg("--endpoint", process.env.TH_VM_ENDPOINT || "");
if (!url || !name) {
  console.error("Usage: --url <url> --name <slug> [--log path] [--endpoint homeserver|local]");
  process.exit(2);
}

const hostLog =
  arg("--log") ||
  resolve(
    import.meta.dir,
    "logs",
    `vm-install-${name}-${Date.now()}.log`,
  );
mkdirSync(resolve(hostLog, ".."), { recursive: true });

const token = process.env.GITHUB_TOKEN || "";

// Acquire a pool slot (homeserver or local) BEFORE loading harness so config sees endpoint env.
let poolLease = null;
if (endpointOverride) {
  const { listEnabledEndpoints, acquireEndpointMutex, applyEndpointEnv } =
    await import("./lib/vm-pool.mjs");
  const ep = listEnabledEndpoints().find((e) => e.id === endpointOverride);
  if (!ep) {
    console.error(`Unknown or disabled endpoint: ${endpointOverride}`);
    process.exit(2);
  }
  poolLease = await acquireEndpointMutex(ep, name);
  applyEndpointEnv(ep);
} else {
  poolLease = await acquirePoolSlot(name);
}

const mountPoint = process.env.TH_HOMEBREW_MOUNT_POINT || "/opt/homebrew";
const tapPath =
  process.env.TH_BATCH_WORKER_TAP ||
  `/Users/${process.env.TH_PROJECT_USER}/homebrew-allbrew`;

const h = await loadHarness();
let session = null;
let installLog = "";
let exitCode = 1;
let pkg = name;
let verifyOk = false;
let formulaText = "";
const endpointId = poolLease?.endpoint?.id || "unknown";

try {
  session = await acquireHomebrewPrefixDurable(h);
  await ensureAllbrew(h, session, mountPoint);
  await ensureTapConfigured(h, session, mountPoint, tapPath);

  const guestLog = `/tmp/allbrew-agent-${name}.log`;
  const cmd = installCmd({
    url,
    slug: name,
    mountPoint,
    guestLog,
    token: token || undefined,
  });
  const result = await guest(h.runAsProjectUser, session, cmd, `allbrew-${name}`, {
    timeout: Number(process.env.TH_BATCH_INSTALL_TIMEOUT_MS || 720000),
    stream: true,
  });
  const fetch = await guest(
    h.runAsProjectUser,
    session,
    `set +e; cat ${JSON.stringify(guestLog)} 2>/dev/null || echo MISSING_LOG`,
    `fetch-${name}`,
    { timeout: 120000 },
  );
  installLog = fetch.stdout || result.stdout || "";
  writeFileSync(hostLog, installLog);
  exitCode = extractExitCode(installLog, result.exitCode ?? 1) ?? 1;

  // package name heuristic
  // allbrew may print either "Wrote formula/cask: <token>" or
  // "Generated: /path/to/(Formula|Casks)/<token>.rb". Cask token names can
  // include hyphens after the first character (e.g. mountain-loop-yaak).
  const pm =
    installLog.match(/(?:Wrote|Generated)\s+(?:formula|cask):?\s+([A-Za-z0-9][A-Za-z0-9@._+-]*)(?:\.rb)?\b/i) ||
    installLog.match(/(?:Wrote|Generated)(?:\s+(?:formula|cask))?:?\s+.*?(?:Formula|Casks)\/([A-Za-z0-9][A-Za-z0-9@._+-]*)\.rb/i);
  if (pm) pkg = pm[1].split("/").pop();

  if (exitCode === 0) {
    const v = await guest(
      h.runAsProjectUser,
      session,
      strictVerifyCmd({ pkg, mountPoint }),
      `verify-${pkg}`,
      { timeout: 180000 },
    );
    writeFileSync(hostLog + ".verify.txt", v.stdout || "");
    verifyOk =
      /MANIFEST_OK/.test(v.stdout || "") &&
      (/FORMULA_LISTED=1/.test(v.stdout || "") ||
        /CASK_LISTED=1/.test(v.stdout || "")) &&
      (/BIN_OK/.test(v.stdout || "") ||
        /APP_OK/.test(v.stdout || "") ||
        /CASK_LISTED=1/.test(v.stdout || ""));
  }

  const fr = await guest(
    h.runAsProjectUser,
    session,
    fetchFormulaCmd({ pkg, mountPoint, tapPath }),
    `formula-${pkg}`,
    { timeout: 60000 },
  );
  formulaText = fr.stdout || "";
  if (formulaText && !formulaText.includes("MISSING_FORMULA")) {
    writeFileSync(hostLog + ".formula.rb", formulaText);
  }

  // always uninstall for hygiene
  await guest(
    h.runAsProjectUser,
    session,
    uninstallCmd({ pkg, mountPoint, tapPath }),
    `uninstall-${pkg}`,
    { timeout: 300000 },
  );
} finally {
  try {
    await releaseHomebrewPrefixDurable(h, session);
  } catch (e) {
    console.error("release failed", e?.message || e);
  }
  releaseEndpointMutex(poolLease);
}

console.log(`EXIT_CODE=${exitCode}`);
console.log(`PACKAGE=${pkg}`);
console.log(`VERIFY_OK=${verifyOk}`);
console.log(`ENDPOINT=${endpointId}`);
console.log(`LOG=${hostLog}`);
console.log(`FORMULA_LOG=${hostLog}.formula.rb`);
process.exit(exitCode === 0 && verifyOk ? 0 : 1);
