#!/usr/bin/env bun
/**
 * Long-lived skill-aligned worker.
 *
 * Acquires the Homebrew prefix ONCE, processes many URLs from stdin (JSONL),
 * and only releases/force-unlocks on exit. This avoids the host-PID-in-guest
 * lock thrash that caused mass env_fail after ~100 URLs.
 *
 * Protocol:
 *   stdin:  one JSON entry per line {idx,name,url,source}
 *   stdout: OUTCOME_JSON={...} per entry
 *   stderr: progress logs
 *   blank line or EOF ends the worker
 */
import { createInterface } from "node:readline";
import { writeFileSync, readFileSync, existsSync, cpSync } from "node:fs";
import { join } from "node:path";
import {
  ensureDirs,
  slugify,
  buildAgentJudgment,
  extractPackageName,
  extractGenerator,
  extractServiceDecision,
  classifyFailure,
  compareService,
  buildDeltas,
  writeFixPackage,
  appendFixIndex,
  linkBatchPointer,
  initRunRecordHost,
  finalizeRunRecordHost,
  localReproGenerate,
  parseVerifyOutput,
  appendBatchIndex,
  envBool,
  BATCH_LOGS,
} from "./lib/batch-helpers.mjs";
import {
  loadHarness,
  guest,
  ensureAllbrew,
  ensureTapConfigured,
  installCmd,
  strictVerifyCmd,
  uninstallCmd,
  fetchFormulaCmd,
  acquireHomebrewPrefixDurable,
  releaseHomebrewPrefixDurable,
} from "./lib/guest-ops.mjs";

ensureDirs();

const workerId = process.env.TH_BATCH_WORKER_ID || "w1";
const tapPath =
  process.env.TH_BATCH_WORKER_TAP ||
  `${process.env.HOME || ""}/homebrew-allbrew`;
const mountPoint =
  process.env.TH_BATCH_WORKER_MOUNT ||
  process.env.TH_HOMEBREW_MOUNT_POINT ||
  "/opt/homebrew";
const fixMode = process.env.TH_BATCH_FIX_MODE || "docs";
const doLocalRepro = envBool("TH_BATCH_LOCAL_REPRO", true);
const token = process.env.GITHUB_TOKEN || "";
const keepPrefix = envBool("TH_BATCH_KEEP_PREFIX", true);

