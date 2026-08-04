#!/usr/bin/env bun
/**
 * Guest (VM) operations for batch workers.
 * Includes Homebrew lock/mount hygiene helpers for batch durability.
 */

export async function loadHarness() {
  const { pathToFileURL } = await import("node:url");
  const { join, resolve } = await import("node:path");
  const harnessRoot = resolve(
    import.meta.dir,
    "../../../node_modules/macos-testing-harness/src",
  );
  const importTs = (rel) => import(pathToFileURL(join(harnessRoot, rel)).href);
  const homebrew = await importTs("lib/homebrew-prefix.ts");
  const users = await importTs("lib/users.ts");
  const shell = await importTs("lib/shell.ts");
  const { config } = await importTs("config.ts");
  return { ...homebrew, ...users, ...shell, config };
}

export async function guest(runAsProjectUser, session, cmd, description, opts = {}) {
  try {
    const stdout = await runAsProjectUser(cmd, description, {
      session,
      timeout: opts.timeout,
      stream: opts.stream,
    });
    return { exitCode: 0, stdout: stdout ?? "", stderr: "" };
  } catch (e) {
    const msg = String(e?.message || e);
    return { exitCode: 1, stdout: msg, stderr: msg };
  }
}

export function brewEnvPreamble(mountPoint) {
  const brew = mountPoint ? `${mountPoint}/bin` : "/opt/homebrew/bin";
  return `set +e
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ENV_HINTS=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export CI=1
export ALLBREW_NONINTERACTIVE=1
export E2E_HEAVY=1
export PATH="${brew}:$HOME/.bun/bin:$PATH"
`;
}

/**
 * Force-clear stale Homebrew lock + detach mount in the VM.
 *
 * The harness lock stores a *host* PID inside the guest filesystem. When a
 * previous host worker dies or releases incorrectly, `sudo kill -0 <hostPid>`
 * inside the guest always fails-open as "alive unknown" or leaves an orphan
 * lock, blocking the next acquire. Batch workers must be able to reclaim.
 */
export async function forceUnlockHomebrewPrefix(h, reason = "batch-hygiene") {
  const lockPath = h.config.homebrewPrefix.lockPath;
  const mountPoint = h.config.homebrewPrefix.mountPoint;
  const { lumeSshExec, q } = h;
  const script = [
    "#!/bin/bash",
    "set -uo pipefail",
    `echo "force-unlock reason=${reason}"`,
    `echo "lock=${lockPath} mount=${mountPoint}"`,
    // Detach any volume at the mount point.
    `if mount | grep -q " on ${mountPoint} "; then`,
    `  sudo hdiutil detach ${q(mountPoint)} -force 2>/dev/null || true`,
    `  if mount | grep -q " on ${mountPoint} "; then`,
    `    dev=$(mount | awk -v mp=${q(mountPoint)} '$3 == mp {print $1}')`,
    `    [[ -n "$dev" ]] && sudo hdiutil detach "$dev" -force 2>/dev/null || true`,
    `  fi`,
    `fi`,
    // Remove lock dir regardless of recorded PID (host PIDs are meaningless in guest).
    `if [[ -e ${q(lockPath)} ]]; then`,
    `  echo -n "old_lock_pid="; sudo cat ${q(lockPath)}/pid 2>/dev/null || echo none`,
    `  sudo rm -rf ${q(lockPath)} 2>/dev/null || true`,
    `fi`,
    // Ensure mount point exists as an empty directory (not a stuck mount).
    `if mount | grep -q " on ${mountPoint} "; then`,
    `  echo "WARN: still mounted after detach"`,
    `else`,
    `  sudo mkdir -p ${q(mountPoint)} 2>/dev/null || true`,
    `fi`,
    `echo FORCE_UNLOCK_DONE`,
  ].join("\n");

  const encoded = Buffer.from(script).toString("base64");
  const scriptPath = `/tmp/th-batch-force-unlock-${process.pid}.sh`;
  const inner = [
    `echo ${q(encoded)} | openssl base64 -d -A > ${q(scriptPath)}`,
    `chmod +x ${q(scriptPath)}`,
    q(scriptPath),
    `rc=$?`,
    `rm -f ${q(scriptPath)}`,
    `exit $rc`,
  ].join("\n");

  const result = await lumeSshExec(inner, { nothrow: true, timeout: 120000 });
  return {
    ok: result.exitCode === 0 && /FORCE_UNLOCK_DONE/.test(result.stdout || ""),
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.exitCode,
  };
}

