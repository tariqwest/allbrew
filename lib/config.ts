import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const CONFIG_DIR = join(homedir(), '.config', 'allbrew');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export type AllbrewConfig = {
  tapPath?: string;
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

export function getConfigPath() {
  return CONFIG_FILE;
}
