#!/usr/bin/env bun
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync,
  symlinkSync, lstatSync, unlinkSync, readdirSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import { fileURLToPath } from "node:url";

const currentDir = typeof import.meta.dir === "string" ? import.meta.dir : dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(currentDir, "../../..");
export const BATCH_DIR = resolve(currentDir, "..");
export const SKILL_SCRIPTS = join(REPO_ROOT, ".agents/skills/monitored-install/scripts");
export const RUNS_ROOT = join(REPO_ROOT, "tests/monitored-install-runs");
export const BATCH_RUNS = join(BATCH_DIR, "runs");
export const BATCH_LOGS = join(BATCH_DIR, "logs");
export const BATCH_STATE = join(BATCH_DIR, "state");
export const BATCH_INDEX = join(BATCH_STATE, "index.jsonl");
export const FIX_INDEX = join(BATCH_STATE, "fix-index.jsonl");
export const WORKTREES_ROOT = join(BATCH_DIR, "worktrees");
export const AGENT_QUEUE_PATH = join(BATCH_DIR, "agent-queue.json");
export const DEFAULT_WORKERS = ["th-allbrew-w1", "th-allbrew-w2"];

export function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
export function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}
export function slugify(name, url) {
  return ((name || url || "pkg").toLowerCase().replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "pkg");
}
export function ensureDirs() {
  mkdirSync(BATCH_RUNS, { recursive: true });
  mkdirSync(BATCH_LOGS, { recursive: true });
  mkdirSync(BATCH_STATE, { recursive: true });
  mkdirSync(RUNS_ROOT, { recursive: true });
}

/**
 * Homebrew official installer only supports /opt/homebrew on Apple Silicon.
 * th-allbrew (or single-worker) uses the harness default exclusive prefix.
 */
