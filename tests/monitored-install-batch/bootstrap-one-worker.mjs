#!/usr/bin/env bun
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BATCH_LOGS, ensureDirs } from "./lib/batch-helpers.mjs";
import { loadHarness, ensureAllbrew, ensureTapConfigured, guest, brewEnvPreamble, acquireHomebrewPrefixDurable, releaseHomebrewPrefixDurable } from "./lib/guest-ops.mjs";

process.env.LUME_REMOTE_ENABLED = process.env.LUME_REMOTE_ENABLED ?? "true";
ensureDirs(); mkdirSync(BATCH_LOGS, { recursive: true });
const user = process.env.TH_PROJECT_USER || process.env.TH_BATCH_WORKER_USER;
const workerId = process.env.TH_BATCH_WORKER_ID || "w?";
const mountPoint = process.env.TH_BATCH_WORKER_MOUNT || process.env.TH_HOMEBREW_MOUNT_POINT || "/opt/homebrew";
const tapPath = process.env.TH_BATCH_WORKER_TAP || `/Users/${user}/homebrew-allbrew`;

async function main() {
  console.log(`[bootstrap-one] ${workerId} user=${user} mount=${mountPoint}`);
  const h = await loadHarness();
  console.log("[bootstrap-one] config", { projectUser: h.config.projectUser, mount: h.config.homebrewPrefix.mountPoint, lock: h.config.homebrewPrefix.lockPath, workspace: h.config.vmWorkspace });
  if (h.config.projectUser !== user) throw new Error(`config.projectUser=${h.config.projectUser} != expected ${user}`);
  if (!(await h.projectUserExists())) { console.log(`[bootstrap-one] creating user ${user}`); await h.createProjectUser(); }
  else console.log(`[bootstrap-one] user exists ${user}`);
  try { await h.stagePrivateWorkspace(); console.log("[bootstrap-one] workspace staged"); }
  catch (e) { console.warn("[bootstrap-one] stage warning:", e?.message || e); }
  let session = null;
  try {
    session = await acquireHomebrewPrefixDurable(h);
    console.log("[bootstrap-one] prefix", { mount: session.mountPoint, brewInstalled: session.brewInstalled });
    const ver = await ensureAllbrew(h, session, mountPoint);
    console.log("[bootstrap-one] allbrew", ver);
    await ensureTapConfigured(h, session, mountPoint, tapPath);
    console.log("[bootstrap-one] tap", tapPath);
    await guest(h.runAsProjectUser, session, `${brewEnvPreamble(mountPoint)}
command -v brew; brew --prefix; allbrew --version
allbrew config show 2>&1 | sed -E 's/(token|TOKEN|githubToken).*/REDACTED:/i'
`, "verify-bootstrap", { timeout: 120000 });
    writeFileSync(join(BATCH_LOGS, `bootstrap-${workerId}.json`), JSON.stringify({ workerId, user, mountPoint, tapPath, allbrew: ver, ok: true, at: new Date().toISOString() }, null, 2));
  } finally {
    try { const rel = await releaseHomebrewPrefixDurable(h, session); if (!rel.ok) console.warn("[bootstrap-one] release warnings", rel.errors); } catch (e) { console.warn("[bootstrap-one] release failed", e?.message || e); }
  }
  console.log(`[bootstrap-one] ${workerId} ok`);
}
await main();
