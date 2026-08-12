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
    // Prefer EXIT_CODE markers when the guest command intentionally exits 0
    // after recording the real install status (see installCmd).
    const fromOut = parseExitCodeLoose(stdout);
    return { exitCode: fromOut ?? 0, stdout: stdout ?? "", stderr: "" };
  } catch (e) {
    const msg = String(e?.message || e);
    const code =
      parseExitCodeLoose(msg) ??
      parseExitCodeLoose(e?.stdout) ??
      parseExitCodeLoose(e?.stderr) ??
      (Number.isInteger(e?.exitCode) ? e.exitCode : null) ??
      (Number.isInteger(e?.code) ? e.code : null) ??
      1;
    return { exitCode: code, stdout: msg, stderr: msg };
  }
}

function parseExitCodeLoose(text) {
  if (text == null) return null;
  const s = String(text);
  const markers = [...s.matchAll(/\bEXIT_CODE=(\d{1,3})\b/g)];
  if (markers.length) {
    const n = Number(markers[markers.length - 1][1]);
    if (Number.isInteger(n) && n >= 0 && n <= 255) return n;
  }
  const patterns = [
    /Command failed with exit code\s+(\d{1,3})\b/i,
    /exited with code\s+(\d{1,3})\b/i,
    /exit code[:\s]+(\d{1,3})\b/i,
    /\(exit code\s+(\d{1,3})\)/i,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n >= 0 && n <= 255) return n;
    }
  }
  return null;
}

