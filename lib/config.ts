import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function getTapPath() {
  const config = await loadConfig();
  return config.tapPath || null;
}

export async function setTapPath(tapPath: string) {
  const config = await loadConfig();
  config.tapPath = resolve(tapPath);
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
