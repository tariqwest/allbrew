#!/usr/bin/env bun

import { program } from "commander";
import { readFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { run } from "../lib/cli.ts";
import {
  getTapPath,
  setTapPath,
  loadConfig,
  getConfigPath,
  setUpdateAutoPush,
  setUpdateScheduleHours,
  setGithubToken,
} from "../lib/config.ts";
import { ensureSetup, runSetup, runConfigSetRemote } from "../lib/setup.ts";
import { updateFormulas } from "../lib/update-formulas.ts";
import {
  installBrewHooks,
  uninstallBrewHooks,
  shellSnippet,
} from "../lib/brew-hooks.ts";
import {
  installLaunchdService,
  uninstallLaunchdService,
  logPath,
} from "../lib/launchd-service.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);
const VERSION = packageJson.version || "0.0.0";

const DEFAULT_TAP_PATH = join(homedir(), "homebrew-mytapp");

async function resolveTapPath(cliTapOpt) {
  if (cliTapOpt) return resolve(cliTapOpt);
  return await ensureSetup();
}

program
  .command("init")
  .description("First-run setup: create local tap, optionally connect to GitHub")
  .action(async () => {
    await runSetup();
  });

const configCmd = program
  .command("config")
  .description("Manage allbrew configuration");

configCmd
  .command("set-tap <path>")
  .description("Set the default tap repository path")
  .action(async (tapPath) => {
    const chalk = (await import("chalk")).default;
    const resolved = await setTapPath(tapPath);
    console.log(chalk.green(`Tap path set to: ${resolved}`));
  });

configCmd
  .command("get-tap")
  .description("Print the current tap repository path")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const tapPath = await getTapPath();
    if (tapPath) {
      console.log(tapPath);
    } else {
      console.log(
        chalk.yellow(
          "No tap path configured. Run: allbrew config set-tap <path>",
        ),
      );
    }
  });

configCmd
  .command("show")
  .description("Print the full configuration")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const config = await loadConfig();
    console.log(chalk.bold("Config file:"), getConfigPath());
    console.log();
    if (Object.keys(config).length === 0) {
      console.log(chalk.dim("(empty)"));
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
  });

configCmd
  .command("set-update-auto-push <enabled>")
  .description("Enable or disable auto-push after formula updates (true/false)")
  .action(async (enabled) => {
    const chalk = (await import("chalk")).default;
    const value = enabled === "true";
    await setUpdateAutoPush(value);
    console.log(chalk.green(`Update auto-push set to: ${value}`));
  });

configCmd
  .command("set-update-schedule <hours>")
  .description("Set launchd update interval in hours (default: 6)")
  .action(async (hours) => {
    const chalk = (await import("chalk")).default;
    const parsed = Number(hours);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      console.error(chalk.red("Hours must be a positive number"));
      process.exit(1);
    }
    await setUpdateScheduleHours(parsed);
    console.log(chalk.green(`Update schedule set to: ${parsed} hours`));
  });

configCmd
  .command("set-token <token>")
  .description('Set a GitHub Personal Access Token (needs "public_repo" scope)')
  .action(async (token) => {
    const chalk = (await import("chalk")).default;
    await setGithubToken(token.trim());
    console.log(chalk.green("GitHub token saved."));
    console.log(
      chalk.dim("Verify with: allbrew config show"),
    );
  });

configCmd
  .command("set-remote")
  .description("Connect your local tap to a GitHub repo (create or link existing)")
  .action(async () => {
    await runConfigSetRemote();
  });

const updateFormulasCmd = program
  .command("update-formulas")
  .description(
    "Regenerate outdated managed formulae/casks from livecheck JSON (stdin or brew livecheck)",
  )
  .option("--dry-run", "Show what would be updated without writing files")
  .option("--no-push", "Commit tap changes but do not push to origin")
  .option("--tap <path>", "Only update packages in this tap")
  .argument("[names...]", "Optional package names to limit updates")
  .action(async (names, opts) => {
    const chalk = (await import("chalk")).default;
    const tapPath = opts.tap ? resolve(opts.tap) : undefined;
    const result = await updateFormulas({
      dryRun: opts.dryRun,
      push: opts.push,
      names: names.length > 0 ? names : undefined,
      tapPath,
    });

    if (result.updated.length > 0) {
      console.log(chalk.green(`Updated: ${result.updated.join(", ")}`));
    }
    if (result.skipped.length > 0) {
      console.log(chalk.dim(`Skipped: ${result.skipped.join(", ")}`));
    }
    for (const err of result.errors) {
      console.log(chalk.red(`Error (${err.name}): ${err.error}`));
    }
    if (
      result.updated.length === 0 &&
      result.errors.length === 0 &&
      result.skipped.length === 0
    ) {
      console.log(chalk.dim("No outdated managed packages found."));
    }

    if (result.errors.length > 0) {
      process.exit(1);
    }
  });

