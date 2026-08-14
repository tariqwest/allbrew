#!/usr/bin/env bun
import { loadHarness, guest, acquireHomebrewPrefixDurable, releaseHomebrewPrefixDurable } from "./lib/guest-ops.mjs";
import { acquireEndpointMutex, applyEndpointEnv, listEnabledEndpoints, releaseEndpointMutex } from "./lib/vm-pool.mjs";

const endpointId = process.argv[2];
const ep = listEnabledEndpoints().find((e) => e.id === endpointId);
if (!ep) { console.error("Unknown endpoint", endpointId); process.exit(2); }

const lease = await acquireEndpointMutex(ep, `hygiene-${Date.now()}`);
applyEndpointEnv(ep);

const h = await loadHarness();
let session = null;
try {
  session = await acquireHomebrewPrefixDurable(h);
  const mountPoint = process.env.TH_HOMEBREW_MOUNT_POINT || "/opt/homebrew";
  const cmd = `export PATH="${mountPoint}/bin:\$HOME/.bun/bin:\$PATH"
set +e
brew services stop --all 2>&1 || true
for tap in th-allbrew/allbrew tariqwest/allbrew th-allbrew/homebrew-allbrew; do
  for pkg in \$(brew list --formula 2>/dev/null | grep -E '^(open-notebook|trae-agent|geminabox|toolong|chainlit|smashing|license_finder|mailcatcher|shell-gpt|gradio|ego-lite|aizen|mcphub)\$' || true); do
    brew uninstall --force "\${tap}/\${pkg}" 2>&1 || true
  done
done
brew untap th-allbrew/allbrew 2>&1 || true
brew untap th-allbrew/homebrew-allbrew 2>&1 || true
brew untap tariqwest/allbrew 2>&1 || true
rm -rf ~/.config/allbrew/packages/*.json 2>/dev/null || true
rm -rf ~/.config/allbrew 2>/dev/null || true
rm -rf /tmp/allbrew-* /private/tmp/allbrew-* 2>/dev/null || true
rm -rf "\${TMPDIR:-/tmp}"/allbrew-* 2>/dev/null || true
brew cleanup --prune=all 2>&1 | tail -20
echo HYGIENE_OK
`;
  const r = await guest(h.runAsProjectUser, session, cmd, `full-hygiene-${endpointId}`, { timeout: 300_000 });
  console.log(`HYGIENE ${endpointId}: exit=${r.exitCode}\n${r.stdout}`);
} catch (e) {
  console.error(`HYGIENE ${endpointId} error:`, e?.message || e);
} finally {
  try { await releaseHomebrewPrefixDurable(h, session); } catch {}
  releaseEndpointMutex(lease);
}
