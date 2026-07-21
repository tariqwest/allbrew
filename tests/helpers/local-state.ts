/**
 * Local state snapshot/restore for E2E tests.
 *
 * Captures the full ~/.config/allbrew/ directory before a test run and
 * restores it after, so local E2E runs do not pollute the user's real
 * allbrew config or manifests. Snapshots are preserved under
 * tests/e2e-runs/local/<timestamp>/ so the manual cleanup script
 * (scripts/test-local-cleanup.sh) can recover from a killed test run.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import {
  cp,
  rm,
  mkdir,
  readFile,
  writeFile,
  symlink,
  readlink,
  lstat,
  readdir,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";

const CONFIG_DIR = join(homedir(), ".config", "allbrew");
const REPO_ROOT = process.cwd();
const RUNS_DIR = join(REPO_ROOT, "tests", "e2e-runs", "local");
const LATEST_LINK = join(RUNS_DIR, "latest");

export type LocalStateSnapshot = {
  runDir: string;
  configBackupDir: string;
  timestamp: string;
  /** True if there was no ~/.config/allbrew to snapshot. */
  empty: boolean;
};

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Run a shell command and return its stdout+stderr. Used by captureLocalReadout
 * to gather system state. Returns "(command failed or produced no output)" on
 * error so the readout always has a section body.
 */
