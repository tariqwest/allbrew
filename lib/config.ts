import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile, writeFile, mkdir, chmod, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'allbrew');
const DEFAULT_CONFIG_FILE = join(DEFAULT_CONFIG_DIR, 'config.json');

let _configDir = DEFAULT_CONFIG_DIR;
let _configFile = DEFAULT_CONFIG_FILE;

/** @internal Test-only: override the config directory and file path. */
export function _setConfigDirForTesting(dir: string) {
  _configDir = dir;
  _configFile = join(dir, 'config.json');
}

export type RemoteMode = "local" | "github";

export type AllbrewConfig = {
  tapPath?: string;
  tapName?: string;
  githubUser?: string;
  githubToken?: string;
  remoteMode?: RemoteMode;
  update?: {
    autoPush?: boolean;
    scheduleHours?: number;
  };
};

export async function loadConfig(): Promise<AllbrewConfig> {
  try {
    const data = await readFile(_configFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function saveConfig(config: AllbrewConfig) {
  await mkdir(_configDir, { recursive: true, mode: 0o700 });
  await writeFile(_configFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  await chmod(_configFile, 0o600);
}

export async function getTapPath() {
  const config = await loadConfig();
  return config.tapPath || null;
}

export async function setTapPath(tapPath: string) {
  const resolved = resolve(tapPath);

  try {
    const info = await stat(resolved);
    if (!info.isDirectory()) {
      throw new Error(`Tap path is not a directory: ${resolved}`);
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      await mkdir(join(resolved, "Formula"), { recursive: true });
      await mkdir(join(resolved, "Casks"), { recursive: true });
    } else {
      throw err;
    }
  }

  const config = await loadConfig();
  config.tapPath = resolved;
  await saveConfig(config);
  return config.tapPath;
}

export async function setUpdateAutoPush(autoPush: boolean) {
  const config = await loadConfig();
  config.update = { ...config.update, autoPush };
  await saveConfig(config);
  return autoPush;
}

export async function setUpdateScheduleHours(hours: number) {
  const config = await loadConfig();
  config.update = { ...config.update, scheduleHours: hours };
  await saveConfig(config);
  return hours;
}

export async function setGithubToken(token: string) {
  const config = await loadConfig();
  config.githubToken = token;
  await saveConfig(config);
}

export async function setGithubUser(user: string) {
  const config = await loadConfig();
  config.githubUser = user;
  await saveConfig(config);
}

export async function setRemoteMode(mode: RemoteMode) {
  const config = await loadConfig();
  config.remoteMode = mode;
  await saveConfig(config);
}

export async function getGithubToken(): Promise<string | null> {
  const config = await loadConfig();
  return config.githubToken || process.env.GITHUB_TOKEN || null;
}

export function getConfigPath() {
  return _configFile;
}

export function getConfigDir() {
  return _configDir;
}
