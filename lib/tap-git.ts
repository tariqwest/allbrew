import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type TapGitResult = {
  committed: boolean;
  pushed: boolean;
  commitMessage?: string;
};

export async function isGitRepo(tapPath: string) {
  try {
    await execFileAsync("git", ["-C", tapPath, "rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

export async function hasGitRemote(tapPath: string, remote = "origin") {
  try {
    await execFileAsync("git", ["-C", tapPath, "remote", "get-url", remote]);
    return true;
  } catch {
    return false;
  }
}

export async function commitAndPushTap(
  tapPath: string,
  files: string[],
  message: string,
  options: { push?: boolean } = {},
): Promise<TapGitResult> {
  if (files.length === 0) {
    return { committed: false, pushed: false };
  }

  if (!(await isGitRepo(tapPath))) {
    return { committed: false, pushed: false };
  }

  await execFileAsync("git", ["-C", tapPath, "add", ...files]);

  const status = await execFileAsync("git", [
    "-C",
    tapPath,
    "status",
    "--porcelain",
  ]);
  if (!status.stdout.trim()) {
    return { committed: false, pushed: false };
  }

  await execFileAsync("git", ["-C", tapPath, "commit", "-m", message]);

  let pushed = false;
  if (options.push !== false && (await hasGitRemote(tapPath))) {
    const branch = (
      await execFileAsync("git", [
        "-C",
        tapPath,
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
      ])
    ).stdout.trim();
    await execFileAsync("git", ["-C", tapPath, "push", "origin", branch]);
    pushed = true;
  }

  return { committed: true, pushed, commitMessage: message };
}