/**
 * Acquire Homebrew prefix with retries + force-unlock between attempts.
 * Prefer holding the returned session for the worker lifetime.
 */
export async function acquireHomebrewPrefixDurable(h, opts = {}) {
  const attempts = opts.attempts ?? 5;
  const delayMs = opts.delayMs ?? 2000;
  let lastErr = null;

  // Always start clean for batch workers.
  try {
    const unlocked = await forceUnlockHomebrewPrefix(h, "pre-acquire");
    if (!unlocked.ok) {
      console.error("[hb] pre-acquire force-unlock warning:", unlocked.stdout || unlocked.stderr);
    }
  } catch (e) {
    console.error("[hb] pre-acquire force-unlock threw:", e?.message || e);
  }

  for (let i = 1; i <= attempts; i++) {
    try {
      const session = await h.acquireHomebrewPrefix();
      return session;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      console.error(`[hb] acquire attempt ${i}/${attempts} failed: ${msg.split("\n")[0]}`);
      try {
        await forceUnlockHomebrewPrefix(h, `retry-${i}`);
      } catch (ue) {
        console.error("[hb] force-unlock on retry failed:", ue?.message || ue);
      }
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, delayMs * i));
      }
    }
  }
  throw lastErr || new Error("acquireHomebrewPrefixDurable failed");
}

/**
 * Release session, then force-unlock as a belt-and-suspenders step so the next
 * worker never inherits a stale guest lock written with a host PID.
 */
export async function releaseHomebrewPrefixDurable(h, session) {
  const errors = [];
  if (session) {
    try {
      await h.releaseHomebrewPrefix(session);
    } catch (e) {
      errors.push(`release: ${e?.message || e}`);
    }
  }
  try {
    const unlocked = await forceUnlockHomebrewPrefix(h, "post-release");
    if (!unlocked.ok) errors.push(`force-unlock: ${unlocked.stdout || unlocked.stderr}`);
  } catch (e) {
    errors.push(`force-unlock threw: ${e?.message || e}`);
  }
  return { ok: errors.length === 0, errors };
}

export async function ensureAllbrew(h, session, mountPoint) {
  const { runAsProjectUser } = h;
  const brewBin = `${mountPoint}/bin`;
  const check = await guest(
    runAsProjectUser,
    session,
    `${brewEnvPreamble(mountPoint)}
command -v brew; brew --version | head -1
if command -v allbrew >/dev/null 2>&1; then allbrew --version; exit 0; fi
if test -x ${brewBin}/allbrew; then ${brewBin}/allbrew --version; exit 0; fi
exit 1
`,
    "probe-allbrew",
  );
  if (check.exitCode === 0 && check.stdout.trim()) return check.stdout.trim();

  const inst = await guest(
    runAsProjectUser,
    session,
    `${brewEnvPreamble(mountPoint)}
brew tap tariqwest/tap 2>&1 || true
brew trust tariqwest/tap 2>&1 || true
brew trust --formula tariqwest/tap/allbrew 2>&1 || true
brew update 2>&1 | tail -20
brew install allbrew 2>&1
command -v allbrew; allbrew --version 2>&1
`,
    "install-allbrew",
    { timeout: 600000, stream: true },
  );
  const okVer = await guest(
    runAsProjectUser,
    session,
    `${brewEnvPreamble(mountPoint)}allbrew --version`,
    "allbrew-version-after-install",
  );
  if (okVer.exitCode !== 0 || !okVer.stdout.trim()) {
    throw new Error(`failed to install allbrew:\n${inst.stdout}`);
  }
  return okVer.stdout.trim();
}

export async function ensureTapConfigured(h, session, mountPoint, tapPath) {
  const { runAsProjectUser } = h;
  const r = await guest(
    runAsProjectUser,
    session,
    `${brewEnvPreamble(mountPoint)}
TAP=${JSON.stringify(tapPath)}
mkdir -p "$TAP/Formula" "$TAP/Casks" "$HOME/.config/allbrew"
if [ ! -d "$TAP/.git" ]; then
  git -C "$TAP" init
  git -C "$TAP" config user.email "batch-worker@local"
  git -C "$TAP" config user.name "batch-worker"
  echo "# batch worker tap" > "$TAP/README.md"
  git -C "$TAP" add README.md
  git -C "$TAP" commit -m "init tap" || true
fi
AB=$(command -v allbrew || echo ${mountPoint}/bin/allbrew)
$AB config set-tap "$TAP"
$AB config show | sed -E 's/(token|TOKEN|githubToken).*/REDACTED:/i'
`,
    "ensure-tap",
    { timeout: 120000 },
  );
  if (r.exitCode !== 0) throw new Error(`failed to configure tap: ${r.stdout}`);
  return r.stdout;
}

