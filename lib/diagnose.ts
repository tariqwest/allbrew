import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, getConfigPath } from "./config.ts";
import { listManifests } from "./manifest.ts";

const execFileAsync = promisify(execFile);

const MAX_LIST_ENTRIES = 100;

export type DiagnosticReport = {
  capturedAt: string;
  os: {
    name: string;
    version: string;
    build: string;
    kernel: string;
    arch: string;
  };
  brew: {
    version: string | null;
    prefix: string | null;
    config: Record<string, unknown> | null;
    formulae: string[];
    casks: string[];
  };
  allbrew: {
    version: string | null;
    binary: string;
    configPath: string | null;
    config: Record<string, unknown>;
    manifests: string[];
  };
  runtime: {
    node: string | null;
    bun: string | null;
  };
};

function tryOutput(
  command: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<string | null> {
  return execFileAsync(command, args, {
    encoding: "utf-8",
    timeout: 15_000,
    env: { ...process.env, ...opts.env },
  })
    .then(({ stdout }) => (stdout || "").trim())
    .catch(() => null);
}

async function tryList(command: string, args: string[]): Promise<string[]> {
  const out = await tryOutput(command, args);
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ENTRIES);
}

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redact(val);
    }
    return out;
  }
  return value;
}

function redactString(value: string): string {
  if (/token|secret|password|key|auth/i.test(value)) return "[REDACTED]";
  return value;
}

function redactSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const out = { ...config };
  for (const key of Object.keys(out)) {
    if (/token|secret|password|key/i.test(key)) {
      out[key] = "[REDACTED]";
    }
  }
  return out;
}

function redactDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactDeep);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|password|key/i.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactDeep(val);
      }
    }
    return out;
  }
  return value;
}

function redactHomePaths(text: string): string {
  const home = homedir();
  return text.split(home).join("~");
}

export async function captureSystemInfo(): Promise<DiagnosticReport> {
  const [swVers, unameSys, unameRel, unameArch, brewVersion, brewPrefix, brewConfigJson, nodeVersion, bunVersion] =
    await Promise.all([
      tryOutput("sw_vers", []),
      tryOutput("uname", ["-s"]),
      tryOutput("uname", ["-r"]),
      tryOutput("uname", ["-m"]),
      tryOutput("brew", ["--version"]),
      tryOutput("brew", ["--prefix"]),
      tryOutput("brew", ["config", "--json"]),
      tryOutput("node", ["-v"]),
      tryOutput("bun", ["-v"]),
    ]);

  const swVersMap: Record<string, string> = {};
  if (swVers) {
    for (const line of swVers.split(/\r?\n/)) {
      const match = line.match(/^(\S+):\s+(.+)$/);
      if (match) swVersMap[match[1]] = match[2].trim();
    }
  }

  let brewConfig: Record<string, unknown> | null = null;
  if (brewConfigJson) {
    try {
      const parsed = JSON.parse(brewConfigJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        brewConfig = redact(parsed[0]) as Record<string, unknown>;
      } else if (parsed && typeof parsed === "object") {
        brewConfig = redact(parsed) as Record<string, unknown>;
      }
    } catch {
      brewConfig = null;
    }
  }

  const config = await loadConfig();
  const manifests = (await listManifests()).map((m) => m.name).sort();

  const binary = (await tryOutput("which", ["allbrew"])) || "allbrew";

  return {
    capturedAt: new Date().toISOString(),
    os: {
      name: swVersMap["ProductName"] || unameSys || "unknown",
      version: swVersMap["ProductVersion"] || unameRel || "",
      build: swVersMap["BuildVersion"] || "",
      kernel: unameRel || "",
      arch: unameArch || "",
    },
    brew: {
      version: brewVersion ? brewVersion.split(/\r?\n/)[0] : null,
      prefix: brewPrefix,
      config: brewConfig,
      formulae: await tryList("brew", ["list", "--formula"]),
      casks: await tryList("brew", ["list", "--cask"]),
    },
    allbrew: {
      version: await tryOutput("allbrew", ["--version"]),
      binary,
      configPath: getConfigPath(),
      config: redactSecrets(config as Record<string, unknown>),
      manifests,
    },
    runtime: {
      node: nodeVersion,
      bun: bunVersion,
    },
  };
}

export function sanitizeReport(report: DiagnosticReport): DiagnosticReport {
  const deep = redactDeep(report);
  return JSON.parse(
    redactHomePaths(JSON.stringify(deep, null, 2)),
  ) as DiagnosticReport;
}

export function formatDiagnosticReport(report: DiagnosticReport): string {
  const safe = sanitizeReport(report);
  const lines: string[] = [];
  lines.push("# allbrew diagnostic report");
  lines.push("");
  lines.push(`- Captured: ${safe.capturedAt}`);
  lines.push(`- OS: ${safe.os.name} ${safe.os.version} (build ${safe.os.build})`);
  lines.push(`- Arch: ${safe.os.arch}`);
  lines.push(`- allbrew: ${safe.allbrew.version || "unknown"} (${safe.allbrew.binary})`);
  lines.push(`- Homebrew: ${safe.brew.version || "unknown"} (${safe.brew.prefix || "unknown"})`);
  lines.push(`- Node: ${safe.runtime.node || "n/a"} | Bun: ${safe.runtime.bun || "n/a"}`);
  lines.push("");
  lines.push("## Managed packages (manifests)");
  if (safe.allbrew.manifests.length === 0) {
    lines.push("_(none)_");
  } else {
    for (const name of safe.allbrew.manifests) lines.push(`- ${name}`);
  }
  lines.push("");
  lines.push("## Homebrew formulae");
  if (safe.brew.formulae.length === 0) {
    lines.push("_(none)_");
  } else {
    for (const f of safe.brew.formulae) lines.push(`- ${f}`);
  }
  lines.push("");
  lines.push("## Homebrew casks");
  if (safe.brew.casks.length === 0) {
    lines.push("_(none)_");
  } else {
    for (const c of safe.brew.casks) lines.push(`- ${c}`);
  }
  lines.push("");
  lines.push("## Homebrew config");
  if (safe.brew.config) {
    lines.push("```json");
    lines.push(JSON.stringify(safe.brew.config, null, 2));
    lines.push("```");
  } else {
    lines.push("_(unavailable)_");
  }
  lines.push("");
  return lines.join("\n");
}
