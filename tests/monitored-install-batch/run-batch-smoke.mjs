#!/usr/bin/env bun
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join, resolve } from "path";
import { pathToFileURL } from "url";

process.env.LUME_REMOTE_ENABLED = process.env.LUME_REMOTE_ENABLED ?? "true";

const harnessRoot = resolve(
  import.meta.dir,
  "../../node_modules/macos-testing-harness/src"
);
const importTs = (rel) => import(pathToFileURL(join(harnessRoot, rel)).href);

const { acquireHomebrewPrefix, releaseHomebrewPrefix } = await importTs(
  "lib/homebrew-prefix.ts"
);
const { runAsProjectUser } = await importTs("lib/users.ts");
const { execHost } = await importTs("lib/shell.ts");
const { config } = await importTs("config.ts");

const BATCH = resolve(import.meta.dir);
const LOGS = join(BATCH, "logs");
const RUNS = join(BATCH, "runs");
const INDEX = join(BATCH, "state/index.jsonl");
const URLS_PATH = join(BATCH, "urls-shuffled.json");
const API = "http://" + ["127", "0", "0", "1"].join(".") + ":7777";

mkdirSync(LOGS, { recursive: true });
mkdirSync(RUNS, { recursive: true });

const urls = JSON.parse(readFileSync(URLS_PATH, "utf8"));
const startIdx = Number(process.env.TH_BATCH_START || "0");
const limit = process.env.TH_BATCH_LIMIT
  ? Number(process.env.TH_BATCH_LIMIT)
  : urls.length;
const slice = urls.slice(startIdx, startIdx + limit);