export function brewEnvPreamble(mountPoint) {
  const brew = mountPoint ? `${mountPoint}/bin` : "/opt/homebrew/bin";
  return `set +e
set +u
set +o pipefail 2>/dev/null || true
export TMPDIR="\${TMPDIR:-/tmp}"
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
  // Always refresh tap + upgrade so guest picks up freshly released allbrew
  // (probe-only path left stale versions after patch releases).
  const ensure = await guest(
    runAsProjectUser,
    session,
    `${brewEnvPreamble(mountPoint)}
command -v brew; brew --version | head -1
brew tap tariqwest/tap 2>&1 || true
brew trust tariqwest/tap 2>&1 || true
brew trust --formula tariqwest/tap/allbrew 2>&1 || true
brew update 2>&1 | tail -20
if command -v allbrew >/dev/null 2>&1 || test -x ${brewBin}/allbrew; then
  brew upgrade allbrew 2>&1 || brew reinstall allbrew 2>&1
else
  brew install allbrew 2>&1
fi
if command -v allbrew >/dev/null 2>&1; then allbrew --version; exit 0; fi
if test -x ${brewBin}/allbrew; then ${brewBin}/allbrew --version; exit 0; fi
exit 1
`,
    "ensure-allbrew-upgrade",
    { timeout: 600000, stream: true },
  );
  if (ensure.exitCode !== 0 || !ensure.stdout.trim()) {
    throw new Error(`failed to ensure/upgrade allbrew:\n${ensure.stdout}`);
  }
  // Prefer last non-empty line that looks like a version probe
  const lines = ensure.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const verLine = [...lines].reverse().find((l) => /allbrew|^\d+\.\d+\.\d+/.test(l)) || lines.at(-1);
  return verLine;
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

export function installCmdFromSrc({ url, slug, mountPoint, guestLog, token, vmSrcPath }) {
  const tokenExport = token ? `export GITHUB_TOKEN=${JSON.stringify(token)}\n` : "";
  const src = vmSrcPath || `${"$HOME"}/Developer/allbrew`;
  return `${brewEnvPreamble(mountPoint)}
${tokenExport}
if ! allbrew config show >/dev/null 2>&1; then echo "allbrew not configured" >&2; exit 2; fi
LOG=${JSON.stringify(guestLog)}
URL=${JSON.stringify(url)}
NAME=${JSON.stringify(slug)}
SRC=${JSON.stringify(src)}
if [ ! -f "$SRC/bin/allbrew.ts" ]; then echo "SRC_MISSING $SRC" >&2; exit 2; fi
# Prefer running the synced source directly (unreleased patch) over the bottled allbrew.
# Use "bun ./bin/allbrew.ts" (not "bun run bin/allbrew.ts"): modern Bun treats bare
# "run <path>" as a package.json script name and prints help instead of executing the file.
bun --cwd "$SRC" ./bin/allbrew.ts "$URL" --name "$NAME" --verbose >"$LOG" 2>&1
EC=$?
echo EXIT_CODE=$EC | tee -a "$LOG"
exit 0
`;
}

export async function syncAllbrewSrcToVM(h, hostSrcPath, vmDest) {
  const { existsSync } = await import("node:fs");
  const { spawn } = await import("node:child_process");
  const hostQ = h.q(hostSrcPath);
  // Agent worktrees live on the batch child machine. When LUME_REMOTE_ENABLED,
  // h.execHost SSHes to the Lume host where those paths do not exist — run git
  // locally whenever hostSrcPath is present on this filesystem.
  const localSrc = existsSync(hostSrcPath);
  const runHostGit = async (cmd, opts = {}) => {
    if (!localSrc) return h.execHost(cmd, { nothrow: true, ...opts });
    return await new Promise((resolve) => {
      const child = spawn("bash", ["-c", cmd], {
        cwd: hostSrcPath,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => { stdout += d; });
      child.stderr.on("data", (d) => { stderr += d; });
      const timer = opts.timeout
        ? setTimeout(() => {
            try { child.kill("SIGKILL"); } catch {}
          }, opts.timeout)
        : null;
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({
          stdout: stdout.trimEnd(),
          stderr: stderr.trimEnd(),
          exitCode: code ?? 1,
        });
      });
    });
  };
  const branch = await runHostGit(`git rev-parse --abbrev-ref HEAD 2>/dev/null || git branch --show-current 2>/dev/null || echo HEAD`);
  const branchName = (branch.stdout || "").trim() || "HEAD";
  const isHead = branchName === "HEAD";
  const pushRef = isHead ? `HEAD:refs/heads/agent/batch-src-${Date.now()}` : `${branchName}:${branchName}`;
  const pushBranch = isHead ? `agent/batch-src-${Date.now()}` : branchName;
  const effectiveBranch = isHead ? pushBranch : branchName;
  const projectUser = h.config?.projectUser || process.env.TH_PROJECT_USER || "th-allbrew";
  // Per-branch dest avoids concurrent agents overwriting a shared Developer/allbrew
  // checkout (e.g. stuck on agent/smashing while portdeck expects its fix).
  const safeBranch = effectiveBranch.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
  const dest =
    vmDest ||
    `/Users/${projectUser}/Developer/allbrew-src/${safeBranch}`;
  const destQ = h.q(dest);

  // Push host worktree branch to origin so VM can fetch it (works for both local and remote VMs)
  const pushRes = await runHostGit(`git push origin ${pushRef} --force 2>&1`, { timeout: 120000 });
  if (pushRes.exitCode !== 0 && !/Everything up-to-date/.test(pushRes.stdout || "") && !/To /.test(pushRes.stdout || "")) {
    throw new Error(`failed to push allbrew src branch ${pushBranch} to origin:\n${pushRes.stdout}\n${pushRes.stderr}`);
  }

  const remoteUrlRes = await runHostGit(`git remote get-url origin 2>/dev/null || echo https://github.com/tariqwest/allbrew.git`);
  const remoteUrl = (remoteUrlRes.stdout || "https://github.com/tariqwest/allbrew.git").trim();
  const wantShaRes = await runHostGit(`git rev-parse HEAD`);
  const wantSha = (wantShaRes.stdout || "").trim();

  // lumeSshExec runs as user "lume"; the workspace under /Users/th-allbrew is
  // owned by the project user. Always re-exec the sync as the project user so
  // git fetch can write .git/FETCH_HEAD (otherwise: Permission denied).
  const script = [
    "#!/bin/bash",
    "set -euo pipefail",
    `PROJECT_USER=${h.q(projectUser)}`,
    `if [ "$(id -un)" != "$PROJECT_USER" ] && command -v sudo >/dev/null 2>&1; then`,
    `  exec sudo -u "$PROJECT_USER" -H bash "$0" "$@"`,
    `fi`,
    `SRC=${destQ}`,
    `BRANCH=${h.q(effectiveBranch)}`,
    `REMOTE=${h.q(remoteUrl)}`,
    `WANT_SHA=${h.q(wantSha)}`,
    `echo "[sync-src] user=$(id -un) branch=$BRANCH remote=$REMOTE dest=$SRC want=$WANT_SHA"`,
    `mkdir -p "$(dirname "$SRC")"`,
    `if [ -d "$SRC/.git" ]; then`,
    `  echo "[sync-src] existing git repo, fetching branch"`,
    `  git -C "$SRC" config remote.origin.url "$REMOTE" 2>/dev/null || true`,
    `  if ! git -C "$SRC" remote get-url origin >/dev/null 2>&1; then git -C "$SRC" remote add origin "$REMOTE"; fi`,
    `  git -C "$SRC" fetch --force origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" --depth 1 2>&1`,
    `  git -C "$SRC" checkout -B "$BRANCH" "origin/$BRANCH" 2>&1`,
    `  git -C "$SRC" reset --hard "origin/$BRANCH" 2>&1`,
    `else`,
    `  echo "[sync-src] cloning fresh"`,
    `  rm -rf "$SRC"`,
    `  git clone --depth 1 --branch "$BRANCH" "$REMOTE" "$SRC" 2>&1`,
    `fi`,
    `GOT=$(git -C "$SRC" rev-parse HEAD)`,
    `GOT_BRANCH=$(git -C "$SRC" rev-parse --abbrev-ref HEAD)`,
    `echo "[sync-src] got branch=$GOT_BRANCH sha=$GOT"`,
    `if [ -n "$WANT_SHA" ] && [ "$GOT" != "$WANT_SHA" ]; then`,
    `  echo "[sync-src] SHA mismatch want=$WANT_SHA got=$GOT — refetch full"`,
    `  git -C "$SRC" fetch --force origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>&1`,
    `  git -C "$SRC" reset --hard "origin/$BRANCH" 2>&1`,
    `  GOT=$(git -C "$SRC" rev-parse HEAD)`,
    `fi`,
    `if [ -n "$WANT_SHA" ] && [ "$GOT" != "$WANT_SHA" ]; then`,
    `  echo "SRC_SHA_MISMATCH want=$WANT_SHA got=$GOT" >&2`,
    `  exit 1`,
    `fi`,
    `if [ "$GOT_BRANCH" != "$BRANCH" ] && [ "$GOT_BRANCH" != "HEAD" ]; then`,
    `  echo "SRC_BRANCH_MISMATCH want=$BRANCH got=$GOT_BRANCH" >&2`,
    `  exit 1`,
    `fi`,
    `echo "[sync-src] bun install in $SRC"`,
    `if [ -f "$SRC/package.json" ]; then`,
    `  bun --cwd "$SRC" install --frozen-lockfile 2>&1 | tail -20 || bun --cwd "$SRC" install 2>&1 | tail -20 || true`,
    `fi`,
    `test -f "$SRC/bin/allbrew.ts" || { echo "SRC_MISSING after sync: $SRC/bin/allbrew.ts" >&2; exit 1; }`,
    `test -f "$SRC/lib/github.ts" || { echo "SRC_MISSING github.ts" >&2; exit 1; }`,
    `echo "[sync-src] ready $(git -C "$SRC" rev-parse --short HEAD) branch=$(git -C "$SRC" rev-parse --abbrev-ref HEAD)"`,
  ].join("\n");

  const encoded = Buffer.from(script).toString("base64");
  const scriptPath = `/tmp/th-sync-src-${process.pid}.sh`;
  const inner = [
    `echo ${h.q(encoded)} | openssl base64 -d -A > ${h.q(scriptPath)}`,
    `chmod +x ${h.q(scriptPath)}`,
    h.q(scriptPath),
    `rc=$?`,
    `rm -f ${h.q(scriptPath)}`,
    `exit $rc`,
  ].join("\n");

  const res = await h.lumeSshExec(inner, { nothrow: true, timeout: 300000 });
  if (res.exitCode !== 0) {
    throw new Error(`syncAllbrewSrcToVM failed (branch ${effectiveBranch}):\n${res.stdout}\n${res.stderr}`);
  }
  return { branch: effectiveBranch, dest, stdout: res.stdout };
}

