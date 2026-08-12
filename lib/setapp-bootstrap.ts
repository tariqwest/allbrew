import { access, mkdir, symlink, lstat, readlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir, userInfo } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ora from "ora";
import { getRepoInfo, getLatestRelease } from "./github.ts";

const execFileAsync = promisify(execFile);

const SETAPP_CLI_OWNER = "maximlevey";
const SETAPP_CLI_REPO = "setapp-cli";
const SETAPP_CLI_FORMULA = "setapp-cli";

export function setappAppPaths() {
  return [
    "/Applications/Setapp.app",
    join(homedir(), "Applications/Setapp.app"),
  ];
}

export function setappCliFormulaPath(tapPath: string) {
  return join(tapPath, "Formula", `${SETAPP_CLI_FORMULA}.rb`);
}

/**
 * Derive a Homebrew tap slug (`user/repo`) for a local tap path so
 * `brew tap <slug> <path>` and `brew install <slug>/setapp-cli` work.
 * Prefer config githubUser + tapName; fall back to path basename + OS user.
 */
export function deriveTapSlug(
  tapPath: string,
  config?: { githubUser?: string; tapName?: string },
): string {
  const base =
    (config?.tapName && config.tapName.trim()) ||
    basename((tapPath || "").replace(/\/+$/, "")) ||
    "homebrew-allbrew";
  const repo = base.replace(/^homebrew-/, "") || "allbrew";
  const user =
    (config?.githubUser && config.githubUser.trim()) ||
    process.env.TH_PROJECT_USER ||
    process.env.USER ||
    (() => {
      try {
        return userInfo().username;
      } catch {
        return "local";
      }
    })();
  return `${user}/${repo}`;
}

