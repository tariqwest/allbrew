import { select, input, confirm, password } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  loadConfig,
  saveConfig,
  setTapPath,
  setGithubToken,
  setGithubUser,
  setRemoteMode,
  type AllbrewConfig,
} from "./config.ts";
import {
  initOctokit,
  getAuthenticatedUser,
  createTapRepo,
  repoExists,
  deviceFlowOAuth,
} from "./github.ts";

const execFileAsync = promisify(execFile);

const ALLBREW_OAUTH_CLIENT_ID = process.env.ALLBREW_GITHUB_CLIENT_ID || "";

export type SetupResult = {
  tapPath: string;
  tapName: string;
  remoteMode: "local" | "github";
  githubUser?: string;
  remoteUrl?: string;
};

/**
 * Run if no tapPath is configured. Detects if already fully set up.
 * Returns the resolved tapPath.
 */
export async function ensureSetup(): Promise<string> {
  const config = await loadConfig();
  if (config.tapPath && existsSync(config.tapPath)) {
    return config.tapPath;
  }
  console.log();
  console.log(chalk.bold("Welcome to allbrew!") + chalk.dim(" Let's get you set up."));
  console.log();
  const result = await runSetup();
  return result.tapPath;
}

/**
 * Full interactive first-run setup. Safe to re-run (idempotent).
 */
export async function runSetup(): Promise<SetupResult> {
  const config = await loadConfig();

  // ── Step 1: Tap name ──────────────────────────────────────────────────────
  const defaultTapName = "homebrew-mytapp";
  const tapName = await input({
    message: "Name for your local tap directory:",
    default: config.tapName || defaultTapName,
    validate: (v) =>
      /^homebrew-[a-z0-9-]+$/.test(v.trim())
        ? true
        : 'Must start with "homebrew-" and use lowercase letters, numbers, and hyphens',
  });

  const localTapPath = join(homedir(), tapName.trim());

  const tapPath = await input({
    message: "Local path for your tap:",
    default: config.tapPath || localTapPath,
  });

  // ── Step 2: Remote or local-only ─────────────────────────────────────────
  console.log();
  const remoteMode = await select<"local" | "github">({
    message: "How do you want to maintain your tap?",
    choices: [
      {
        name: "Local only — formulas stay on this machine",
        value: "local",
        description: "No GitHub required. You can change this later.",
      },
      {
        name: "GitHub — push to a public GitHub tap repo",
        value: "github",
        description:
          'Creates "' + tapName + '" repo under your GitHub account. Needed for brew tap.',
      },
    ],
    default: config.remoteMode || "local",
  });

  let githubUser: string | undefined;
  let remoteUrl: string | undefined;
  let resolvedToken: string | null = null;

  if (remoteMode === "github") {
    resolvedToken = await resolveGithubToken(config);
    if (!resolvedToken) {
      console.log(chalk.yellow("\nSkipping GitHub setup — continuing in local-only mode."));
    } else {
      initOctokit(resolvedToken);
      const spinner = ora("Verifying GitHub token...").start();
      const user = await getAuthenticatedUser();
      if (!user) {
        spinner.fail("Could not verify token. Check it has 'public_repo' scope.");
        console.log(chalk.yellow("Continuing in local-only mode."));
      } else {
        spinner.succeed(`Authenticated as ${chalk.bold("@" + user.login)}`);
        githubUser = user.login;

        const repoName = tapName.trim();
        const alreadyExists = await repoExists(githubUser, repoName);
        if (alreadyExists) {
          console.log(chalk.dim(`  → Using existing repo: github.com/${githubUser}/${repoName}`));
          remoteUrl = `https://github.com/${githubUser}/${repoName}.git`;
        } else {
          const createRemote = await confirm({
            message: `Create public GitHub repo "${githubUser}/${repoName}"?`,
            default: true,
          });
          if (createRemote) {
            const createSpinner = ora("Creating GitHub repository...").start();
            try {
              const repo = await createTapRepo(
                githubUser,
                repoName,
                "My personal Homebrew tap (managed by allbrew)",
              );
              createSpinner.succeed(
                `Created: ${chalk.cyan(repo.htmlUrl)}`,
              );
              remoteUrl = repo.sshUrl;
            } catch (err: any) {
              createSpinner.fail(`Failed to create repo: ${err.message}`);
            }
          }
        }
      }
    }
  }

  // ── Step 3: Create local tap directory + git repo ─────────────────────────
  const setupSpinner = ora("Setting up local tap directory...").start();
  try {
    await initLocalTap(tapPath, remoteUrl);
    setupSpinner.succeed(`Tap ready: ${chalk.green(tapPath)}`);
  } catch (err: any) {
    setupSpinner.fail(`Failed to set up tap: ${err.message}`);
    throw err;
  }

  // ── Step 4: Persist config ────────────────────────────────────────────────
  await setTapPath(tapPath);
  await setRemoteMode(remoteMode === "github" && githubUser ? "github" : "local");
  if (githubUser) await setGithubUser(githubUser);
  if (resolvedToken && remoteMode === "github") await setGithubToken(resolvedToken);

  const updatedConfig: AllbrewConfig = {
    ...(await loadConfig()),
    tapName: tapName.trim(),
  };
  await saveConfig(updatedConfig);

  // ── Step 5: Summary ───────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold("✓ allbrew is ready!"));
  console.log();
  console.log(`  Tap path:   ${chalk.cyan(tapPath)}`);
  if (githubUser && remoteUrl) {
    console.log(`  GitHub:     ${chalk.cyan(`github.com/${githubUser}/${tapName}`)}`);
    console.log();
    console.log(
      chalk.dim(
        `  Others can install your tap with: brew tap ${githubUser}/${tapName.replace(/^homebrew-/, "")}`,
      ),
    );
  } else {
    console.log(`  Mode:       ${chalk.dim("local only")}`);
    console.log();
    console.log(
      chalk.dim(
        "  To add a GitHub remote later, run: allbrew config set-remote",
      ),
    );
  }
  console.log();
  console.log(
    chalk.dim("  Now run: allbrew <url>  to generate your first formula"),
  );
  console.log();

  return {
    tapPath,
    tapName: tapName.trim(),
    remoteMode: remoteMode === "github" && githubUser ? "github" : "local",
    githubUser,
    remoteUrl,
  };
}

