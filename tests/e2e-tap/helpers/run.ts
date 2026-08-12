import { spawnSync, type SpawnSyncOptions } from "node:child_process";

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export function runCommand(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): RunResult {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf-8",
    cwd: opts.cwd,
    timeout: opts.timeout || 600_000,
    env: { ...process.env, ...opts.env },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function runAllbrew(
  allbrewArgs: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): RunResult {
  const args = ["bun", "run", "bin/allbrew.ts", ...allbrewArgs];
  const env: Record<string, string> = {
    HOMEBREW_DEVELOPER: "1",
    HOMEBREW_NO_AUTO_UPDATE: "1",
    HOMEBREW_NO_REQUIRE_TAP_TRUST: "1",
    ...opts.env,
  };
  return runCommand(args, { ...opts, env });
}

export function runBrew(
  brewArgs: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): RunResult {
  const env: Record<string, string> = {
    HOMEBREW_DEVELOPER: "1",
    HOMEBREW_NO_REQUIRE_TAP_TRUST: "1",
    ...opts.env,
  };
  return runCommand(["brew", ...brewArgs], { ...opts, env });
}

export function commandAvailable(cmd: string): boolean {
  const result = spawnSync("which", [cmd], { encoding: "utf-8", stdio: "ignore" });
  return (result.status ?? 1) === 0;
}

export function gitCommand(
  gitArgs: string[],
  cwd: string,
  env?: Record<string, string>,
): RunResult {
  return runCommand(["git", ...gitArgs], { cwd, env });
}