function log(...args) {
  console.error(`[worker:${workerId}]`, ...args);
}
function envTimeout(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function runOne(h, session, entry, allbrewVersion) {
  const name = entry.name || slugify(null, entry.url);
  const url = entry.url;
  const slug = slugify(name, url);
  const idx = entry.idx ?? 0;
  const started = Date.now();

  let runDir = null;
  let runId = null;
  let batchRunId = `${String(idx).padStart(4, "0")}-${slug}-pending`;
  ({ runDir, runId } = initRunRecordHost({ url, slug, workerId }));
  batchRunId = `${String(idx).padStart(4, "0")}-${slug}-${runId.split("__")[0] || Date.now()}`;
  linkBatchPointer(runDir, batchRunId);

  const judgment = buildAgentJudgment({
    url,
    slug,
    name,
    source: entry.source,
  });
  writeFileSync(join(runDir, "agent-judgment.json"), JSON.stringify(judgment, null, 2) + "\n");
  writeFileSync(
    join(runDir, "input.json"),
    JSON.stringify({ idx, name, url, source: entry.source, workerId, runId }, null, 2),
  );

  let installLog = "";
  let exitCode = 1;
  let pkg = slug;
  let verify = { ok: false };
  let formulaText = "";
  let failureClass = null;
  let status = "failed";
  let fixPackagePath = null;
  let localRepro = { attempted: false };

  try {
    // Re-ensure tap occasionally is cheap; allbrew already configured at worker start.
    const guestLog = `/tmp/allbrew-batch-${workerId}-${slug}.log`;
    const cmd = installCmd({
      url,
      slug,
      mountPoint,
      guestLog,
      token: token || undefined,
    });

    log(`running allbrew idx=${idx} ${name}`);
    const result = await guest(h.runAsProjectUser, session, cmd, `allbrew-${slug}`, {
      timeout: envTimeout("TH_BATCH_INSTALL_TIMEOUT_MS", 720_000),
      stream: true,
    });

    const fetch = await guest(
      h.runAsProjectUser,
      session,
      `set +e; if [ -f ${JSON.stringify(guestLog)} ]; then cat ${JSON.stringify(guestLog)}; else echo MISSING_LOG; fi`,
      `fetch-log-${slug}`,
      { timeout: 120_000 },
    );
    installLog = fetch.stdout || result.stdout || "";
    writeFileSync(join(runDir, "allbrew-initial.log"), installLog);
    writeFileSync(join(BATCH_LOGS, `${batchRunId}.log`), installLog);

    const exitMatch = installLog.match(/EXIT_CODE=(\d+)/);
    exitCode = exitMatch ? Number(exitMatch[1]) : result.exitCode;
    pkg = extractPackageName(installLog, slug);

    const fr = await guest(
      h.runAsProjectUser,
      session,
      fetchFormulaCmd({ pkg, mountPoint, tapPath }),
      `formula-${pkg}`,
      { timeout: 60_000 },
    );
    formulaText = fr.stdout || "";
    if (formulaText && !formulaText.includes("MISSING_FORMULA")) {
      writeFileSync(join(runDir, "formula.rb"), formulaText);
    }

    const serviceObs = extractServiceDecision(installLog, formulaText);
    judgment.codebaseObserved = {
      strategy: null,
      generator: extractGenerator(installLog),
      packageNameDetected: pkg,
      packageNameUsed: pkg,
      serviceDetected: serviceObs.serviceDetected,
      serviceCommand: serviceObs.serviceCommand,
      formulaPath: (formulaText.match(/^FORMULA_PATH=(.+)$/m) || [])[1] || null,
      logSignals: installLog
        .split("\n")
        .filter((l) => /Detected|generator|Wrote|Error/i.test(l))
        .slice(0, 40),
    };
    const svcCmp = compareService(judgment.expected.service, serviceObs);
    judgment.deltas = buildDeltas(judgment);
    if (svcCmp.mismatch) {
      judgment.deltas.push({
        field: "service",
        agent: judgment.expected.service,
        codebase: serviceObs.serviceDetected,
        severity: "error",
        note: svcCmp.note,
      });
    }
    writeFileSync(join(runDir, "agent-judgment.json"), JSON.stringify(judgment, null, 2) + "\n");

    if (exitCode === 0) {
      const v = await guest(
        h.runAsProjectUser,
        session,
        strictVerifyCmd({ pkg, mountPoint }),
        `verify-${pkg}`,
        { timeout: 180_000 },
      );
      writeFileSync(join(runDir, "verify.txt"), v.stdout || "");
      verify = parseVerifyOutput(v.stdout || "", pkg, judgment.expected.service === true);
    }

    if (svcCmp.mismatch && exitCode === 0) {
      failureClass = "service_mismatch";
      status = "failed";
    } else if (exitCode === 0 && verify.ok) {
      failureClass = null;
      status = "success";
    } else {
      failureClass = classifyFailure(installLog, exitCode, verify);
      status = failureClass === "github_rate_limit" ? "blocked" : "failed";
    }

    const un = await guest(
      h.runAsProjectUser,
      session,
      uninstallCmd({ pkg, mountPoint, tapPath }),
      `uninstall-${pkg}`,
      { timeout: 300_000 },
    );
    writeFileSync(join(runDir, "uninstall.log"), (un.stdout || "") + "\n" + (un.stderr || ""));

    if (status !== "success" && fixMode === "docs") {
      if (doLocalRepro && failureClass !== "env_fail" && failureClass !== "github_rate_limit") {
        log("local repro…");
        try {
          localRepro = localReproGenerate({ url, slug });
          if (localRepro.logPath && existsSync(localRepro.logPath)) {
            cpSync(localRepro.logPath, join(runDir, "allbrew-local-repro.log"));
          }
        } catch (e) {
          localRepro = { attempted: true, ok: false, error: String(e?.message || e) };
        }
      }
      fixPackagePath = writeFixPackage(runDir, {
        url,
        slug,
        failureClass,
        logText: installLog,
        verify,
        localRepro,
      });
      appendFixIndex({
        runId,
        batchRunId,
        url,
        slug,
        failureClass,
        fixPackagePath,
        workerId,
        status,
        finishedAt: new Date().toISOString(),
      });
      writeFileSync(
        join(runDir, "outcome.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            status,
            failureClass,
            verification: {
              ok: verify.ok,
              commands: [],
              outputs: [verify.raw ? String(verify.raw).slice(0, 2000) : ""],
            },
            fix: {
              applied: false,
              commit: null,
              releaseTag: null,
              files: [],
              packagePath: "fix-package/",
              mode: "docs",
            },
          },
          null,
          2,
        ) + "\n",
      );
    }

    writeFileSync(
      join(runDir, "summary.md"),
      `# ${name}

- url: ${url}
- runId: ${runId}
- worker: ${workerId}
- package: ${pkg}
- exit: ${exitCode}
- verifyOk: ${verify.ok}
- status: ${status}
- failureClass: ${failureClass}
- durationMs: ${Date.now() - started}
- fix-package: ${fixPackagePath || "(none)"}
- allbrew: ${allbrewVersion}

## Notes
Long-lived worker; single Homebrew session held across URLs.
`,
    );

    const finalizeClass = [
      "generate_fail",
      "brew_fail",
      "service_mismatch",
      "prompt_hang",
      "env_fail",
    ].includes(failureClass)
      ? failureClass
      : failureClass === "github_rate_limit"
        ? "env_fail"
        : failureClass;

    finalizeRunRecordHost({
      runDir,
      status,
      failureClass: finalizeClass,
      packageName: pkg,
      packageKind: verify.kind || "formula",
      verifyOk: Boolean(verify.ok),
      allbrewVersionFinal: String(allbrewVersion).split("\n").pop(),
    });

    try {
      const outcomePath = join(runDir, "outcome.json");
      const outcome = JSON.parse(readFileSync(outcomePath, "utf8"));
      outcome.batch = { workerId, idx, batchRunId, durationMs: Date.now() - started, exitCode };
      if (fixPackagePath) {
        outcome.fix = outcome.fix || {};
        outcome.fix.packagePath = "fix-package/";
        outcome.fix.mode = "docs";
        outcome.fix.applied = false;
      }
      writeFileSync(outcomePath, JSON.stringify(outcome, null, 2) + "\n");
    } catch {
      /* ignore */
    }

    const batchOutcome = {
      runId,
      batchRunId,
      workerId,
      idx,
      name,
      url,
      slug,
      packageName: pkg,
      exitCode,
      verifyOk: Boolean(verify.ok),
      status,
      failureClass,
      durationMs: Date.now() - started,
      fixPackage: fixPackagePath ? "fix-package/" : null,
      finishedAt: new Date().toISOString(),
    };
    appendBatchIndex(batchOutcome);
    writeFileSync(join(BATCH_LOGS, `${batchRunId}.outcome.json`), JSON.stringify(batchOutcome, null, 2));
    console.log(`OUTCOME_JSON=${JSON.stringify(batchOutcome)}`);
    log("done", status, failureClass || "ok");
    return batchOutcome;
  } catch (e) {
    log("error", e);
    const batchOutcome = {
      runId: runId || null,
      batchRunId,
      workerId,
      idx,
      name,
      url,
      slug,
      status: "error",
      failureClass: "env_fail",
      error: String(e?.message || e),
      durationMs: Date.now() - started,
      finishedAt: new Date().toISOString(),
    };
    try {
      appendBatchIndex(batchOutcome);
      if (runDir) {
        writeFileSync(join(runDir, "summary.md"), `# ${name}\n\nWorker error: ${batchOutcome.error}\n`);
        try {
          finalizeRunRecordHost({
            runDir,
            status: "failed",
            failureClass: "env_fail",
            packageName: slug,
            verifyOk: false,
          });
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    console.log(`OUTCOME_JSON=${JSON.stringify(batchOutcome)}`);
    return batchOutcome;
  }
}

async function main() {
  log("starting long-lived worker", { keepPrefix, mountPoint, tapPath });
  const h = await loadHarness();
  log("config", {
    user: h.config.projectUser,
    mount: h.config.homebrewPrefix.mountPoint,
    lock: h.config.homebrewPrefix.lockPath,
  });

  let session = null;
  let allbrewVersion = "";
  try {
    session = await acquireHomebrewPrefixDurable(h);
    log("prefix acquired once", session.mountPoint);
    allbrewVersion = await ensureAllbrew(h, session, mountPoint);
    await ensureTapConfigured(h, session, mountPoint, tapPath);
    log("allbrew ready", allbrewVersion.split("\n").slice(-1)[0]);

    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === "__STOP__") break;
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch (e) {
        console.error(`[worker:${workerId}] bad json line`, e);
        continue;
      }
      if (!entry?.url) {
        console.error(`[worker:${workerId}] entry missing url`);
        continue;
      }
      // If session somehow lost brew, reacquire once.
      try {
        await runOne(h, session, entry, allbrewVersion);
      } catch (e) {
        const msg = String(e?.message || e);
        if (/Homebrew|lock|mount|prefix/i.test(msg)) {
          log("session unhealthy; reacquiring", msg.split("\n")[0]);
          try {
            await releaseHomebrewPrefixDurable(h, session);
          } catch {
            /* ignore */
          }
          session = await acquireHomebrewPrefixDurable(h);
          allbrewVersion = await ensureAllbrew(h, session, mountPoint);
          await ensureTapConfigured(h, session, mountPoint, tapPath);
          await runOne(h, session, entry, allbrewVersion);
        } else {
          throw e;
        }
      }
    }
  } finally {
    log("shutting down worker; releasing prefix");
    if (keepPrefix) {
      // Still release so the next process can acquire cleanly.
    }
    try {
      const rel = await releaseHomebrewPrefixDurable(h, session);
      if (!rel.ok) log("release warnings", rel.errors);
      else log("prefix released + force-unlocked");
    } catch (e) {
      log("release failed", e);
    }
  }
}

await main();