export function buildWorkerDefs(names = DEFAULT_WORKERS) {
  const forceOpt = envBool("TH_BATCH_FORCE_OPT_HOMEBREW", false);
  return names.map((user, i) => {
    const id = names.length === 1 && user === "th-allbrew" ? "w0" : `w${i + 1}`;
    const home = `/Users/${user}`;
    const useDefaultPrefix = forceOpt || user === "th-allbrew" || names.length === 1;
    const mount = useDefaultPrefix
      ? (process.env.TH_HOMEBREW_MOUNT_POINT || "/opt/homebrew")
      : `${home}/homebrew`;
    const lockPath = useDefaultPrefix
      ? (process.env.TH_HOMEBREW_LOCK_PATH || "/var/run/lume-homebrew.lock")
      : `/var/run/lume-hb-${id}.lock`;
    const sparsebundleDir = useDefaultPrefix
      ? (process.env.TH_HOMEBREW_SPARSEBUNDLE_DIR || `${home}/Library/LumeHomebrew`)
      : `${home}/Library/LumeHomebrew`;
    return {
      id, user, home,
      workspace: process.env.TH_VM_WORKSPACE && user === "th-allbrew"
        ? process.env.TH_VM_WORKSPACE
        : `${home}/Developer/allbrew`,
      tapPath: `${home}/homebrew-allbrew`,
      mountPoint: mount,
      lockPath,
      sparsebundleDir,
      sparsebundleName: process.env.TH_HOMEBREW_SPARSEBUNDLE_NAME || "homebrew.sparsebundle",
      homebrewPath: `${mount}/bin:${mount}/sbin`,
      extraPath: useDefaultPrefix
        ? (process.env.TH_EXTRA_PATH || `${home}/.bun/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`)
        : `${home}/.bun/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      useDefaultPrefix,
    };
  });
}

export function workerProcessEnv(worker, baseEnv = process.env) {
  return {
    ...baseEnv,
    TH_PROJECT_USER: worker.user,
    TH_VM_WORKSPACE: worker.workspace,
    TH_HOMEBREW_MOUNT_POINT: worker.mountPoint,
    TH_HOMEBREW_LOCK_PATH: worker.lockPath,
    TH_HOMEBREW_SPARSEBUNDLE_DIR: worker.sparsebundleDir,
    TH_HOMEBREW_SPARSEBUNDLE_NAME: worker.sparsebundleName,
    TH_HOMEBREW_PATH: worker.homebrewPath,
    TH_EXTRA_PATH: worker.extraPath,
    TH_HOMEBREW_PREFIX_ENABLED: baseEnv.TH_HOMEBREW_PREFIX_ENABLED ?? "1",
    TH_BATCH_WORKER_ID: worker.id,
    TH_BATCH_WORKER_USER: worker.user,
    TH_BATCH_WORKER_TAP: worker.tapPath,
    TH_BATCH_WORKER_MOUNT: worker.mountPoint,
  };
}

export function parseUrlShape(url) {
  let host=null, owner=null, repo=null, kind="unknown"; const hints=[];
  try {
    const u = new URL(url); host = u.hostname.replace(/^www\./,"");
    const parts = u.pathname.split("/").filter(Boolean);
    if (host==="github.com" && parts.length>=2) { kind="github-repo"; owner=parts[0]; repo=parts[1].replace(/\.git$/,""); hints.push("github"); }
    else if (host.includes("npmjs")) { kind="npm-package"; hints.push("npm"); }
    else if (host.includes("pypi")) { kind="pypi"; hints.push("pip"); }
    else if (host==="crates.io") { kind="crates"; hints.push("cargo"); }
    else if (host==="pkg.go.dev") { kind="go-module"; hints.push("go"); }
    else if (host.includes("rubygems")) { kind="gem"; }
    else if (host.includes("nuget")) { kind="nuget"; }
    else if (host==="apps.apple.com") { kind="mac-app-store"; }
    else if (host.includes("setapp")) { kind="setapp"; }
    else if (/\.(dmg|pkg)(\?|$)/i.test(u.pathname)) { kind="cask-url"; }
    else if (/\.(sh|bash)(\?|$)/i.test(u.pathname)) { kind="bash-script"; }
  } catch {}
  return { kind, host, owner, repo, hints };
}

export function heuristicGenerator(shape) {
  const m = {
    "npm-package":"npm-package", pypi:"pip-package", crates:"cargo-package",
    "go-module":"go-package", gem:"gem-package", nuget:"dotnet-package",
    "mac-app-store":"cask-app-mas", setapp:"cask-app-setapp", "cask-url":"cask-app",
    "bash-script":"install-script", "github-repo":"github-auto",
  };
  return m[shape.kind] ?? null;
}

export function buildAgentJudgment({ url, slug, name, source }) {
  const shape = parseUrlShape(url);
  const generator = heuristicGenerator(shape);
  const isCask = ["cask-url","mac-app-store","setapp"].includes(shape.kind);
  const packageName = (name || shape.repo || slug || "pkg").toLowerCase().replace(/[^a-z0-9@._+-]+/g,"-");
  return {
    schemaVersion:1, url,
    inputShape:{ kind:shape.kind, host:shape.host, owner:shape.owner, repo:shape.repo, hints:[...shape.hints, ...(source?[`source:${source}`]:[])] },
    expected:{ strategy:shape.kind, generator, packageName, formulaName:slug, binName:slug, service:isCask?false:null, serviceCommand:null, allbrewArgs:["--name",slug,"--verbose"], rationale:isCask?"cask/gui":"heuristic; service unclear" },
    codebaseObserved:{ strategy:null, generator:null, packageNameDetected:null, packageNameUsed:null, serviceDetected:null, serviceCommand:null, formulaPath:null, logSignals:[] },
    deltas:[], proposedRule:null, notes:`batch heuristic; source=${source||"urls-shuffled"}`,
  };
}

export function extractExitCode(logText, fallback = null) {
  const text = String(logText || "");
  // Prefer last EXIT_CODE=N marker written by installCmd / guest install logs.
  const markers = [...text.matchAll(/\bEXIT_CODE=(\d{1,3})\b/g)];
  if (markers.length) {
    const n = Number(markers[markers.length - 1][1]);
    if (Number.isInteger(n) && n >= 0 && n <= 255) return n;
  }
  // Harness / shell error message shapes
  const patterns = [
    /Command failed with exit code\s+(\d{1,3})\b/i,
    /exited with code\s+(\d{1,3})\b/i,
    /exit code[:\s]+(\d{1,3})\b/i,
    /\(exit code\s+(\d{1,3})\)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n >= 0 && n <= 255) return n;
    }
  }
  if (fallback === undefined || fallback === null || Number.isNaN(Number(fallback))) return null;
  const fb = Number(fallback);
  return Number.isInteger(fb) && fb >= 0 && fb <= 255 ? fb : null;
}

export function extractPackageName(logText, fallback) {
  const patterns=[
    /Wrote (?:formula|cask).*?\/([A-Za-z0-9][A-Za-z0-9@._+-]*)\.rb/i,
    /==> (?:Pouring|Installing Cask|Installing) ([A-Za-z0-9][A-Za-z0-9@._+-]*)/i,
    /Generated (?:formula|cask): ([A-Za-z0-9][A-Za-z0-9@._+-]*)/i,
  ];
  for (const p of patterns) { const m=logText.match(p); if (m) return m[1].split("/").pop().trim(); }
  return fallback;
}
export function extractGenerator(logText) {
  const m = logText.match(/Detected install method:\s*([^\n]+)/i) || logText.match(/Using generator:\s*([^\n]+)/i);
  return m ? m[1].trim() : null;
}
export function extractServiceDecision(logText, formulaText="") {
  const hasServiceDo=/service\s+do\b/.test(formulaText);
  const detectedHint=/Detected service\/launchagent hint/i.test(logText);
  let serviceCommand=null;
  const runMatch=formulaText.match(/run\s+\[[^\]]*\]/s);
  if (runMatch) serviceCommand=runMatch[0].replace(/\s+/g," ").trim();
  return { serviceDetected:Boolean(hasServiceDo||detectedHint), serviceCommand, hasServiceDo };
}
export function classifyFailure(logText, exitCode, verify) {
  const log=logText||"";
  if (/allbrew not configured|Name for your local tap directory|Welcome to allbrew/i.test(log)) return "env_fail";
  if (/API rate limit exceeded|secondary rate limit|403.*rate limit/i.test(log)) return "github_rate_limit";
  if (/\? |inquirer|Select /i.test(log) && exitCode!==0) return "prompt_hang";
  if (/No macOS binary|formula requires at least a URL|registry lookup failed|404|classif|unsupported|Could not determine/i.test(log)) {
    if (/Wrote (?:formula|cask)/i.test(log) && /brew install|Error:/i.test(log)) return "brew_fail";
    return "generate_fail";
  }
  if (exitCode!==0) return /Wrote (?:formula|cask)/i.test(log) ? "brew_fail" : "generate_fail";
  if (verify && !verify.ok) return "brew_fail";
  return null;
}
export function compareService(expectedService, observed) {
  if (expectedService===null||expectedService===undefined) {
    if (observed.serviceCommand && /This starts|starts the server on/i.test(String(observed.serviceCommand)))
      return { mismatch:true, note:"prose service command" };
    return { mismatch:false, note:"unclear ok" };
  }
  if (Boolean(expectedService)!==Boolean(observed.serviceDetected))
    return { mismatch:true, note:`expected=${expectedService} observed=${observed.serviceDetected}` };
  return { mismatch:false, note:"aligned" };
}
export function buildDeltas(judgment) {
  const deltas=[]; const exp=judgment.expected||{}; const obs=judgment.codebaseObserved||{};
  if (exp.service!==null && exp.service!==undefined && obs.serviceDetected!==null) {
    deltas.push({ field:"service", agent:exp.service, codebase:obs.serviceDetected,
      severity:Boolean(exp.service)===Boolean(obs.serviceDetected)?"match":"error", note:"service" });
  }
  return deltas;
}
export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Write a fix-package under runDir.
 * Backward compatible: existing callers produce mode=docs packages.
 * Optional: patches/files arrays for machine-applyable packages.
 *
 * patches: [{ name?: string, content: string|Buffer }]
 * files:   [{ target: string, content: string|Buffer, name?: string }]
 * mode:    "docs" | "patch" (default: patch if any patches/files else docs)
 */
export function writeFixPackage(runDir, {
  url, slug, failureClass, logText, verify, localRepro,
  patches = [], files = [], mode, sourceRunId, baselineCommit,
  manifestExtras = {}, validationHints = null,
} = {}) {
  const fixDir = join(runDir, "fix-package");
  const patchesDir = join(fixDir, "patches");
  const filesDir = join(fixDir, "files");
  mkdirSync(patchesDir, { recursive: true });
  mkdirSync(filesDir, { recursive: true });

  const patchEntries = [];
  for (let i = 0; i < (patches || []).length; i++) {
    const p = patches[i];
    const name = p.name || `${String(i + 1).padStart(4, "0")}-fix.patch`;
    const rel = `patches/${name.replace(/^patches\//, "")}`;
    const abs = join(fixDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    const content = typeof p.content === "string" ? p.content : Buffer.from(p.content || "");
    writeFileSync(abs, content);
    patchEntries.push({ path: rel, sha256: sha256Hex(content) });
  }

  const fileEntries = [];
  for (let i = 0; i < (files || []).length; i++) {
    const f = files[i];
    const target = String(f.target || "").replace(/^\/+/, "");
    if (!target) throw new Error("writeFixPackage: files[].target required");
    const name = f.name || target;
    const rel = `files/${name.replace(/^files\//, "")}`;
    const abs = join(fixDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    const content = typeof f.content === "string" ? f.content : Buffer.from(f.content || "");
    writeFileSync(abs, content);
    fileEntries.push({ path: rel, target, sha256: sha256Hex(content) });
  }

  const resolvedMode = mode || ((patchEntries.length || fileEntries.length) ? "patch" : "docs");
  const runId = sourceRunId || (typeof runDir === "string" ? runDir.split(/[\\/]/).filter(Boolean).pop() : null);

  const manifest = {
    schemaVersion: 1,
    slug: slug || "pkg",
    url: url || null,
    failureClass: failureClass || null,
    sourceRunId: runId,
    baselineCommit: baselineCommit || null,
    mode: resolvedMode,
    patches: patchEntries,
    files: fileEntries,
    validationHints: validationHints || null,
    ...manifestExtras,
  };
  writeFileSync(join(fixDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const logTail = (logText || "").split("\n").slice(-80).join("\n");
  const residual = resolvedMode === "docs"
    ? "\n## Residual risk\nBatch did not apply product code changes. Reconciliation required.\n"
    : "\n## Residual risk\nPatch package present; host-side reconcile applies only in disposable worktrees.\n";
  writeFileSync(join(fixDir, "FIX.md"), `# Fix package: ${slug}\n\n## URL\n${url}\n\n## Failure class\n\`${failureClass || "unknown"}\`\n\n## Mode\n\`${resolvedMode}\`\n\n## Log tail\n\`\`\`\n${logTail}\n\`\`\`\n\n## Verification\n\`\`\`json\n${JSON.stringify(verify || {}, null, 2)}\n\`\`\`\n\n## Local repro\n\`\`\`json\n${JSON.stringify(localRepro || { attempted: false }, null, 2)}\n\`\`\`\n${residual}`);
  writeFileSync(join(fixDir, "tests-added.md"), `# Tests for ${slug}\n\n- Unit case for ${failureClass}\n`);
  writeFileSync(join(fixDir, "validation.json"), JSON.stringify({
    failureClass,
    localRepro: localRepro || null,
    verify: verify || null,
    createdAt: new Date().toISOString(),
    mode: resolvedMode,
    manifestPresent: true,
  }, null, 2) + "\n");
  return fixDir;
}
export function appendFixIndex(entry){ appendFileSync(FIX_INDEX, JSON.stringify(entry)+"\n"); }
export function linkBatchPointer(runDir, batchRunId) {
  mkdirSync(BATCH_RUNS,{recursive:true});
  const pointer=join(BATCH_RUNS, batchRunId);
  try { if (existsSync(pointer)||lstatSync(pointer).isSymbolicLink()) unlinkSync(pointer); } catch {}
  try { symlinkSync(runDir, pointer); }
  catch { writeFileSync(join(BATCH_RUNS, `${batchRunId}.pointer.json`), JSON.stringify({runDir,batchRunId},null,2)); }
}
export function initRunRecordHost({ url, slug, workerId }) {
  const initScript=join(SKILL_SCRIPTS,"init-run-record.mjs");
  const r=spawnSync("bun",[initScript,"--url",url,"--slug",slug,"--repo-root",REPO_ROOT],{encoding:"utf8",cwd:REPO_ROOT});
  if (r.status!==0) throw new Error(`init-run-record failed: ${r.stderr||r.stdout||r.status}`);
  const out=`${r.stdout||""}\n${r.stderr||""}`;
  const runDir=(out.match(/^RUN_DIR=(.+)$/m)||[])[1];
  const runId=(out.match(/^RUN_ID=(.+)$/m)||[])[1];
  if (!runDir||!runId) throw new Error(`init-run-record missing RUN_DIR/RUN_ID:\n${out}`);
  try {
    const metaPath=join(runDir,"metadata.json");
    const meta=JSON.parse(readFileSync(metaPath,"utf8"));
    meta.batch={ workerId:workerId||null, mode:"skill-aligned", concurrency:envInt("TH_BATCH_CONCURRENCY",2) };
    writeFileSync(metaPath, JSON.stringify(meta,null,2)+"\n");
  } catch {}
  return { runDir, runId };
}
export function finalizeRunRecordHost(args) {
  const fin=join(SKILL_SCRIPTS,"finalize-run-record.mjs");
  const argv=[fin,"--run-dir",args.runDir,"--status",args.status];
  if (args.failureClass) argv.push("--failure-class", args.failureClass);
  if (args.packageName) argv.push("--package-name", args.packageName);
  if (args.packageKind) argv.push("--package-kind", args.packageKind);
  if (args.verifyOk!=null) argv.push("--verify-ok", args.verifyOk?"true":"false");
  if (args.allbrewVersionFinal) argv.push("--allbrew-version-final", args.allbrewVersionFinal);
  const r=spawnSync("bun",argv,{encoding:"utf8",cwd:REPO_ROOT});
  if (r.status!==0) throw new Error(`finalize-run-record failed: ${r.stderr||r.stdout||r.status}`);
  return r.stdout||"";
}
export function listRbFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f=>f.endsWith(".rb")).map(f=>join(dir,f));
}
export function localReproGenerate({ url, slug, timeoutMs=180000 }) {
  const tmpTap=join(process.env.TMPDIR||"/tmp", `allbrew-batch-repro-${slug}-${Date.now()}`);
  mkdirSync(join(tmpTap,"Formula"),{recursive:true});
  mkdirSync(join(tmpTap,"Casks"),{recursive:true});
  const logPath=join(tmpTap,"repro.log");
  const started=Date.now();
  const r=spawnSync("bun",["run","bin/allbrew.ts",url,"--name",slug,"--tap",tmpTap,"--verbose"],{
    encoding:"utf8", cwd:REPO_ROOT, timeout:timeoutMs,
    env:{...process.env, CI:"1", ALLBREW_NONINTERACTIVE:"1", HOMEBREW_NO_AUTO_UPDATE:"1"},
  });
  const log=`${r.stdout||""}\n${r.stderr||""}`;
  try { writeFileSync(logPath, log); } catch {}
  const formulaFiles=[...listRbFiles(join(tmpTap,"Formula")), ...listRbFiles(join(tmpTap,"Casks"))];
  return { attempted:true, exitCode:r.status, durationMs:Date.now()-started, tmpTap, logPath, formulaFiles,
    ok:r.status===0 && formulaFiles.length>0, error:r.error?String(r.error.message||r.error):null };
}
export function parseVerifyOutput(text, pkg, expectService) {
  const formulaListed=/FORMULA_LISTED=1/.test(text);
  const caskListed=/CASK_LISTED=1/.test(text);
  const listed=formulaListed||caskListed;
  const manifestOk=/MANIFEST_OK/.test(text);
  const binOk=/BIN_OK/.test(text);
  const appOk=/APP_OK/.test(text);
  const serviceOk=expectService===true ? (/SERVICE_STANZA=1/.test(text)||/Service/.test(text)) : true;
  const kind=caskListed?"cask":"formula";
  const ok=listed && manifestOk && (binOk||appOk||caskListed) && serviceOk;
  return { ok, listed, formulaListed, caskListed, manifestOk, binOk, appOk, serviceOk, kind, raw:text };
}
export function appendBatchIndex(outcome){ appendFileSync(BATCH_INDEX, JSON.stringify(outcome)+"\n"); }
export function writeProgress(done,total,last){
  writeFileSync(join(BATCH_DIR,"progress.json"), JSON.stringify({done,total,last,updatedAt:new Date().toISOString()},null,2));
}