/**
 * Interactive subcommand for changing the GitHub remote.
 * Adds a remote to an existing local tap and updates config.
 */
export async function runConfigSetRemote(): Promise<void> {
  const config = await loadConfig();
  if (!config.tapPath) {
    console.log(chalk.yellow("No tap configured. Run: allbrew init"));
    return;
  }

  const resolvedToken = await resolveGithubToken(config);
  if (!resolvedToken) {
    console.log(chalk.red("No GitHub token available. Cannot set remote."));
    return;
  }

  initOctokit(resolvedToken);
  const spinner = ora("Verifying GitHub token...").start();
  const user = await getAuthenticatedUser();
  if (!user) {
    spinner.fail("Token invalid or lacks 'public_repo' scope.");
    return;
  }
  spinner.succeed(`Authenticated as ${chalk.bold("@" + user.login)}`);

  const tapName = config.tapName || "homebrew-mytapp";
  const repoName = await input({
    message: "GitHub repo name for your tap:",
    default: tapName,
    validate: (v) =>
      /^homebrew-[a-z0-9-]+$/.test(v.trim())
        ? true
        : 'Must start with "homebrew-"',
  });

  const alreadyExists = await repoExists(user.login, repoName);
  let remoteUrl: string;

  if (alreadyExists) {
    console.log(chalk.dim(`  → Using existing repo: github.com/${user.login}/${repoName}`));
    remoteUrl = `git@github.com:${user.login}/${repoName}.git`;
  } else {
    const createRemote = await confirm({
      message: `Create public repo "${user.login}/${repoName}" on GitHub?`,
      default: true,
    });
    if (!createRemote) {
      console.log(chalk.yellow("Cancelled."));
      return;
    }
    const createSpinner = ora("Creating GitHub repository...").start();
    const repo = await createTapRepo(
      user.login,
      repoName,
      "My personal Homebrew tap (managed by allbrew)",
    );
    createSpinner.succeed(`Created: ${chalk.cyan(repo.htmlUrl)}`);
    remoteUrl = repo.sshUrl;
  }

  await addGitRemote(config.tapPath, remoteUrl);
  await setGithubUser(user.login);
  await setGithubToken(resolvedToken);
  await setRemoteMode("github");
  const updatedConfig = { ...(await loadConfig()), tapName: repoName };
  await saveConfig(updatedConfig);

  console.log();
  console.log(chalk.green("Remote configured!"));
  console.log(`  Remote:   ${chalk.cyan(remoteUrl)}`);
  console.log(
    chalk.dim(
      `  Brew tap: brew tap ${user.login}/${repoName.replace(/^homebrew-/, "")}`,
    ),
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function resolveGithubToken(config: AllbrewConfig): Promise<string | null> {
  const existing = config.githubToken || process.env.GITHUB_TOKEN || null;
  if (existing) return existing;

  console.log();
  const method = await select<"token" | "oauth" | "skip">({
    message: "Authenticate with GitHub:",
    choices: [
      {
        name: "Paste a Personal Access Token (classic or fine-grained)",
        value: "token",
        description: 'Needs "public_repo" scope. Create at github.com/settings/tokens',
      },
      {
        name: "Browser OAuth (opens github.com/login/device)",
        value: "oauth",
        description: ALLBREW_OAUTH_CLIENT_ID
          ? "Opens your browser to authorize allbrew"
          : "Requires ALLBREW_GITHUB_CLIENT_ID env var — not configured",
        disabled: !ALLBREW_OAUTH_CLIENT_ID ? "(not configured)" : false,
      },
      { name: "Skip — continue locally", value: "skip" },
    ],
  });

  if (method === "skip") return null;

  if (method === "token") {
    const tok = await password({
      message: 'GitHub Personal Access Token (needs "public_repo" scope):',
      validate: (v) => v.trim().length > 0 ? true : "Token cannot be empty",
    });
    return tok.trim();
  }

  // OAuth device flow
  return await runDeviceFlow();
}

async function runDeviceFlow(): Promise<string | null> {
  if (!ALLBREW_OAUTH_CLIENT_ID) {
    console.log(chalk.red("ALLBREW_GITHUB_CLIENT_ID not set. Cannot use OAuth."));
    return null;
  }

  const spinner = ora("Requesting device code from GitHub...").start();
  let codeData: any;
  try {
    codeData = await deviceFlowOAuth(ALLBREW_OAUTH_CLIENT_ID);
    spinner.stop();
  } catch (err: any) {
    spinner.fail(`Device flow failed: ${err.message}`);
    return null;
  }

  const { device_code, user_code, verification_uri, expires_in, interval } = codeData;

  console.log();
  console.log(chalk.bold("Open this URL in your browser:"));
  console.log(`  ${chalk.cyan(verification_uri)}`);
  console.log();
  console.log(`Enter code: ${chalk.bold.green(user_code)}`);
  console.log();

  try {
    await execFileAsync("open", [verification_uri]);
  } catch {
    // Non-fatal — user can open manually
  }

  const pollSpinner = ora("Waiting for authorization...").start();
  const deadline = Date.now() + expires_in * 1000;
  const pollInterval = (interval || 5) * 1000;

  while (Date.now() < deadline) {
    await sleep(pollInterval);
    try {
      const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: ALLBREW_OAUTH_CLIENT_ID,
          device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });
      const data = await res.json();
      if (data.access_token) {
        pollSpinner.succeed("Authorized!");
        return data.access_token;
      }
      if (data.error === "access_denied") {
        pollSpinner.fail("Authorization denied.");
        return null;
      }
      // "authorization_pending" or "slow_down" — keep polling
    } catch {
      // Network hiccup — keep polling
    }
  }

  pollSpinner.fail("Authorization timed out.");
  return null;
}