export function strictVerifyCmd({ pkg, mountPoint }) {
  return `${brewEnvPreamble(mountPoint)}
# Force unbuffered-ish output for SSH capture
exec 1>&1
NAME=${JSON.stringify(pkg)}
echo VERIFY name=$NAME
echo VERIFY_BEGIN $(date -u +%H:%M:%S)
if brew list --formula "$NAME" >/dev/null 2>&1 || brew list "$NAME" >/dev/null 2>&1; then echo FORMULA_LISTED=1; else echo FORMULA_LISTED=0; fi
if brew list --cask "$NAME" >/dev/null 2>&1; then echo CASK_LISTED=1; else echo CASK_LISTED=0; fi
if test -f "$HOME/.config/allbrew/packages/$NAME.json"; then echo MANIFEST_OK; else echo MANIFEST_MISSING; fi
BIN_OK=0
run_bin_check() {
  local bin="$1"
  # macOS has no timeout(1); use perl alarm
  if perl -e "alarm 12; exec @ARGV" "$bin" --version >/tmp/ab-bin-out 2>&1 \
    || perl -e "alarm 12; exec @ARGV" "$bin" --help >/tmp/ab-bin-out 2>&1 \
    || perl -e "alarm 12; exec @ARGV" "$bin" -h >/tmp/ab-bin-out 2>&1; then
    return 0
  fi
  return 1
}
# TUI / interactive CLIs (gtop, mapscii, manga-tui, …) often lack --version/--help
# or hang without a TTY. If help flags fail but the linked binary is a real
# executable/symlink, treat as installed+runnable (BIN_OK).
accept_bin_no_help() {
  local bin="$1"
  if [ -z "$bin" ]; then return 1; fi
  if [ -L "$bin" ] || [ -x "$bin" ]; then
    if [ -e "$bin" ]; then
      echo BIN_OK
      echo "BIN_TUI_OR_NO_HELP=1"
      echo "BIN_PATH=$bin"
      ls -la "$bin" 2>/dev/null | head -2
      return 0
    fi
  fi
  return 1
}
if command -v "$NAME" >/dev/null 2>&1; then
  echo "BIN_CANDIDATE=$(command -v "$NAME")"
  if run_bin_check "$NAME"; then echo BIN_OK; BIN_OK=1; head -5 /tmp/ab-bin-out
  else
    echo BIN_HELP_FAIL
    cat /tmp/ab-bin-out 2>/dev/null | head -5
    if accept_bin_no_help "$(command -v "$NAME")"; then BIN_OK=1; fi
  fi
fi
# Renamed formulae (core collision → name-tap) keep the original bin (e.g. starship-tap ships bin/starship).
if [ "$BIN_OK" = "0" ]; then
  PREFIX=$(brew --prefix "$NAME" 2>/dev/null || true)
  if [ -n "$PREFIX" ] && [ -d "$PREFIX/bin" ]; then
    for b in "$PREFIX/bin"/*; do
      [ -e "$b" ] || continue
      if [ -x "$b" ] || [ -L "$b" ]; then
        if run_bin_check "$b"; then
          echo BIN_OK; BIN_OK=1; echo "BIN_PATH=$b"; head -5 /tmp/ab-bin-out; break
        elif accept_bin_no_help "$b"; then
          BIN_OK=1; break
        fi
      fi
    done
  fi
fi
if [ "$BIN_OK" = "0" ]; then echo BIN_MISSING; fi
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
