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
} from "../lib/config.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);
const VERSION = packageJson.version || "0.0.0";

const DEFAULT_TAP_PATH = join(homedir(), "homebrew-mytapp");

async function resolveTapPath(cliTapOpt) {
  if (cliTapOpt) return resolve(cliTapOpt);

  const saved = await getTapPath();
  if (saved) return saved;

  const resolved = await setTapPath(DEFAULT_TAP_PATH);
  const chalk = (await import("chalk")).default;
  console.log(chalk.dim(`Using default tap path: ${resolved}`));
  console.log(chalk.dim(`Change with: allbrew config set-tap <path>`));
  return resolved;
}

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