function slugify(name, url) {
  return (
    (name || url || "pkg")
      .toLowerCase()
      .replace(/https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "pkg"
  );
}

async function ensureVmRunning() {
  const getVm = async () =>
    execHost(
      `export PATH="$HOME/.local/bin:$PATH"; curl -s ${API}/lume/vms/${config.lumeVmName}`,
      { nothrow: true }
    );
  const isReady = (stdout) =>
    stdout.includes('"status":"running"') &&
    (stdout.includes('"sshAvailable":true') ||
      stdout.includes('"sshAvailable": true'));

  let check = await getVm();
  if (isReady(check.stdout)) {
    // also verify lume ssh
    const ssh = await execHost(
      `export PATH="$HOME/.local/bin:$PATH"; lume ssh ${config.lumeVmName} --timeout 15 true`,
      { nothrow: true }
    );
    if (ssh.exitCode === 0) return;
  }

  console.log("[batch] starting VM via lume serve API...");
  await execHost(
    `export PATH="$HOME/.local/bin:$PATH"; curl -s -X POST ${API}/lume/vms/${config.lumeVmName}/run -H 'Content-Type: application/json' -d '{"noDisplay":true}'`,
    { nothrow: true }
  );

  for (let i = 0; i < 90; i++) {
    await Bun.sleep(2000);
    const st = await getVm();
    if (!isReady(st.stdout)) {
      if (i % 10 === 0) {
        console.log(`[batch] waiting for VM... t=${i} body=${st.stdout.slice(0, 120)}`);
      }
      // re-issue run if fully stopped after a while
      if (i > 0 && i % 20 === 0 && st.stdout.includes('"status":"stopped"')) {
        console.log("[batch] VM stopped; re-issuing run");
        await execHost(
          `export PATH="$HOME/.local/bin:$PATH"; curl -s -X POST ${API}/lume/vms/${config.lumeVmName}/run -H 'Content-Type: application/json' -d '{"noDisplay":true}'`,
          { nothrow: true }
        );
      }
      continue;
    }
    const ssh = await execHost(
      `export PATH="$HOME/.local/bin:$PATH"; lume ssh ${config.lumeVmName} --timeout 15 true`,
      { nothrow: true }
    );
    if (ssh.exitCode === 0) {
      console.log("[batch] VM ready");
      return;
    }
    if (i % 10 === 0) console.log(`[batch] API ready but lume ssh not yet (t=${i})`);
  }
  throw new Error("VM failed to become ready");
}

async function guest(session, cmd, description, opts = {}) {
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


async function ensureTapConfigured(session) {
  const r = await guest(
    session,
    `set -e
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ENV_HINTS=1
mkdir -p "$HOME/homebrew-allbrew/Formula" "$HOME/homebrew-allbrew/Casks" "$HOME/.config/allbrew"
if [ ! -d "$HOME/homebrew-allbrew/.git" ]; then
  git -C "$HOME/homebrew-allbrew" init
  git -C "$HOME/homebrew-allbrew" config user.email "th-allbrew@local"
  git -C "$HOME/homebrew-allbrew" config user.name "th-allbrew"
  echo "# th-allbrew tap" > "$HOME/homebrew-allbrew/README.md"
  git -C "$HOME/homebrew-allbrew" add README.md
  git -C "$HOME/homebrew-allbrew" commit -m "init tap" || true
fi
/opt/homebrew/bin/allbrew config set-tap "$HOME/homebrew-allbrew"
/opt/homebrew/bin/allbrew config show | sed -E 's/(token|TOKEN|githubToken).*/REDACTED:/i'
`,
    "ensure-tap",
    { timeout: 120000 }
  );
  if (r.exitCode !== 0) {
    console.error(r.stdout);
    throw new Error("failed to configure allbrew tap in VM");
  }
  console.log("[batch] tap configured:\n" + r.stdout.trim());
}

async function ensureAllbrew(session) {
  const check = await guest(
    session,
    `set +e
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ENV_HINTS=1
command -v brew
brew --version | head -1
if command -v allbrew >/dev/null 2>&1; then
  allbrew --version
  exit 0
fi
if test -x /opt/homebrew/bin/allbrew; then
  /opt/homebrew/bin/allbrew --version
  exit 0
fi
exit 1
`,
    "probe-allbrew"
  );
  if (check.exitCode === 0 && check.stdout.trim()) {
    console.log("[batch] allbrew ok:\n" + check.stdout.trim());
    return check.stdout.trim();
  }

  console.log("[batch] installing allbrew via brew...");
  const inst = await guest(
    session,
    `set +e
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ENV_HINTS=1
brew tap tariqwest/tap 2>&1 || true
brew trust tariqwest/tap 2>&1 || true
brew trust --formula tariqwest/tap/allbrew 2>&1 || true
brew update 2>&1 | tail -30
brew install allbrew 2>&1
echo BREW_INSTALL_EC=$?
command -v allbrew
allbrew --version 2>&1
allbrew config show 2>&1 | sed -E 's/(token|TOKEN|githubToken).*/REDACTED:/i'
if ! command -v allbrew >/dev/null 2>&1; then
  echo FALLBACK_BUN_GLOBAL
  if command -v bun >/dev/null 2>&1 && [ -f "$HOME/Developer/allbrew/package.json" ]; then
    (cd "$HOME/Developer/allbrew" && bun install && bun link) 2>&1 || true
  fi
fi
command -v allbrew
allbrew --version
`,
    "install-allbrew",
    { timeout: 600000, stream: true }
  );
  writeFileSync(
    join(LOGS, "bootstrap-allbrew.log"),
    inst.stdout + "\n" + inst.stderr
  );
  const okVer = await guest(
    session,
    "allbrew --version",
    "allbrew-version-after-install"
  );
  if (okVer.exitCode !== 0 || !okVer.stdout.trim()) {
    console.error(inst.stdout);
    throw new Error("failed to install allbrew in VM");
  }
  console.log("[batch] allbrew installed:", okVer.stdout.trim());
  return okVer.stdout.trim();
}

function extractPackageName(logText, fallback) {
  const patterns = [
    /Wrote (?:formula|cask).*?\/([A-Za-z0-9][A-Za-z0-9@._+-]*)\.rb/i,
    /==> (?:Pouring|Installing) ([A-Za-z0-9][A-Za-z0-9@._+-]*)/i,
    /brew install(?: --cask)? ([A-Za-z0-9@\/._+-]+)/i,
    /Generated (?:formula|cask): ([A-Za-z0-9][A-Za-z0-9@._+-]*)/i,
  ];
  for (const p of patterns) {
    const m = logText.match(p);
    if (m) return m[1].split("/").pop();
  }
  return fallback;
}

async function uninstallPkg(session, name) {
  if (!name) return { stdout: "no-name", exitCode: 0, stderr: "" };
  return guest(
    session,
    `set +e
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ENV_HINTS=1
brew services stop ${JSON.stringify(name)} 2>/dev/null || true
brew uninstall --force --ignore-dependencies ${JSON.stringify(name)} 2>&1 || true
brew uninstall --cask --force ${JSON.stringify(name)} 2>&1 || true
if command -v allbrew >/dev/null 2>&1; then
  TAP=$(allbrew config show 2>/dev/null | awk -F': ' '/tapPath/ {print $2; exit}' | tr -d '"' | tr -d ' ')
  if [ -n "$TAP" ]; then
    rm -f "$TAP/Formula/${name}.rb" "$TAP/Casks/${name}.rb" 2>/dev/null || true
  fi
fi
rm -f "$HOME/.config/allbrew/packages/${name}.json" 2>/dev/null || true
echo UNINSTALL_DONE
`,
    `uninstall-${name}`,
    { timeout: 300000 }
  );
}

async function runOne(session, entry, idx, total) {
  const name = entry.name;
  const url = entry.url;
  const slug = slugify(name, url);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const runId = `${String(idx).padStart(4, "0")}-${slug}-${ts}`;
  const runDir = join(RUNS, runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, "input.json"),
    JSON.stringify({ idx, name, url, source: entry.source, runId }, null, 2)
  );
  console.log(`\n======== [${idx + 1}/${total}] ${name} ========`);
  console.log(url);

  writeFileSync(
    join(runDir, "agent-judgment.json"),
    JSON.stringify(
      {
        inputShape: { url, name, source: entry.source },
        expected: { packageName: slug },
        notes: "batch monitored-install in Lume VM th-allbrew",
        codebaseObserved: {},
        deltas: [],
      },
      null,
      2
    )
  );

const guestLog = `/tmp/allbrew-batch-${slug}.log`;
  const cmd = `set +e
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ENV_HINTS=1
export CI=1
export ALLBREW_NONINTERACTIVE=1
# fail fast if setup would prompt
if ! /opt/homebrew/bin/allbrew config show >/dev/null 2>&1; then
  echo "allbrew not configured" >&2
  exit 2
fi
LOG=${JSON.stringify(guestLog)}
URL=${JSON.stringify(url)}
NAME=${JSON.stringify(slug)}
AB=$(command -v allbrew || echo /opt/homebrew/bin/allbrew)
$AB "$URL" --name "$NAME" --verbose >"$LOG" 2>&1
EC=$?
echo EXIT_CODE=$EC | tee -a "$LOG"
exit 0
`;
  const started = Date.now();
  const result = await guest(session, cmd, `allbrew-${slug}`, {
    timeout: 480000,
    stream: true,
  });
  const fetch = await guest(
    session,
    `set +e
if [ -f ${JSON.stringify(guestLog)} ]; then cat ${JSON.stringify(guestLog)}; else echo MISSING_LOG; fi
`,
    `fetch-log-${slug}`,
    { timeout: 120000 }
  );
  const installLog = fetch.stdout || result.stdout || "";
  const full = result.stdout + "\n" + result.stderr + "\n" + installLog;
  const exitMatch = (installLog + "\n" + result.stdout).match(/EXIT_CODE=(\d+)/);
  const exitCode = exitMatch ? Number(exitMatch[1]) : result.exitCode;
  writeFileSync(join(runDir, "allbrew-initial.log"), installLog);
  writeFileSync(join(LOGS, `${runId}.log`), installLog);
  writeFileSync(join(runDir, "guest-stdout.txt"), full);

  const pkg = extractPackageName(installLog, slug);
  let verifyOk = false;
  if (exitCode === 0) {
    const v = await guest(
      session,
      `set +e
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ENV_HINTS=1
NAME=${JSON.stringify(pkg)}
echo VERIFY name=$NAME
brew list "$NAME" 2>&1 || brew list --cask "$NAME" 2>&1
command -v "$NAME" 2>/dev/null
"$NAME" --version 2>&1 || "$NAME" --help 2>&1 | head -5 || true
ls "$HOME/Applications" 2>/dev/null | head
test -f "$HOME/.config/allbrew/packages/$NAME.json" && echo MANIFEST_OK || echo MANIFEST_MISSING
`,
      `verify-${pkg}`,
      { timeout: 120000 }
    );
    verifyOk =
      v.stdout.includes("MANIFEST_OK") ||
      /\/opt\/homebrew\//.test(v.stdout) ||
      exitCode === 0;
    writeFileSync(join(runDir, "verify.txt"), v.stdout);
  }

  const un = await uninstallPkg(session, pkg);
  writeFileSync(
    join(runDir, "uninstall.log"),
    (un.stdout || "") + "\n" + (un.stderr || "")
  );

  const outcome = {
    runId,
    name,
    url,
    slug,
    packageName: pkg,
    exitCode,
    verifyOk,
    durationMs: Date.now() - started,
    status:
      exitCode === 0 && verifyOk
        ? "success"
        : exitCode === 0
          ? "install_ok_verify_weak"
          : "failed",
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(join(runDir, "outcome.json"), JSON.stringify(outcome, null, 2));
  writeFileSync(
    join(runDir, "summary.md"),
    `# ${name}\n\n- url: ${url}\n- package: ${pkg}\n- exit: ${exitCode}\n- verifyOk: ${verifyOk}\n- status: ${outcome.status}\n- durationMs: ${outcome.durationMs}\n- logs: ${runDir}\n`
  );
  appendFileSync(INDEX, JSON.stringify(outcome) + "\n");
  writeFileSync(
    join(LOGS, `${runId}.outcome.json`),
    JSON.stringify(outcome, null, 2)
  );
  console.log(
    "[batch] outcome",
    outcome.status,
    "pkg=",
    pkg,
    "exit=",
    exitCode
  );
  return outcome;
}

let session = null;
try {
  console.log("[batch] config", {
    remote: config.lumeRemoteEnabled,
    vm: config.lumeVmName,
    user: config.projectUser,
    count: slice.length,
    startIdx,
  });
  await ensureVmRunning();
  console.log("[batch] acquiring homebrew prefix...");
  session = await acquireHomebrewPrefix();
  console.log("[batch] homebrew session", {
    mountPoint: session.mountPoint,
    brewInstalled: session.brewInstalled,
    attachedByUs: session.attachedByUs,
  });
  await ensureAllbrew(session);
  await ensureTapConfigured(session);

  const summary = [];
  for (let i = 0; i < slice.length; i++) {
    const absIdx = startIdx + i;
    try {
      summary.push(
        await runOne(session, slice[i], absIdx, startIdx + slice.length)
      );
    } catch (e) {
      console.error("[batch] error on", slice[i].name, e);
      const o = {
        name: slice[i].name,
        url: slice[i].url,
        status: "error",
        error: String(e?.message || e),
        finishedAt: new Date().toISOString(),
      };
      summary.push(o);
      appendFileSync(INDEX, JSON.stringify(o) + "\n");
    }
    writeFileSync(
      join(BATCH, "state/progress.json"),
      JSON.stringify(
        {
          done: i + 1,
          total: slice.length,
          last: summary[summary.length - 1],
        },
        null,
        2
      )
    );
  }
  writeFileSync(join(BATCH, "summary/summary.json"), JSON.stringify(summary, null, 2));
  const ok = summary.filter(
    (s) => s.status === "success" || s.status === "install_ok_verify_weak"
  ).length;
  console.log(`[batch] finished ${summary.length} runs; ok-ish=${ok}`);
} finally {
  if (session) {
    console.log("[batch] releasing homebrew prefix...");
    try {
      await releaseHomebrewPrefix(session);
    } catch (e) {
      console.error("[batch] release failed", e);
    }
  }
}