const hooksCmd = program
  .command("hooks")
  .description("Install brew wrapper hooks for automatic formula updates");

hooksCmd
  .command("install")
  .description("Write brew update hook script to $(brew --prefix)/etc/")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const wrapPath = await installBrewHooks();
    console.log(chalk.green(`Installed brew hook: ${wrapPath}`));
    console.log();
    console.log(chalk.bold("Add to your shell profile:"));
    console.log(chalk.dim(shellSnippet(wrapPath)));
  });

hooksCmd
  .command("uninstall")
  .description("Remove the brew update hook script")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const wrapPath = await uninstallBrewHooks();
    console.log(chalk.green(`Removed brew hook: ${wrapPath}`));
    console.log(
      chalk.yellow("Remove the source/alias lines from your shell profile."),
    );
  });

const serviceCmd = program
  .command("service")
  .description("Install a launchd agent for periodic formula updates");

serviceCmd
  .command("install")
  .description("Install LaunchAgent and update script")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const { agentPath, scriptPath, intervalSeconds } =
      await installLaunchdService();
    const hours = intervalSeconds / 3600;
    console.log(chalk.green(`Installed LaunchAgent: ${agentPath}`));
    console.log(chalk.green(`Update script: ${scriptPath}`));
    console.log(chalk.dim(`Schedule: every ${hours} hours`));
    console.log(chalk.dim(`Log: ${logPath()}`));
  });

serviceCmd
  .command("uninstall")
  .description("Unload and remove the LaunchAgent")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const agentPath = await uninstallLaunchdService();
    console.log(chalk.green(`Removed LaunchAgent: ${agentPath}`));
  });

program
  .name("allbrew")
  .description("Generate Homebrew formulas and casks from arbitrary URLs")
  .version(VERSION)
  .argument(
    "[url]",
    "URL to a GitHub repo, script, binary, archive, or Mac App Store app",
  )
  .option("-n, --name <name>", "Override the formula/cask name")
  .option("-d, --desc <description>", "Override the description")
  .option(
    "-t, --token <token>",
    "GitHub personal access token (or set GITHUB_TOKEN)",
  )
  .option("-v, --verbose", "Show verbose error output")
  .option(
    "-m, --manual",
    "Manually choose the formula type instead of auto-detecting",
  )
  .option("--service", "Include a Homebrew service block in generated formulas")
  .option("--no-service", "Do not include a Homebrew service block")
  .option(
    "--service-command <command>",
    "Command to run from the generated Homebrew service block",
  )
  .option(
    "--no-service-keep-alive",
    "Do not add keep_alive true to the generated service block",
  )
  .option("--tap <path>", "Override the tap repository path for this run")
  .option("--package <name>", "npm/pip/dotnet package name")
  .option("--gem-name <name>", "Ruby gem name")
  .option("--crate-name <name>", "Rust crate name")
  .option("--go-module <path>", "Go module path")
  .option("--app-name <name>", "macOS app bundle name for casks")
  .option("--homepage <url>", "Homepage for generated formula/cask")
  .option("--build-system <system>", "Build system for source builds (cmake, autotools, meson, make)")
  .option("--type <type>", "Override the generator to use (e.g. npm-package, cask-app)")
  .action(async (url, opts) => {
    if (!url) {
      const { input } = await import("@inquirer/prompts");
      url = await input({
        message:
          "Enter a URL (GitHub repo, script, binary, archive, or App Store link):",
        validate: (v) => {
          try {
            new URL(v);
            return true;
          } catch {
            return "Please enter a valid URL";
          }
        },
      });
    }

    try {
      new URL(url);
    } catch {
      console.error(`Error: "${url}" is not a valid URL`);
      process.exit(1);
    }

    const tapPath = await resolveTapPath(opts.tap);
    await run(url, {
      ...opts,
      tapPath,
    });
  });

program.parse();