function runSection(cmd: string): string {
  const result = spawnSync("bash", ["-c", cmd], {
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, PATH: `${process.env.HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return out || "(command failed or produced no output)";
}

/**
 * Snapshot ~/.config/allbrew/ into a fresh run-record directory.
 * Returns a handle that can be passed to restoreLocalState().
 */
export async function snapshotLocalState(): Promise<LocalStateSnapshot> {
  const ts = timestamp();
  const runDir = join(RUNS_DIR, ts);
  const configBackupDir = join(runDir, "config-backup");

  await mkdir(runDir, { recursive: true });

  const empty = !existsSync(CONFIG_DIR);
  if (!empty) {
    await cp(CONFIG_DIR, configBackupDir, { recursive: true });
  } else {
    await mkdir(configBackupDir, { recursive: true });
  }

  // Update the `latest` symlink. Remove an existing one first; lstat so we
  // do not follow it when unlinking.
  try {
    const existing = await lstat(LATEST_LINK).catch(() => null);
    if (existing && (existing.isSymbolicLink() || existing.isFile())) {
      await rm(LATEST_LINK, { force: true });
    }
    await symlink(runDir, LATEST_LINK);
  } catch (err: any) {
    // Fallback: write a plain file with the path if symlink fails (e.g. on
    // filesystems that do not support symlinks without admin privileges).
    await writeFile(LATEST_LINK, runDir + "\n", "utf-8").catch(() => {});
  }

  await writeFile(
    join(runDir, "snapshot.json"),
    JSON.stringify(
      { timestamp: ts, runDir, configBackupDir, empty, configDir: CONFIG_DIR },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  return { runDir, configBackupDir, timestamp: ts, empty };
}

/**
 * Restore ~/.config/allbrew/ from a snapshot, replacing the current contents.
 * Safe to call even if the snapshot was empty (the config dir will be removed).
 */
export async function restoreLocalState(
  snapshot: LocalStateSnapshot,
): Promise<void> {
  // Remove the current config dir entirely, then copy the backup back.
  await rm(CONFIG_DIR, { recursive: true, force: true }).catch(() => {});
  if (!snapshot.empty) {
    await cp(snapshot.configBackupDir, CONFIG_DIR, { recursive: true });
  }
}

/**
 * Resolve the most recent local snapshot directory by following the
 * `latest` symlink (or reading the fallback file). Returns null if no
 * snapshot exists.
 */
export async function getLatestSnapshotDir(): Promise<string | null> {
  try {
    const stat = await lstat(LATEST_LINK).catch(() => null);
    if (!stat) return null;
    if (stat.isSymbolicLink()) {
      return await readlink(LATEST_LINK);
    }
    const data = await readFile(LATEST_LINK, "utf-8");
    return data.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Read the snapshot.json from a run directory. Returns null if missing.
 */
export async function readSnapshot(
  runDir: string,
): Promise<LocalStateSnapshot | null> {
  try {
    const data = await readFile(join(runDir, "snapshot.json"), "utf-8");
    const parsed = JSON.parse(data);
    return {
      runDir: parsed.runDir,
      configBackupDir: parsed.configBackupDir,
      timestamp: parsed.timestamp,
      empty: !!parsed.empty,
    };
  } catch {
    return null;
  }
}

/**
 * List disposable test taps currently registered with Homebrew.
 * Matches the naming pattern used by tests/e2e-tap/helpers/tap.ts:
 *   test/e2e-tap-<pid>-<seq>
 */
export function listDisposableTaps(): string[] {
  const result = spawnSync("brew", ["tap"], { encoding: "utf-8" });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => /^test\/e2e-tap-\d+-\d+$/.test(line));
}

/**
 * List packages installed from a given tap (full names like
 * `test/e2e-tap-123-1/fake-npm`).
 */
export function listPackagesFromTap(tap: string): string[] {
  const result = spawnSync("brew", ["list", "--full-name"], {
    encoding: "utf-8",
  });
  if (result.status !== 0) return [];
  const prefix = `${tap}/`;
  return result.stdout
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix));
}

/**
 * Capture a post-test readout into the snapshot's run directory, mirroring
 * scripts/e2e-vm-readout.sh. Writes readout.txt and metadata.json.
 *
 * Should be called BEFORE restoreLocalState() so the readout reflects the
 * post-test, pre-restore state (i.e. shows any test residue).
 *
 * @param snapshot  The snapshot handle from snapshotLocalState()
 * @param testLog   Optional path to a test output log (e.g. from tee). If
 *                  provided, it is copied into the run dir as
 *                  test-output.log and a Test Results Summary section is
 *                  parsed from it.
 */
export async function captureLocalReadout(
  snapshot: LocalStateSnapshot,
  testLog?: string,
): Promise<void> {
  const readoutFile = join(snapshot.runDir, "readout.txt");
  const metadataFile = join(snapshot.runDir, "metadata.json");

  const sections: { title: string; body: string }[] = [];

  // --- System state ---
  sections.push({
    title: "System Info",
    body: runSection(
      'echo "macOS: $(sw_vers -productVersion)"; echo "Arch: $(uname -m)"; echo "CPU: $(sysctl -n hw.ncpu) cores"; echo "RAM: $(($(sysctl -n hw.memsize) / 1024 / 1024 / 1024)) GB"; echo "Disk:"; df -h / | tail -1',
    ),
  });

  sections.push({
    title: "Running Processes (brew/allbrew/node/bun)",
    body: runSection('ps aux | grep -E "brew|allbrew|node|bun" | grep -v grep || echo "(none)"'),
  });

  // --- allbrew state ---
  sections.push({
    title: "allbrew Version",
    body: runSection(
      `allbrew --version 2>/dev/null || bun run "${join(REPO_ROOT, "bin/allbrew.ts")}" --version 2>/dev/null || echo "(allbrew not found)"`,
    ),
  });

  sections.push({
    title: "allbrew Config",
    body: runSection('cat ~/.config/allbrew/config.json 2>/dev/null || echo "(no config file)"'),
  });

  sections.push({
    title: "allbrew Manifests",
    body: runSection(
      'ls -la ~/.config/allbrew/packages/ 2>/dev/null && echo "---" && for f in ~/.config/allbrew/packages/*.json; do echo "=== $(basename "$f") ==="; cat "$f"; echo; done 2>/dev/null || echo "(no manifests)"',
    ),
  });

  sections.push({
    title: "allbrew Global Link",
    body: runSection('which allbrew 2>/dev/null && ls -la "$(which allbrew)" 2>/dev/null || echo "(not linked)"'),
  });

  // --- Homebrew state ---
  sections.push({
    title: "Homebrew Version",
    body: runSection('brew --version 2>/dev/null || echo "(Homebrew not installed)"'),
  });

  sections.push({
    title: "Homebrew Taps",
    body: runSection('brew tap 2>/dev/null || echo "(none)"'),
  });

  sections.push({
    title: "Installed Formulae",
    body: runSection('brew list --formula --versions 2>/dev/null || echo "(none)"'),
  });

  sections.push({
    title: "Installed Casks",
    body: runSection('brew list --cask --versions 2>/dev/null || echo "(none)"'),
  });

  sections.push({
    title: "Cellar Contents",
    body: runSection('ls -la "$(brew --prefix)/Cellar/" 2>/dev/null || echo "(empty or missing)"'),
  });

  sections.push({
    title: "Caskroom Contents",
    body: runSection('ls -la "$(brew --prefix)/Caskroom/" 2>/dev/null || echo "(empty or missing)"'),
  });

  sections.push({
    title: "Homebrew Cache",
    body: runSection('du -sh "$(brew --cache)" 2>/dev/null || echo "(no cache)"'),
  });

  // --- MAS apps ---
  sections.push({
    title: "MAS Apps",
    body: runSection('mas list 2>/dev/null || echo "(mas not installed or no apps)"'),
  });

  // --- Setapp ---
  sections.push({
    title: "Setapp Apps",
    body: runSection(
      'ls -la /Applications/Setapp/ 2>/dev/null || echo "(Setapp not installed)"; ls ~/.setapp 2>/dev/null || true',
    ),
  });

  // --- /Applications listing ---
  sections.push({
    title: "/Applications Contents",
    body: runSection("ls -la /Applications/ 2>/dev/null | head -50"),
  });

  // --- Tap repo git state ---
  sections.push({
    title: "Tap Repo Git State",
    body: runSection(
      'TAP_PATH=$(python3 -c "import json;print(json.load(open(\\"$HOME/.config/allbrew/config.json\\")).get(\\"tapPath\\",\\"\\"))" 2>/dev/null || echo ""); ' +
        'if [ -n "$TAP_PATH" ] && [ -d "$TAP_PATH/.git" ]; then ' +
        'echo "Tap path: $TAP_PATH"; cd "$TAP_PATH"; ' +
        'echo "--- git log (last 10) ---"; git log --oneline -10 2>/dev/null; ' +
        'echo "--- git status ---"; git status --short 2>/dev/null; ' +
        'echo "--- git diff (stat) ---"; git diff --stat 2>/dev/null; ' +
        'echo "--- Formula/ contents ---"; ls -la Formula/ 2>/dev/null || echo "(no Formula dir)"; ' +
        'echo "--- Casks/ contents ---"; ls -la Casks/ 2>/dev/null || echo "(no Casks dir)"; ' +
        'else echo "(no tap repo found or not a git repo)"; fi',
    ),
  });

  // --- Host repo git state ---
  sections.push({
    title: "Host allbrew Repo Git State",
    body: runSection(
      `cd "${REPO_ROOT}" && echo "Branch: $(git branch --show-current)"; ` +
        'echo "--- git log (last 5) ---"; git log --oneline -5; ' +
        'echo "--- git status ---"; git status --short',
    ),
  });

  // --- Test results summary ---
  let testLogCopied = false;
  if (testLog && existsSync(testLog)) {
    const destLog = join(snapshot.runDir, "test-output.log");
    if (testLog !== destLog) {
      try {
        await cp(testLog, destLog);
        testLogCopied = true;
      } catch {}
    }
    const logDataRaw = await readFile(testLog, "utf-8").catch(() => "");
    // Strip ANSI escape codes so regexes can match vitest's colored output.
    const logData = logDataRaw.replace(/\x1b\[[0-9;]*m/g, "");
    const passMatch = logData.match(/Tests\s+(\d+)\s+passed/);
    const failMatch = logData.match(/Tests\s+(\d+)\s+failed/);
    const filesMatch = logData.match(/Test Files\s+(\d+)\s+passed(?:\s+(\d+)\s+failed)?/);
    const summaryParts: string[] = [];
    if (filesMatch) {
      summaryParts.push(`Test Files: ${filesMatch[1]} passed${filesMatch[2] ? `, ${filesMatch[2]} failed` : ""}`);
    }
    if (passMatch) summaryParts.push(`Tests: ${passMatch[1]} passed`);
    if (failMatch) summaryParts.push(`Tests: ${failMatch[1]} failed`);
    sections.push({
      title: `Test Results Summary (from ${testLog})`,
      body:
        summaryParts.length > 0
          ? summaryParts.join("\n") +
            `\n\nFull test output: ${destLog}`
          : "(could not parse test results — see test-output.log)",
    });
  } else {
    sections.push({
      title: "Test Results Summary",
      body: "(no test log provided — set ALLBREW_TEST_LOG env var)",
    });
  }

  // --- Assemble readout.txt ---
  const lines: string[] = [
    "==========================================",
    "  allbrew Local E2E Run Readout",
    `  Timestamp:  ${snapshot.timestamp}`,
    `  Run dir:    ${snapshot.runDir}`,
    `  Host repo:  ${REPO_ROOT}`,
    `  Config:     ${snapshot.empty ? "(was empty)" : CONFIG_DIR}`,
    "==========================================",
    "",
  ];
  for (const s of sections) {
    lines.push("------------------------------------------");
    lines.push(`  ${s.title}`);
    lines.push("------------------------------------------");
    lines.push(s.body);
    lines.push("");
  }
  await writeFile(readoutFile, lines.join("\n") + "\n", "utf-8");

  // --- Write metadata.json ---
  const gitSha = runSection(`cd "${REPO_ROOT}" && git rev-parse HEAD 2>/dev/null || echo unknown`);
  const gitBranch = runSection(
    `cd "${REPO_ROOT}" && git branch --show-current 2>/dev/null || echo unknown`,
  );
  const metadata = {
    timestamp: snapshot.timestamp,
    runDir: snapshot.runDir,
    hostRepo: REPO_ROOT,
    configDir: CONFIG_DIR,
    configEmpty: snapshot.empty,
    testLog: testLog || null,
    testLogCopied,
    hostGitSha: gitSha,
    hostGitBranch: gitBranch,
  };
  await writeFile(metadataFile, JSON.stringify(metadata, null, 2) + "\n", "utf-8");
}
