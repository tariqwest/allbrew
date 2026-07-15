import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile, writeFile, mkdir, chmod, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const CONFIG_DIR = join(homedir(), '.config', 'allbrew');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

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
    const data = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function saveConfig(config: AllbrewConfig) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  await chmod(CONFIG_FILE, 0o600);
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
  return CONFIG_FILE;
}

export function getConfigDir() {
  return CONFIG_DIR;
}
