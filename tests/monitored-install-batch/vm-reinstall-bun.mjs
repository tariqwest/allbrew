#!/usr/bin/env bun
import { loadHarness, guest, acquireHomebrewPrefixDurable, releaseHomebrewPrefixDurable } from "./lib/guest-ops.mjs";
import { acquireEndpointMutex, applyEndpointEnv, listEnabledEndpoints, releaseEndpointMutex } from "./lib/vm-pool.mjs";

const endpointId = process.argv[2];
const ep = listEnabledEndpoints().find((e) => e.id === endpointId);
if (!ep) { console.error("Unknown endpoint", endpointId); process.exit(2); }

const lease = await acquireEndpointMutex(ep, `reinstall-bun-${Date.now()}`);
applyEndpointEnv(ep);

const h = await loadHarness();
let session = null;
try {
  session = await acquireHomebrewPrefixDurable(h);
  const mountPoint = process.env.TH_HOMEBREW_MOUNT_POINT || "/opt/homebrew";
  const cmd = `set +e
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_ENV_HINTS=1
export PATH="${mountPoint}/bin:\$HOME/.bun/bin:\$PATH"
# Prefer the user-installed bun if the Cellar symlink is broken
if [ ! -x "${mountPoint}/bin/bun" ]; then
  rm -f "${mountPoint}/bin/bun" 2>/dev/null || true
  ln -s "\$HOME/.bun/bin/bun" "${mountPoint}/bin/bun" 2>/dev/null || true
fi
brew install bun 2>&1 || true
brew reinstall allbrew 2>&1 || true
allbrew --version
`;
  const r = await guest(h.runAsProjectUser, session, cmd, `reinstall-bun-${endpointId}`, { timeout: 300_000 });
  console.log(`REINSTALL-BUN ${endpointId}: exit=${r.exitCode}\n${r.stdout}`);
} catch (e) {
  console.error(`REINSTALL-BUN ${endpointId} error:`, e?.message || e);
} finally {
  try { await releaseHomebrewPrefixDurable(h, session); } catch {}
  releaseEndpointMutex(lease);
}
