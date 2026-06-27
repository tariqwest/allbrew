import { access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
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

export async function ensureSetappPrerequisites(tapPath: string) {
  if (!(await hasSetappCliFormula(tapPath))) {
    const spinner = ora("Generating setapp-cli formula...").start();
    try {
      const repoInfo = await getRepoInfo(SETAPP_CLI_OWNER, SETAPP_CLI_REPO);
      const release = await getLatestRelease(SETAPP_CLI_OWNER, SETAPP_CLI_REPO);
      const { generateSetappCliFormula } = await import("./generators/setapp-cli-formula.ts");
      await generateSetappCliFormula(repoInfo, release, {
        tapPath,
        name: SETAPP_CLI_FORMULA,
      });
      spinner.succeed("setapp-cli formula generated");
    } catch (err: any) {
      spinner.warn(`setapp-cli formula generation failed: ${err.message}`);
    }
  }

  if (!(await isSetappCliInstalled())) {
    const spinner = ora("Installing setapp-cli...").start();
    try {
      await execFileAsync("brew", ["update"]);
      await execFileAsync("brew", [
        "install",
        "--formula",
        setappCliFormulaPath(tapPath),
      ]);
      spinner.succeed("setapp-cli installed");
    } catch (err: any) {
      spinner.warn(`setapp-cli install failed: ${err.message}`);
    }
  }

  if (!(await isSetappAppInstalled())) {
    const spinner = ora("Installing Setapp...").start();
    try {
      await execFileAsync("brew", ["install", "--cask", "setapp"]);
      spinner.succeed("Setapp installed");
    } catch (err: any) {
      spinner.warn(`Setapp install failed: ${err.message}`);
    }
  }
}
