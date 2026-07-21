import { execFile } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { loadConfig } from "./config.ts";
import { getBrewPrefix } from "./brew-hooks.ts";

const execFileAsync = promisify(execFile);

const LABEL = "com.allbrew.update";

export function launchAgentPath() {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

export function logPath() {
  return join(homedir(), "Library", "Logs", "allbrew-update.log");
}

export async function updateScriptPath() {
  const prefix = await getBrewPrefix();
  return join(prefix, "libexec", "allbrew", "update-managed.sh");
}

export async function writeUpdateScript(
  scriptPath: string,
  opts?: { allbrewBin?: string; brewPrefix?: string },
) {
  const allbrewBin = opts?.allbrewBin ?? await resolveAllbrewPath();
  const brewPrefix = opts?.brewPrefix ?? await getBrewPrefix();
  const pathEntries = [
    dirname(allbrewBin),
    join(brewPrefix, "bin"),
    process.env.PATH,
    "/usr/bin:/bin:/usr/sbin:/sbin",
  ]
    .filter(Boolean)
    .join(":");
  const log = logPath();
  const content = `#!/bin/bash
set -euo pipefail
export PATH="${pathEntries}"
LOG="${log}"
if [ -f "$LOG" ]; then
  SIZE=$(stat -f%z "$LOG" 2>/dev/null || echo 0)
  if [ "$SIZE" -gt 10485760 ]; then
    mv "$LOG" "${log}.1"
  fi
fi
exec >> "$LOG" 2>&1
echo "--- allbrew update-managed: $(date) ---"
brew update
brew livecheck --installed --newer-only --json --quiet | ${allbrewBin} update-formulas
`;
  await mkdir(dirname(scriptPath), { recursive: true });
  await writeFile(scriptPath, content, { mode: 0o755 });
}

async function resolveAllbrewPath(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("bash", [
      "-c",
      "command -v allbrew",
    ]);
    const resolved = stdout.trim();
    if (resolved && existsSync(resolved)) {
      return resolved;
    }
  } catch {
    // fall through
  }

  const fallback = join(await getBrewPrefix(), "bin", "allbrew");
  if (existsSync(fallback)) {
    return fallback;
  }

  throw new Error(
    "Could not resolve allbrew binary. Make sure allbrew is installed and on PATH.",
  );
}

export function plistContent(scriptPath: string, intervalSeconds: number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${scriptPath}</string>
  </array>
  <key>StartInterval</key>
  <integer>${intervalSeconds}</integer>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
}

export async function installLaunchdService() {
  const config = await loadConfig();
  const hours = config.update?.scheduleHours ?? 6;
  const intervalSeconds = hours * 60 * 60;
  const scriptPath = await updateScriptPath();
  await writeUpdateScript(scriptPath);

  const plist = plistContent(scriptPath, intervalSeconds);
  const agentPath = launchAgentPath();
  await mkdir(join(agentPath, ".."), { recursive: true });
  await writeFile(agentPath, plist, "utf-8");

  await execFileAsync("launchctl", ["load", "-w", agentPath]);
  return { agentPath, scriptPath, intervalSeconds };
}

export async function uninstallLaunchdService() {
  const agentPath = launchAgentPath();
  try {
    await execFileAsync("launchctl", ["unload", "-w", agentPath]);
    await unlink(agentPath);
  } catch {
    // ignore
  }
  return agentPath;
}