export async function isSetappAppInstalled() {
  for (const path of setappAppPaths()) {
    try {
      await access(path);
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

export async function isSetappCliInstalled() {
  try {
    await execFileAsync("which", ["setapp-cli"]);
    return true;
  } catch {
    return false;
  }
}

export async function hasSetappCliFormula(tapPath: string) {
  try {
    await access(setappCliFormulaPath(tapPath));
    return true;
  } catch {
    return false;
  }
}

async function loadTapConfig(): Promise<{ githubUser?: string; tapName?: string }> {
  try {
    const { loadConfig } = await import("./config.ts");
    return await loadConfig();
  } catch {
    return {};
  }
}

async function ensureTapIsGitRepo(tapPath: string): Promise<void> {
  await mkdir(join(tapPath, "Formula"), { recursive: true });
  await mkdir(join(tapPath, "Casks"), { recursive: true });
  try {
    await execFileAsync("git", ["-C", tapPath, "rev-parse", "--git-dir"]);
  } catch {
    await execFileAsync("git", ["init", tapPath]);
    await execFileAsync("git", ["-C", tapPath, "config", "user.email", "allbrew@local"]);
    await execFileAsync("git", ["-C", tapPath, "config", "user.name", "allbrew"]);
  }
  // Ensure at least one commit so `brew tap <slug> <path>` can clone.
  try {
    await execFileAsync("git", ["-C", tapPath, "rev-parse", "HEAD"]);
  } catch {
    try {
      await execFileAsync("git", ["-C", tapPath, "add", "-A"]);
      await execFileAsync("git", [
        "-C",
        tapPath,
        "commit",
        "--allow-empty",
        "-m",
        "chore(allbrew): init setapp tap",
      ]);
    } catch {
      // non-fatal
    }
  }
}

async function brewRepositoryRoot(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("brew", ["--repository"]);
    const root = (stdout || "").trim();
    return root || null;
  } catch {
    return null;
  }
}

/**
 * Register the allbrew local tap with Homebrew so formulae written into
 * tapPath (e.g. setapp-cli) are resolvable by short name for depends_on.
 * Prefer a Library/Taps symlink (no clone), fall back to `brew tap`.
 */
export async function ensureLocalTapRegistered(tapPath: string): Promise<string> {
  const config = await loadTapConfig();
  const slug = deriveTapSlug(tapPath, config);
  const [user, repo] = slug.split("/");
  await ensureTapIsGitRepo(tapPath);

  // Symlink into Homebrew's Taps tree — more reliable than brew tap clone of a
  // working tree that already lives at tapPath (batch VMs create this dir first).
  try {
    const brewRoot = await brewRepositoryRoot();
    if (brewRoot && user && repo) {
      const tapsDir = join(brewRoot, "Library", "Taps", user);
      const dest = join(tapsDir, `homebrew-${repo}`);
      await mkdir(tapsDir, { recursive: true });
      let needLink = true;
      try {
        const st = await lstat(dest);
        if (st.isSymbolicLink()) {
          const target = await readlink(dest);
          if (target === tapPath || join(tapsDir, target) === tapPath) {
            needLink = false;
          }
        } else if (st.isDirectory()) {
          // Already a real checkout — leave it; short-name resolution still works.
          needLink = false;
        }
      } catch {
        needLink = true;
      }
      if (needLink) {
        try {
          await symlink(tapPath, dest);
        } catch {
          // race / EEXIST — ignore
        }
      }
    }
  } catch {
    // symlink path is best-effort
  }

  try {
    await execFileAsync("brew", ["tap", slug, tapPath]);
  } catch (err: any) {
    const msg: string = `${err?.stderr || ""} ${err?.message || ""}`;
    if (!/already tapped|already exists|Tap is already/i.test(msg)) {
      // Non-fatal when symlink already made the tap visible
      console.warn(
        `brew tap ${slug} ${tapPath} did not complete: ${(err?.message || msg).trim()}`,
      );
    }
  }
  return slug;
}

async function generateSetappCliIfNeeded(tapPath: string): Promise<void> {
  // Always (re)generate so template fixes (e.g. ensure_setapp! brew install
  // --cask) replace stale Formula/setapp-cli.rb left by earlier runs.
  const existed = await hasSetappCliFormula(tapPath);
  const spinner = ora(
    existed ? "Refreshing setapp-cli formula..." : "Generating setapp-cli formula...",
  ).start();
  try {
    const repoInfo = await getRepoInfo(SETAPP_CLI_OWNER, SETAPP_CLI_REPO);
    const release = await getLatestRelease(SETAPP_CLI_OWNER, SETAPP_CLI_REPO);
    const { generateSetappCliFormula } = await import(
      "./generators/setapp-cli-formula.ts"
    );
    await generateSetappCliFormula(repoInfo, release, {
      tapPath,
      name: SETAPP_CLI_FORMULA,
    });
    spinner.succeed(
      existed ? "setapp-cli formula refreshed" : "setapp-cli formula generated",
    );
  } catch (err: any) {
    spinner.warn(`setapp-cli formula generation failed: ${err.message}`);
  }
}

async function installSetappCli(tapPath: string, tapSlug: string): Promise<void> {
  if (await isSetappCliInstalled()) return;
  const spinner = ora("Installing setapp-cli...").start();
  const brewEnv = {
    ...process.env,
    HOMEBREW_DEVELOPER: "1",
    HOMEBREW_NO_AUTO_UPDATE: "1",
  };
  const candidates: string[][] = [
    ["install", "--formula", `${tapSlug}/${SETAPP_CLI_FORMULA}`],
    ["install", "--formula", SETAPP_CLI_FORMULA],
    ["install", "--formula", setappCliFormulaPath(tapPath)],
  ];
  let lastErr: any = null;
  try {
    await execFileAsync("brew", ["update"], { env: brewEnv });
  } catch {
    // update is best-effort
  }
  for (const args of candidates) {
    try {
      await execFileAsync("brew", args, { env: brewEnv });
      spinner.succeed("setapp-cli installed");
      return;
    } catch (err: any) {
      lastErr = err;
    }
  }
  spinner.warn(
    `setapp-cli install failed: ${lastErr?.message || "unknown error"}`,
  );
}

async function installSetappApp(): Promise<void> {
  if (await isSetappAppInstalled()) return;
  const spinner = ora("Installing Setapp...").start();
  try {
    await execFileAsync(
      "brew",
      ["install", "--cask", "setapp"],
      {
        env: {
          ...process.env,
          HOMEBREW_NO_AUTO_UPDATE: "1",
        },
      },
    );
    spinner.succeed("Setapp installed");
  } catch (err: any) {
    spinner.warn(`Setapp install failed: ${err.message}`);
  }
}

/**
 * Ensure setapp-cli formula exists in the allbrew tap, the tap is registered
 * with Homebrew, Setapp.app is present, and setapp-cli is installed.
 *
 * Install Setapp *before* setapp-cli so formula ensure_setapp! is a no-op when
 * possible (also fixed to use `brew install --cask setapp` instead of the
 * broken Cask::CaskLoader#install API).
 */
export async function ensureSetappPrerequisites(tapPath: string) {
  await generateSetappCliIfNeeded(tapPath);
  const tapSlug = await ensureLocalTapRegistered(tapPath);
  // Setapp first so setapp-cli formula's ensure_setapp! short-circuits.
  await installSetappApp();
  await installSetappCli(tapPath, tapSlug);
}