async function initLocalTap(tapPath: string, remoteUrl?: string): Promise<void> {
  await mkdir(tapPath, { recursive: true });
  await mkdir(join(tapPath, "Formula"), { recursive: true });
  await mkdir(join(tapPath, "Casks"), { recursive: true });

  const isGitRepo = existsSync(join(tapPath, ".git"));

  if (!isGitRepo) {
    await execFileAsync("git", ["init", tapPath]);
    await execFileAsync("git", ["-C", tapPath, "checkout", "-b", "main"]);

    const readme = [
      "# My Homebrew Tap",
      "",
      "This tap is managed by [allbrew](https://github.com/tariqwest/allbrew).",
      "",
      "## Install",
      "",
      "```sh",
      "brew tap <user>/<tapname>",
      "```",
      "",
    ].join("\n");

    await writeFile(join(tapPath, "README.md"), readme, "utf-8");
    await writeFile(
      join(tapPath, ".gitkeep"),
      "",
      "utf-8",
    );
    await execFileAsync("git", ["-C", tapPath, "add", "."]);
    await execFileAsync("git", ["-C", tapPath, "commit", "-m", "chore: init tap"]);
  }

  if (remoteUrl) {
    await addGitRemote(tapPath, remoteUrl);
  }
}

async function addGitRemote(tapPath: string, remoteUrl: string): Promise<void> {
  try {
    await execFileAsync("git", ["-C", tapPath, "remote", "remove", "origin"]);
  } catch {
    // No existing remote — fine
  }
  await execFileAsync("git", ["-C", tapPath, "remote", "add", "origin", remoteUrl]);
  console.log(chalk.dim(`  git remote set to: ${remoteUrl}`));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
