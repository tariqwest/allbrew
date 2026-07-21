import { readFile, writeFile, mkdir, copyFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "allbrew");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const PACKAGES_DIR = join(CONFIG_DIR, "packages");

export async function backupConfig(): Promise<string | null> {
  // Lightweight backup of config.json only, used for inter-describe isolation.
  // Full ~/.config/allbrew/ snapshot/restore is handled by the e2e-tap
  // local runner script (see scripts/e2e-tap-local-runner.ts).
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    const backupDir = await mkdtemp(join(tmpdir(), "allbrew-cfg-backup-"));
    await writeFile(join(backupDir, "config.json"), data);
    return backupDir;
  } catch {
    return null;
  }
}

export async function restoreConfig(backupDir: string | null): Promise<void> {
  if (!backupDir) return;
  try {
    const data = await readFile(join(backupDir, "config.json"), "utf-8");
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, data);
  } catch {}
  try {
    await rm(backupDir, { recursive: true, force: true });
  } catch {}
}

export async function setTestConfig(tapPath: string): Promise<void> {
  const config = {
    tapPath,
    update: { autoPush: true },
  };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export async function clearTestManifests(): Promise<void> {
  try {
    await rm(PACKAGES_DIR, { recursive: true, force: true });
  } catch {}
}

export function packagesDir(): string {
  return PACKAGES_DIR;
}
