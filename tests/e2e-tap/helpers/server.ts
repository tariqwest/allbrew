import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  registerFixtureProcess,
  unregisterFixtureProcess,
} from "../../helpers/test-cleanup-registry.ts";

export type ServerHandle = {
  port: number;
  baseUrl: string;
  process: ChildProcess;
  stop: () => Promise<void>;
};

export async function startFixtureServer(
  repoRoot: string,
  preferredPort: number = 0,
): Promise<ServerHandle> {
  const port = preferredPort || 0;
  const envFile = join(tmpdir(), `allbrew-fixture-port-${process.pid}.txt`);

  const child = spawn("bun", ["run", join(repoRoot, "tests/e2e-tap/fixtures/server.ts")], {
    env: {
      ...process.env,
      FIXTURE_PORT: String(port),
      ALLBREW_FIXTURE_PORT_FILE: envFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let resolvedPort = port;
  if (port === 0) {
    resolvedPort = await waitForPort(child, envFile);
  }

  const baseUrl = `http://localhost:${resolvedPort}`;

  await waitForHealth(baseUrl);

  // T0.2: register the fixture process so it can be killed if the test
  // process dies before teardown. Unregistered on clean stop().
  if (child.pid) {
    await registerFixtureProcess({ pid: child.pid, port: resolvedPort, label: "fixture-server" });
  }

  return {
    port: resolvedPort,
    baseUrl,
    process: child,
    stop: async () => {
      child.kill("SIGTERM");
      if (child.pid) {
        await unregisterFixtureProcess(child.pid).catch(() => {});
      }
      try {
        await rm(envFile, { force: true });
      } catch {}
    },
  };
}

async function waitForPort(child: ChildProcess, envFile: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for fixture server port"));
    }, 15_000);

    let output = "";
    child.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
      const match = output.match(/localhost:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(parseInt(match[1], 10));
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[fixture-server stderr] ${data}`);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Fixture server exited with code ${code}`));
    });
  });
}

async function waitForHealth(baseUrl: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Fixture server at ${baseUrl} did not become healthy`);
}

export function buildEnvForServer(baseUrl: string): Record<string, string> {
  return {
    GITHUB_API_URL: `${baseUrl}/api`,
    NPM_REGISTRY_URL: `${baseUrl}/npm`,
    PYPI_URL: `${baseUrl}/pypi`,
    CRATES_URL: `${baseUrl}/crates`,
    GO_PROXY_URL: `${baseUrl}/go`,
    RUBYGEMS_URL: `${baseUrl}/gems`,
    NUGET_URL: `${baseUrl}/nuget`,
    NUGET_FLAT_URL: `${baseUrl}/nuget`,
  };
}
