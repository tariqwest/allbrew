#!/usr/bin/env bun
/**
 * Finalize a monitored-install run record.
 *
 * Usage:
 *   bun …/finalize-run-record.mjs --run-dir <path> \
 *     --status success|fixed_success|failed|blocked \
 *     [--failure-class generate_fail|brew_fail|service_mismatch|prompt_hang|env_fail] \
 *     [--package-name gitnexus] [--package-version 1.6.9] [--package-kind formula|cask] \
 *     [--release-tag v0.0.8] [--release-commit abc] \
 *     [--allbrew-version-final 0.0.8] \
 *     [--verify-ok true|false]
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  symlinkSync,
  lstatSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { join, resolve, basename, dirname } from "node:path";

function arg(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

const runDirArg = arg("--run-dir", "");
if (!runDirArg) {
  console.error("--run-dir is required");
  process.exit(2);
}
const runDir = resolve(runDirArg);
if (!existsSync(runDir) || !existsSync(join(runDir, "metadata.json"))) {
  console.error(`--run-dir must exist and contain metadata.json: ${runDir}`);
  process.exit(2);
}

const status = arg("--status", "failed");
const failureClassRaw = arg("--failure-class", null);
const failureClass =
  !failureClassRaw || failureClassRaw === "null" ? null : failureClassRaw;
const packageName = arg("--package-name", null);
const packageVersion = arg("--package-version", null);
const packageKind = arg("--package-kind", "formula");
const releaseTag = arg("--release-tag", null);
const releaseCommit = arg("--release-commit", null);
const allbrewVersionFinal = arg("--allbrew-version-final", null);
const verifyOk = arg("--verify-ok", "false") === "true";

const metaPath = join(runDir, "metadata.json");
const judgmentPath = join(runDir, "agent-judgment.json");
const outcomePath = join(runDir, "outcome.json");
const metadata = readJson(metaPath, {});
const judgment = readJson(judgmentPath, {});

const finishedAt = new Date().toISOString();
metadata.finishedAt = finishedAt;
if (allbrewVersionFinal) {
  metadata.allbrew = metadata.allbrew || {};
  metadata.allbrew.versionFinal = allbrewVersionFinal;
}
if (releaseTag || releaseCommit) {
  metadata.release = {
    tag: releaseTag,
    commit: releaseCommit,
    bumped: Boolean(releaseTag),
  };
}

const deltas = Array.isArray(judgment.deltas) ? judgment.deltas : [];
const errorFields = new Set(
  deltas.filter((d) => d.severity === "error").map((d) => d.field),
);
const observedGen = judgment.codebaseObserved?.generator
  ? String(judgment.codebaseObserved.generator).split("->").pop()
  : null;
const agreement = {
  generator: Boolean(
    judgment.expected?.generator &&
      observedGen &&
      judgment.expected.generator === observedGen,
  ),
  packageName: !errorFields.has("packageName"),
  service: !errorFields.has("service"),
  overall: false,
};
agreement.overall =
  agreement.generator &&
  agreement.packageName &&
  agreement.service &&
  (status === "success" || status === "fixed_success");

const outcome = {
  schemaVersion: 1,
  status,
  failureClass,
  package:
    packageName || packageVersion
      ? {
          name: packageName || judgment.expected?.formulaName || metadata.slug,
          version: packageVersion,
          kind: packageKind,
        }
      : null,
  verification: {
    ok: verifyOk,
    commands: [],
    outputs: [],
  },
  fix: {
    applied: status === "fixed_success" || Boolean(releaseTag),
    commit: releaseCommit,
    releaseTag,
    files: [],
  },
  agentCodebaseAgreement: agreement,
};

const prior = readJson(outcomePath, null);
if (prior?.verification?.commands?.length) {
  outcome.verification = {
    ...prior.verification,
    ok: verifyOk || prior.verification.ok,
  };
}
if (prior?.fix?.files?.length) {
  outcome.fix.files = prior.fix.files;
}

writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + "\n");
writeFileSync(outcomePath, JSON.stringify(outcome, null, 2) + "\n");

const runsRoot = dirname(runDir);
mkdirSync(runsRoot, { recursive: true });
const indexPath = join(runsRoot, "index.jsonl");
const indexLine = {
  runId: metadata.runId || basename(runDir),
  finishedAt,
  url: metadata.url || judgment.url || null,
  slug: metadata.slug || packageName || null,
  status,
  generator: observedGen || judgment.expected?.generator || null,
  failureClass: outcome.failureClass,
  deltas: deltas.map((d) => d.field).filter(Boolean),
  releaseTag: releaseTag || null,
  agreement: agreement.overall,
};
writeFileSync(indexPath, JSON.stringify(indexLine) + "\n", { flag: "a" });

const latest = join(runsRoot, "latest");
try {
  if (existsSync(latest) || lstatSync(latest).isSymbolicLink()) {
    unlinkSync(latest);
  }
} catch {
  /* ignore */
}
try {
  symlinkSync(basename(runDir), latest);
} catch (err) {
  console.error(`warn: could not update latest symlink: ${err.message}`);
}

console.log(`FINALIZED=${runDir}`);
console.log(`STATUS=${status}`);
console.log(`INDEX=${indexPath}`);
