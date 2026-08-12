import { access } from "node:fs/promises";
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

/**
 * Register the allbrew local tap with Homebrew so formulae written into
 * tapPath (e.g. setapp-cli) are resolvable by short name for depends_on.
 * Idempotent when already tapped.
 */
export async function ensureLocalTapRegistered(tapPath: string): Promise<string> {
  const config = await loadTapConfig();
  const slug = deriveTapSlug(tapPath, config);
  try {
    await execFileAsync("brew", ["tap", slug, tapPath]);
  } catch (err: any) {
    const msg: string = `${err?.stderr || ""} ${err?.message || ""}`;
    if (!/already tapped|already exists|Tap is already/i.test(msg)) {
      // Non-fatal: install may still work via path / short name if linked
      console.warn(
        `brew tap ${slug} ${tapPath} did not complete: ${(err?.message || msg).trim()}`,
      );
    }
  }
  return slug;
}

async function generateSetappCliIfNeeded(tapPath: string): Promise<void> {
  if (await hasSetappCliFormula(tapPath)) return;
  const spinner = ora("Generating setapp-cli formula...").start();
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
    spinner.succeed("setapp-cli formula generated");
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
    // Preferred: fully-qualified formula from the registered local tap
    ["install", "--formula", `${tapSlug}/${SETAPP_CLI_FORMULA}`],
    // Short name once the local tap is loaded
    ["install", "--formula", SETAPP_CLI_FORMULA],
    // Last resort: path install (requires HOMEBREW_DEVELOPER + real tap dir)
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
 * with Homebrew, setapp-cli is installed, and Setapp.app is present.
 *
 * Batch/non-interactive paths used to only write Formula/setapp-cli.rb and
 * skip install — that left `depends_on formula: "setapp-cli"` unresolvable
 * (`No available formula with the name "setapp-cli"`). Always register + install.
 */
export async function ensureSetappPrerequisites(tapPath: string) {
  await generateSetappCliIfNeeded(tapPath);
  const tapSlug = await ensureLocalTapRegistered(tapPath);
  await installSetappCli(tapPath, tapSlug);
  await installSetappApp();
}
