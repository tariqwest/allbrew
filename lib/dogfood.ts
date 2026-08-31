import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { captureSystemInfo, formatDiagnosticReport } from "./diagnose.ts";

const execFileAsync = promisify(execFile);

export type DogfoodModelBackend = "fm" | "pcc";

export type DogfoodJudgment = {
  generator: string | null;
  packageName: string | null;
  binName: string | null;
  isService: boolean | null;
  serviceCommand: string | null;
  rationale: string;
};

export type DogfoodOutcome = {
  url: string;
  runId: string;
  exitCode: number | null;
  logPath: string;
  reportPath: string | null;
  judgment: DogfoodJudgment | null;
  failureClass: string | null;
  patches: string[];
};

const FM_BIN = "/usr/bin/fm";

const DOGFOOD_INSTRUCTIONS = `You are the allbrew dogfooding agent. allbrew generates Homebrew
formulas and casks from arbitrary URLs (GitHub repos, bash scripts, binaries,
archives, Mac App Store and Setapp links). Your job is to classify a URL,
predict the generator and service behavior, and report your judgment as
structured JSON so a human or another agent can compare it against what
allbrew actually produced.

When given a URL:
1. Decide the most likely generator (e.g. binary-release, npm-package,
   pip-package, cargo-package, go-package, source-build, install-script,
   archive-build, binary-direct, cask-app, cask-app-release, cask-app-mas,
   cask-app-setapp, spm-package, dotnet-package, gem-package, mint-package).
2. Predict the package/formula name and binary name.
3. Decide whether the tool is a long-running background service (daemon,
   server, listener) that warrants a Homebrew "service do" block, and if so
   the command (e.g. "hister listen").
4. Give a short rationale.

Do not guess wildly. Prefer the most defensible classification from the URL
shape and any repository/package conventions you can infer.`;

function fmSchemaFile(): string {
  return JSON.stringify({
    required: [
      "generator",
      "packageName",
      "binName",
      "isService",
      "serviceCommand",
      "rationale",
    ],
    type: "object",
    properties: {
      isService: { type: "boolean" },
      generator: { type: "string" },
      serviceCommand: { type: "string" },
      rationale: { type: "string" },
      packageName: { type: "string" },
      binName: { type: "string" },
    },
    additionalProperties: false,
    "x-order": [
      "generator",
      "packageName",
      "binName",
      "isService",
      "serviceCommand",
      "rationale",
    ],
    title: "Judgment",
  });
}

async function runFm(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(FM_BIN, args, {
    encoding: "utf-8",
    timeout: 120_000,
  });
  return (stdout || "").trim();
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function parseJudgment(raw: string): DogfoodJudgment | null {
  const clean = stripAnsi(raw).trim();
  const jsonStart = clean.indexOf("{");
  const jsonEnd = clean.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return {
      generator: null,
      packageName: null,
      binName: null,
      isService: null,
      serviceCommand: null,
      rationale: clean.slice(0, 1000),
    };
  }
  try {
    const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
    return {
      generator: parsed.generator ?? null,
      packageName: parsed.packageName ?? null,
      binName: parsed.binName ?? null,
      isService:
        typeof parsed.isService === "boolean" ? parsed.isService : null,
      serviceCommand: parsed.serviceCommand ?? null,
      rationale: parsed.rationale ?? "",
    };
  } catch {
    return {
      generator: null,
      packageName: null,
      binName: null,
      isService: null,
      serviceCommand: null,
      rationale: clean.slice(0, 1000),
    };
  }
}

async function classifyWithFm(url: string): Promise<DogfoodJudgment> {
  const schemaPath = join(tmpdir(), `allbrew-dogfood-schema-${process.pid}.json`);
  await writeFile(schemaPath, fmSchemaFile(), "utf-8");
  try {
    const raw = await runFm([
      "respond",
      "--instructions",
      DOGFOOD_INSTRUCTIONS,
      "--schema",
      schemaPath,
      "--no-stream",
      url,
    ]);
    return parseJudgment(raw) ?? (await classifyWithFmFallback(url));
  } catch {
    return classifyWithFmFallback(url);
  } finally {
    await import("node:fs/promises").then(({ rm }) =>
      rm(schemaPath, { force: true }),
    );
  }
}

async function classifyWithFmFallback(url: string): Promise<DogfoodJudgment> {
  const raw = await runFm([
    "respond",
    "--instructions",
    DOGFOOD_INSTRUCTIONS,
    "--no-stream",
    url,
  ]);
  return parseJudgment(raw) ?? {
    generator: null,
    packageName: null,
    binName: null,
    isService: null,
    serviceCommand: null,
    rationale: "",
  };
}

async function classifyWithPcc(url: string): Promise<DogfoodJudgment> {
  return classifyWithFmFallback(url);
}

async function classify(
  url: string,
  backend: DogfoodModelBackend,
): Promise<DogfoodJudgment> {
  if (backend === "pcc") return classifyWithPcc(url);
  return classifyWithFm(url);
}

function slugify(value: string): string {
  return (
    String(value || "pkg")
      .toLowerCase()
      .replace(/https?:\/\//g, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "pkg"
  );
}

function isoStamp(d = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

export async function runDogfood(
  url: string,
  options: {
    name?: string;
    backend?: DogfoodModelBackend;
    reportDir?: string;
    noInstall?: boolean;
  } = {},
): Promise<DogfoodOutcome> {
  const backend = options.backend || "fm";
  const runId = `${isoStamp()}__${slugify(options.name || url)}`;
  const runDir = options.reportDir || join(tmpdir(), `allbrew-dogfood-${runId}`);
  await mkdir(runDir, { recursive: true });

  const judgment = await classify(url, backend);
  const judgmentPath = join(runDir, "agent-judgment.json");
  await writeFile(judgmentPath, JSON.stringify(judgment, null, 2) + "\n", "utf-8");

  const logPath = join(runDir, "allbrew-run.log");
  const args = [url, "--verbose"];
  if (options.name) args.push("--name", options.name);
  if (options.noInstall) args.push("--no-install");

  let exitCode: number | null = null;
  try {
    const { stdout, stderr } = await execFileAsync(
      "allbrew",
      args,
      { encoding: "utf-8", timeout: 600_000, env: { ...process.env, ALLBREW_NONINTERACTIVE: "1" } },
    );
    exitCode = 0;
    await writeFile(logPath, `${stdout || ""}${stderr ? `\n[stderr]\n${stderr}` : ""}`, "utf-8");
  } catch (err: any) {
    exitCode = err.code ?? null;
    const output = `${err.stdout || ""}${err.stderr ? `\n[stderr]\n${err.stderr}` : ""}`;
    await writeFile(logPath, output, "utf-8");
  }

  const info = await captureSystemInfo();
  const report = formatDiagnosticReport(info);
  const reportPath = join(runDir, "diagnostic-report.md");
  await writeFile(reportPath, report + "\n", "utf-8");

  return {
    url,
    runId,
    exitCode,
    logPath,
    reportPath,
    judgment,
    failureClass: exitCode === 0 ? null : "generate_fail",
    patches: [],
  };
}