export function installCmd({ url, slug, mountPoint, guestLog, token }) {
  const brewBin = `${mountPoint}/bin`;
  const tokenExport = token ? `export GITHUB_TOKEN=${JSON.stringify(token)}\n` : "";
  return `${brewEnvPreamble(mountPoint)}
${tokenExport}
if ! allbrew config show >/dev/null 2>&1; then echo "allbrew not configured" >&2; exit 2; fi
LOG=${JSON.stringify(guestLog)}
URL=${JSON.stringify(url)}
NAME=${JSON.stringify(slug)}
AB=$(command -v allbrew || echo ${brewBin}/allbrew)
$AB "$URL" --name "$NAME" --verbose >"$LOG" 2>&1
EC=$?
echo EXIT_CODE=$EC | tee -a "$LOG"
exit 0
`;
}

export function strictVerifyCmd({ pkg, mountPoint }) {
  return `${brewEnvPreamble(mountPoint)}
NAME=${JSON.stringify(pkg)}
echo VERIFY name=$NAME
if brew list --formula "$NAME" >/dev/null 2>&1 || brew list "$NAME" >/dev/null 2>&1; then echo FORMULA_LISTED=1; else echo FORMULA_LISTED=0; fi
if brew list --cask "$NAME" >/dev/null 2>&1; then echo CASK_LISTED=1; else echo CASK_LISTED=0; fi
if test -f "$HOME/.config/allbrew/packages/$NAME.json"; then echo MANIFEST_OK; else echo MANIFEST_MISSING; fi
if command -v "$NAME" >/dev/null 2>&1; then
  if "$NAME" --version >/tmp/ab-bin-out 2>&1 || "$NAME" --help >/tmp/ab-bin-out 2>&1 || "$NAME" -h >/tmp/ab-bin-out 2>&1; then echo BIN_OK; head -5 /tmp/ab-bin-out; else echo BIN_HELP_FAIL; fi
else echo BIN_MISSING; fi
ls "$HOME/Applications" 2>/dev/null | head -10 || true
if ls "$HOME/Applications" 2>/dev/null | grep -qi "$NAME"; then echo APP_OK; fi
INFO=$(brew info "$NAME" 2>/dev/null || true)
echo "$INFO" | head -40
if echo "$INFO" | grep -qi service; then echo SERVICE_STANZA=1; else echo SERVICE_STANZA=0; fi
`;
}

export function uninstallCmd({ pkg, mountPoint, tapPath }) {
  return `${brewEnvPreamble(mountPoint)}
NAME=${JSON.stringify(pkg)}
TAP=${JSON.stringify(tapPath)}
brew services stop "$NAME" 2>/dev/null || true
brew uninstall --force --ignore-dependencies "$NAME" 2>&1 || true
brew uninstall --cask --force "$NAME" 2>&1 || true
rm -f "$TAP/Formula/$NAME.rb" "$TAP/Casks/$NAME.rb" 2>/dev/null || true
rm -f "$HOME/.config/allbrew/packages/$NAME.json" 2>/dev/null || true
echo UNINSTALL_DONE
`;
}

export function fetchFormulaCmd({ pkg, mountPoint, tapPath }) {
  return `${brewEnvPreamble(mountPoint)}
NAME=${JSON.stringify(pkg)}
TAP=${JSON.stringify(tapPath)}
if [ -f "$TAP/Formula/$NAME.rb" ]; then echo "FORMULA_PATH=$TAP/Formula/$NAME.rb"; cat "$TAP/Formula/$NAME.rb"
elif [ -f "$TAP/Casks/$NAME.rb" ]; then echo "FORMULA_PATH=$TAP/Casks/$NAME.rb"; cat "$TAP/Casks/$NAME.rb"
else brew cat "$NAME" 2>/dev/null || brew cat --cask "$NAME" 2>/dev/null || echo MISSING_FORMULA; fi
`;
}
