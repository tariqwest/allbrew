import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startFixtureServer, buildEnvForServer, type ServerHandle } from "./server.ts";
import { createDisposableTap, destroyDisposableTap, type DisposableTap } from "./tap.ts";
import { backupConfig, restoreConfig, setTestConfig, clearTestManifests } from "./config.ts";
import { mutateFixtureVersion, resetFixtures } from "../fixtures/mutate.ts";
import { runAllbrew, runBrew, runCommand, commandAvailable, gitCommand } from "./run.ts";
import {
  FIXTURE_APPS,
  getFixtureApp,
  classifierUrl,
  verifyCommand,
  isCaskGenerator,
  requiredToolchain,
  type FixtureApp,
} from "../fixtures/apps.ts";

const E2E_TAP = !!process.env.E2E_TAP;
const REPO_ROOT = process.cwd();

export type TestContext = {
  server: ServerHandle;
  tap: DisposableTap;
  env: Record<string, string>;
  envBackup: Record<string, string | undefined>;
  configBackup: string | null;
};

export async function setupTestContext(): Promise<TestContext> {
  const server = await startFixtureServer(REPO_ROOT);
  const tap = await createDisposableTap();
  const env = buildEnvForServer(server.baseUrl);
  const envBackup: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    envBackup[key] = process.env[key];
    process.env[key] = value;
  }
  const configBackup = await backupConfig();
  await setTestConfig(tap.workDir);
  await clearTestManifests();
  return { server, tap, env, envBackup, configBackup };
}

export async function teardownTestContext(ctx: TestContext): Promise<void> {
  await restoreConfig(ctx.configBackup);
  await clearTestManifests();
  await destroyDisposableTap(ctx.tap);
  await ctx.server.stop();
  for (const [key, value] of Object.entries(ctx.envBackup)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export function mutateApp(
  ctx: TestContext,
  appKey: string,
  newVersion: string,
): void {
  mutateFixtureVersion(ctx.server.baseUrl, appKey, newVersion);
}

export function resetAllFixtures(ctx: TestContext): void {
  resetFixtures(ctx.server.baseUrl);
}

export function generateFormula(
  ctx: TestContext,
  app: FixtureApp,
  extraArgs: string[] = [],
): { code: number; stdout: string; stderr: string } {
  const url = classifierUrl(app, ctx.server.baseUrl);
  const args = [
    url,
    "--name", app.name,
    "--desc", `Fake ${app.generator} for E2E`,
    "--no-service",
    "--tap", ctx.tap.workDir,
    ...(app.appName ? ["--app-name", app.appName] : []),
    ...app.allbrewArgs || [],
    ...extraArgs,
  ];
  return runAllbrew(args, { env: ctx.env, timeout: 120_000 });
}

export function installFromTap(
  ctx: TestContext,
  app: FixtureApp,
): { code: number; stdout: string; stderr: string } {
  const cask = isCaskGenerator(app.generator);
  const args = cask ? ["install", "--cask"] : ["install"];
  args.push(`${ctx.tap.tapName}/${app.name}`);
  return runBrew(args, { env: ctx.env, timeout: 300_000 });
}

export function upgradeFromTap(
  ctx: TestContext,
  app: FixtureApp,
): { code: number; stdout: string; stderr: string } {
  const cask = isCaskGenerator(app.generator);
  const args = cask ? ["upgrade", "--cask", app.name] : ["upgrade", app.name];
  return runBrew(args, { env: ctx.env, timeout: 300_000 });
}

export function uninstallFromTap(
  ctx: TestContext,
  app: FixtureApp,
): { code: number; stdout: string; stderr: string } {
  const cask = isCaskGenerator(app.generator);
  const flag = cask ? "--cask" : "--formula";
  return runBrew(["uninstall", flag, app.name], { env: ctx.env, timeout: 120_000 });
}

export function verifyInstalled(
  ctx: TestContext,
  app: FixtureApp,
): { code: number; stdout: string; stderr: string } {
  return runCommand(verifyCommand(app), { env: ctx.env, timeout: 30_000 });
}

export function brewUpdate(ctx: TestContext): { code: number; stdout: string; stderr: string } {
  return runBrew(["update"], { env: ctx.env, timeout: 120_000 });
}

export function brewLivecheck(
  ctx: TestContext,
  app: FixtureApp,
): { code: number; stdout: string; stderr: string } {
  const result = runBrew(
    ["livecheck", `${ctx.tap.tapName}/${app.name}`, "--json", "--quiet"],
    { env: ctx.env, timeout: 120_000 },
  );
  if (result.code === 0 && result.stdout) {
    try {
      const data = JSON.parse(result.stdout);
      if (Array.isArray(data)) {
        for (const entry of data) {
          if (!entry.formula && entry.cask) {
            entry.formula = entry.cask;
          }
        }
        result.stdout = JSON.stringify(data);
      }
    } catch {}
  }
  return result;
}

export function updateFormulas(
  ctx: TestContext,
  names: string[],
  extraArgs: string[] = [],
): { code: number; stdout: string; stderr: string } {
  return runAllbrew(
    ["update-formulas", ...names, ...extraArgs],
    { env: ctx.env, timeout: 300_000 },
  );
}

export function canInstallApp(app: FixtureApp): boolean {
  const toolchain = requiredToolchain(app);
  if (toolchain && !commandAvailable(toolchain)) return false;
  if (!commandAvailable("brew")) return false;
  return true;
}

export function formulaVersion(ctx: TestContext, app: FixtureApp): string {
  const cask = isCaskGenerator(app.generator);
  const relPath = cask ? `Casks/${app.name}.rb` : `Formula/${app.name}.rb`;
  const content = gitCommand(["show", `HEAD:${relPath}`], ctx.tap.workDir);
  if (content.code !== 0) return "";
  const versionMatch = content.stdout.match(/version\s+"([^"]+)"/);
  if (versionMatch) return versionMatch[1];
  const urlMatch = content.stdout.match(/url\s+"([^"]+)"/);
  if (urlMatch) {
    try {
      const path = new URL(urlMatch[1]).pathname;
      const m = path.match(/(?:^|[/_-])v?(\d+(?:\.\d+)+)(?![\w-])/);
      if (m) return m[1];
    } catch {
      // fall through
    }
  }
  return "";
}

export {
  E2E_TAP,
  FIXTURE_APPS,
  getFixtureApp,
  isCaskGenerator,
  requiredToolchain,
  commandAvailable,
  type FixtureApp,
  type ServerHandle,
  type DisposableTap,
};
