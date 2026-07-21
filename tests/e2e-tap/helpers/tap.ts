import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runCommand, gitCommand } from "./run.ts";

const execFileAsync = promisify(execFile);

export type DisposableTap = {
  tapName: string;
  remoteDir: string;
  workDir: string;
  remoteUrl: string;
};

export async function createDisposableTap(
  tapName: string = "e2e-tap",
): Promise<DisposableTap> {
  const pid = process.pid;
  const name = `test/e2e-tap-${pid}`;

  const remoteDir = await mkdtemp(join(tmpdir(), `allbrew-tap-remote-`));
  const workDir = await mkdtemp(join(tmpdir(), `allbrew-tap-work-`));

  await execFileAsync("git", ["init", "--bare", remoteDir]);
  await mkdir(join(workDir, "Formula"), { recursive: true });
  await mkdir(join(workDir, "Casks"), { recursive: true });

  await execFileAsync("git", ["init"], { cwd: workDir });
  await execFileAsync("git", ["config", "user.email", "e2e@test.local"], { cwd: workDir });
  await execFileAsync("git", ["config", "user.name", "E2E Test"], { cwd: workDir });

  await writeFile(join(workDir, "README.md"), `# ${name}\n\nE2E test tap\n`);
  await execFileAsync("git", ["add", "."], { cwd: workDir });
  await execFileAsync("git", ["commit", "-m", "initial commit"], { cwd: workDir });
  await execFileAsync("git", ["branch", "-M", "main"], { cwd: workDir });

  const remoteUrl = `file://${remoteDir}`;
  await execFileAsync("git", ["remote", "add", "origin", remoteUrl], { cwd: workDir });
  await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: workDir });

  const brewResult = runCommand(["brew", "tap", name, remoteUrl]);
  if (brewResult.code !== 0) {
    throw new Error(`brew tap failed: ${brewResult.stderr}`);
  }

  return { tapName: name, remoteDir, workDir, remoteUrl };
}

export async function destroyDisposableTap(tap: DisposableTap): Promise<void> {
  try {
    runCommand(["brew", "untap", tap.tapName], { timeout: 30_000 });
  } catch {}
  try {
    await rm(tap.remoteDir, { recursive: true, force: true });
  } catch {}
  try {
    await rm(tap.workDir, { recursive: true, force: true });
  } catch {}
}

export function formulaPath(tap: DisposableTap, name: string): string {
  return join(tap.workDir, "Formula", `${name}.rb`);
}

export function caskPath(tap: DisposableTap, name: string): string {
  return join(tap.workDir, "Casks", `${name}.rb`);
}

export function getRemoteHeadSha(tap: DisposableTap): string {
  const result = gitCommand(
    ["rev-parse", "HEAD"],
    tap.remoteDir,
  );
  return result.stdout.trim();
}

export function getWorkHeadSha(tap: DisposableTap): string {
  const result = gitCommand(
    ["rev-parse", "HEAD"],
    tap.workDir,
  );
  return result.stdout.trim();
}

export function getLatestCommitMessage(tap: DisposableTap): string {
  const result = gitCommand(
    ["log", "--format=%s", "-1"],
    tap.workDir,
  );
  return result.stdout.trim();
}

export function remoteHasFile(tap: DisposableTap, relPath: string): boolean {
  const result = gitCommand(
    ["cat-file", "-e", `origin/main:${relPath}`],
    tap.workDir,
  );
  return result.code === 0;
}

export function remoteFileContent(tap: DisposableTap, relPath: string): string {
  const result = gitCommand(
    ["show", `origin/main:${relPath}`],
    tap.workDir,
  );
  return result.stdout;
}
