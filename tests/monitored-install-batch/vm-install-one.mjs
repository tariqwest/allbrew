#!/usr/bin/env bun
/**
 * Run one allbrew install/verify/uninstall cycle inside the Lume VM
 * (th-allbrew + exclusive Homebrew prefix). Host stays clean.
 *
 * Usage:
 *   LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
 *     --url <url> --name <slug> [--log <host-path>] [--allbrew-src <hostWorktreePath>]
 *
 * --allbrew-src: when set, sync the host worktree/branch to the VM (git push
 *   agent/* + VM git fetch/checkout + bun install) and run the install via
 *   `bun --cwd <vmSrc> run bin/allbrew.ts` instead of the bottled `allbrew`.
 *   This lets batch-child validate unreleased patches without host brew.
 *
 * Prints:
 *   EXIT_CODE=...
 *   PACKAGE=...
 *   VERIFY_OK=true|false
 *   LOG=...
 */
import { writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  loadHarness,
  guest,
  ensureAllbrew,
  ensureTapConfigured,
  installCmd,
  installCmdFromSrc,
  syncAllbrewSrcToVM,
  isVmSrcFresh,
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
  console.error("Usage: --url <url> --name <slug> [--log path] [--endpoint homeserver|local] [--allbrew-src <hostPath>]");
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
// truncate host log early so parent can tail it while VM streams
try { writeFileSync(hostLog, ""); } catch {}
try { writeFileSync(hostLog + ".verify.txt", ""); } catch {}
try { writeFileSync(hostLog + ".formula.rb", ""); } catch {}

const token = process.env.GITHUB_TOKEN || "";
const allbrewSrc = arg("--allbrew-src");
const allbrewBranch = arg("--allbrew-branch");
const runDir = arg("--run-dir");

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
const metaPath = runDir ? resolve(runDir, "vm-meta.json") : resolve(dirname(hostLog), `${name}-vm-meta.json`);
const poolAcquiredAt = Date.now();
let lockAcquiredAt = null;
function writeMeta(extra = {}) {
  try {
    mkdirSync(dirname(metaPath), { recursive: true });
    const payload = {
      endpointId,
      runName: name,
      hostLog,
      metaPath,
      poolAcquiredAt,
      lockAcquiredAt,
      lastLogAt: Date.now(),
      hostClean: true,
      vmSrc: allbrewSrc ? resolve(allbrewSrc) : null,
      ...extra,
    };
    writeFileSync(metaPath, JSON.stringify(payload, null, 2));
  } catch {}
}
writeMeta({ phase: "pool-acquired" });

try {
  const prefixEnabled = h.config.homebrewPrefix.enabled;
  if (prefixEnabled) {
    writeMeta({ phase: "acquiring-prefix" });
    session = await acquireHomebrewPrefixDurable(h);
    lockAcquiredAt = Date.now();
    writeMeta({ phase: "prefix-acquired", lockAcquiredAt, poolWaitMs: lockAcquiredAt - poolAcquiredAt });
  } else {
    session = null;
    lockAcquiredAt = Date.now();
    writeMeta({ phase: "prefix-skipped-shared-mode", lockAcquiredAt, poolWaitMs: 0 });
  }
  await ensureAllbrew(h, session, mountPoint);
  await ensureTapConfigured(h, session, mountPoint, tapPath);

  let vmSrcPath = null;
  if (allbrewSrc) {
    const hostPath = resolve(allbrewSrc);
    const skipIfFresh = process.env.TH_SKIP_SRC_SYNC === "1";
    if (skipIfFresh) {
      const fresh = await isVmSrcFresh(h, hostPath);
      if (fresh) {
        vmSrcPath = fresh.dest;
        console.log(`[vm-install-one] using existing VM src at ${vmSrcPath} (sha matches)`);
        writeMeta({ phase: "src-skipped", vmSrcPath });
      }
    }
    if (!vmSrcPath) {
      console.log(`[vm-install-one] syncing allbrew src ${hostPath} to VM...`);
      writeMeta({ phase: "syncing-src", hostSrc: hostPath });
      const sync = await syncAllbrewSrcToVM(h, hostPath);
      vmSrcPath = sync.dest;
      console.log(`[vm-install-one] src ready on branch ${sync.branch} at ${vmSrcPath}`);
      writeMeta({ phase: "src-synced", vmSrcPath, branch: sync.branch });
      if (allbrewBranch && allbrewBranch !== sync.branch) {
        console.log(`[vm-install-one] note: requested --allbrew-branch ${allbrewBranch} resolved to ${sync.branch}`);
      }
    }
  }

  const guestLog = `/tmp/allbrew-agent-${name}.log`;
  const cmd = vmSrcPath
    ? installCmdFromSrc({
        url,
        slug: name,
        mountPoint,
        guestLog,
        token: token || undefined,
        vmSrcPath,
      })
    : installCmd({
        url,
        slug: name,
        mountPoint,
        guestLog,
        token: token || undefined,
      });
  writeMeta({ phase: "installing", guestLog });
  // stream VM stdout into hostLog incrementally so parent can tail during long downloads
  const result = await guest(h.runAsProjectUser, session, cmd, `allbrew-${name}`, {
    timeout: Number(process.env.TH_BATCH_INSTALL_TIMEOUT_MS || 720000),
    stream: true,
    onChunk: (chunk) => {
      try { appendFileSync(hostLog, chunk); } catch {}
      writeMeta({ phase: "installing", lastChunkAt: Date.now(), lastChunkLen: chunk.length });
    },
  });
  // ensure hostLog has the full guestLog plus any streamed stdout
  const fetch = await guest(
    h.runAsProjectUser,
    session,
    `set +e; cat ${JSON.stringify(guestLog)} 2>/dev/null || echo MISSING_LOG`,
    `fetch-${name}`,
    { timeout: 120000 },
  );
  installLog = fetch.stdout || result.stdout || "";
  // if streaming already wrote, overwrite with authoritative guestLog to avoid duplication
  writeFileSync(hostLog, installLog);
  writeMeta({ phase: "install-done", exitCode: result.exitCode, guestLogPresent: !/MISSING_LOG/.test(fetch.stdout || "") });
  exitCode = extractExitCode(installLog, result.exitCode ?? 1) ?? 1;

  // package name heuristic
  // allbrew may print either "Wrote formula/cask: <token>" or
  // "Generated: /path/to/(Formula|Casks)/<token>.rb". Cask token names can
  // include hyphens after the first character (e.g. mountain-loop-yaak).
  const pm =
    installLog.match(/(?:Wrote|Generated)\s+(?:formula|cask):?\s+([A-Za-z0-9][A-Za-z0-9@._+-]*)(?:\.rb)?\b/i) ||
    installLog.match(/(?:Wrote|Generated)(?:\s+(?:formula|cask))?:?\s+.*?(?:Formula|Casks)\/([A-Za-z0-9][A-Za-z0-9@._+-]*)\.rb/i);
  if (pm) pkg = pm[1].split("/").pop();

  writeMeta({ phase: exitCode === 0 ? "verifying" : "skipping-verify", pkg, exitCode });
  if (exitCode === 0) {
    const v = await guest(
      h.runAsProjectUser,
      session,
      strictVerifyCmd({ pkg, mountPoint }),
      `verify-${pkg}`,
      { timeout: Number(process.env.TH_BATCH_VERIFY_TIMEOUT_MS || 300000) },
    );
    writeFileSync(hostLog + ".verify.txt", v.stdout || "");
    writeMeta({ phase: "verified", verifyOkRaw: (v.stdout || "").slice(0, 400) });
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
    writeMeta({ phase: "formula-fetched", pkg, formulaLen: formulaText.length });
  }

  // (duplicate fetch removed — single fetch above suffices)

  // always uninstall + VM hygiene (disk, brew cache)
  writeMeta({ phase: "uninstalling", pkg });
  await guest(
    h.runAsProjectUser,
    session,
    uninstallCmd({ pkg, mountPoint, tapPath }),
    `uninstall-${pkg}`,
    { timeout: 300000 },
  );
  // post-uninstall hygiene: brew cleanup + disk avail + VM ephemera purge so batch doesn't leak
  try {
    const hygiene = await guest(
      h.runAsProjectUser,
      session,
      `${`export PATH="${mountPoint}/bin:$HOME/.bun/bin:$PATH"`}
brew services stop --all 2>&1 || true
brew cleanup --prune=all 2>&1 | tail -10; echo CLEANUP_OK
brew autoremove 2>&1 | tail -10 || true
rm -rf /tmp/allbrew-* /private/tmp/allbrew-* 2>/dev/null || true
rm -rf "\${TMPDIR:-/tmp}"/allbrew-* 2>/dev/null || true
rm -rf ~/Library/Caches/Homebrew/* 2>/dev/null || true
df -h / 2>&1 | head -10; echo DF_OK
df -h ${mountPoint} 2>&1 | head -10; echo DF_HB_OK
brew trust 2>&1 | head -20; echo TRUST_OK
# compact sparsebundle if not mounted (shrinks host qcow2 bloat from brew Cellar churn)
if ! mount | grep -q " on ${mountPoint} "; then
  SPARSE="$HOME/Library/LumeHomebrew/homebrew.sparsebundle"
  if [ -d "$SPARSE" ] && [ -f "$SPARSE/Info.plist" ]; then
    echo "compact start $SPARSE"
    hdiutil compact "$SPARSE" 2>&1 | tail -20; echo COMPACT_OK
  fi
fi
`,
      `hygiene-${pkg}`,
      { timeout: 180000 },
    );
    writeFileSync(hostLog + ".hygiene.txt", hygiene.stdout || "");
    const dfM = (hygiene.stdout || "").match(/\/dev\/\S+\s+\S+\s+\S+\s+(\S+)\s+\d+%/);
    writeMeta({ phase: "uninstalled", pkg, verifyOk, exitCode, hygiene: (hygiene.stdout || "").slice(0, 1000), diskAvail: dfM ? dfM[1] : null });
  } catch {
    writeMeta({ phase: "uninstalled", pkg, verifyOk, exitCode });
  }
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
try {
  const status = {
    url,
    name,
    pkg,
    exitCode,
    verifyOk,
    endpointId,
    hostLog,
    formulaLog: `${hostLog}.formula.rb`,
    verifyLog: `${hostLog}.verify.txt`,
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(`${hostLog}.status.json`, JSON.stringify(status, null, 2));
  writeFileSync(`${hostLog}.done`, "");
} catch {}
process.exit(exitCode === 0 && verifyOk ? 0 : 1);
