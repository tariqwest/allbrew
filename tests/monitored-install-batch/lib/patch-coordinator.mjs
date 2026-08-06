#!/usr/bin/env bun
/**
 * Option A durable fix-package coordinator (host-side).
 * Applies patches only in disposable git worktrees; never mutates the main checkout.
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  cpSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve, dirname, relative, isAbsolute, normalize } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  REPO_ROOT,
  BATCH_DIR,
  RUNS_ROOT,
  WORKTREES_ROOT,
  AGENT_QUEUE_PATH,
  FIX_INDEX,
  appendFixIndex,
  sha256Hex,
  writeFixPackage,
} from "./batch-helpers.mjs";

const ALLOWED_TARGET_PREFIXES = ["lib/", "bin/", "tests/", "scripts/", ".agents/"];

export function sha256File(absPath) {
  return sha256Hex(readFileSync(absPath));
}

export function isSafeRelPath(p) {
  if (p == null || p === "") return false;
  const s = String(p);
  if (isAbsolute(s)) return false;
  if (s.includes("\0")) return false;
  const norm = normalize(s).replace(/\\/g, "/");
  if (norm.startsWith("..") || norm.includes("/../") || norm === "..") return false;
  if (norm.startsWith("/")) return false;
  return true;
}

export function isAllowedTarget(target) {
  if (!isSafeRelPath(target)) return false;
  const norm = normalize(String(target)).replace(/\\/g, "/").replace(/^\.\//, "");
  return ALLOWED_TARGET_PREFIXES.some((pref) => norm === pref.slice(0, -1) || norm.startsWith(pref));
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Discover a fix-package dir under a run directory (runDir/fix-package or runDir itself).
 */
export function discoverFixPackage(runDir) {
  if (!runDir || !existsSync(runDir)) return null;
  const direct = join(runDir, "fix-package");
  if (existsSync(direct) && (existsSync(join(direct, "FIX.md")) || existsSync(join(direct, "manifest.json")))) {
    return direct;
  }
  if (existsSync(join(runDir, "FIX.md")) || existsSync(join(runDir, "manifest.json"))) {
    return runDir;
  }
  return null;
}

/**
 * Scan runs roots for fix-package directories.
 */
export function discoverFixPackages(runsRoots = [RUNS_ROOT, join(BATCH_DIR, "runs")]) {
  const found = [];
  const roots = Array.isArray(runsRoots) ? runsRoots : [runsRoots];
  for (const root of roots) {
    if (!root || !existsSync(root)) continue;
    let entries = [];
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const runDir = join(root, ent.name);
      const fixDir = discoverFixPackage(runDir);
      if (fixDir) found.push({ runDir, fixDir, sourceRunId: ent.name });
    }
  }
  return found;
}

function loadOrSynthesizeManifest(fixDir) {
  const manifestPath = join(fixDir, "manifest.json");
  const existing = readJsonIfExists(manifestPath);
  if (existing && existing.schemaVersion) return existing;

  // Docs-only / agent narrative packages without machine manifest
  const validation = readJsonIfExists(join(fixDir, "validation.json")) || {};
  const patchesDir = join(fixDir, "patches");
  const filesDir = join(fixDir, "files");
  const patches = [];
  const files = [];

  if (existsSync(patchesDir)) {
    for (const name of walkFiles(patchesDir)) {
      const abs = join(patchesDir, name);
      const rel = `patches/${name}`;
      patches.push({ path: rel, sha256: sha256File(abs) });
    }
  }
  if (existsSync(filesDir)) {
    for (const name of walkFiles(filesDir)) {
      const abs = join(filesDir, name);
      const rel = `files/${name}`;
      // Heuristic target: strip files/ prefix as repo-relative path
      files.push({ path: rel, target: name, sha256: sha256File(abs) });
    }
  }

  const mode = patches.length || files.length ? "patch" : (validation.mode || "docs");
  return {
    schemaVersion: 1,
    slug: validation.slug || null,
    url: validation.url || null,
    failureClass: validation.failureClass || null,
    sourceRunId: validation.sourceRunId || null,
    baselineCommit: null,
    mode,
    patches,
    files,
    validationHints: validation.validationHints || null,
    synthesized: true,
  };
}

function walkFiles(dir, base = "") {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...walkFiles(join(dir, ent.name), rel));
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}

/**
 * Validate path safety, checksums, and manifest↔filesystem consistency.
 */
export function validateFixPackage(fixDir) {
  const errors = [];
  if (!fixDir || !existsSync(fixDir)) {
    return { ok: false, mode: null, errors: ["fixDir missing"], manifest: null };
  }

  const manifest = loadOrSynthesizeManifest(fixDir);
  const mode = manifest.mode || "docs";

  const checkEntry = (entry, kind) => {
    if (!entry || !entry.path) {
      errors.push(`${kind}: missing path`);
      return;
    }
    if (!isSafeRelPath(entry.path)) {
      errors.push(`${kind}: unsafe path ${entry.path}`);
      return;
    }
    // path must stay under fixDir (patches/ or files/)
    const norm = normalize(entry.path).replace(/\\/g, "/");
    if (!norm.startsWith("patches/") && !norm.startsWith("files/")) {
      errors.push(`${kind}: path must be under patches/ or files/: ${entry.path}`);
    }
    const abs = join(fixDir, norm);
    if (!existsSync(abs)) {
      errors.push(`${kind}: missing file ${entry.path}`);
      return;
    }
    if (entry.sha256) {
      const actual = sha256File(abs);
      if (actual !== String(entry.sha256).toLowerCase()) {
        errors.push(`${kind}: checksum mismatch for ${entry.path}`);
      }
    } else if (mode === "patch") {
      errors.push(`${kind}: sha256 required in patch mode for ${entry.path}`);
    }
    if (kind === "file") {
      if (!entry.target) errors.push(`file: missing target for ${entry.path}`);
      else if (!isAllowedTarget(entry.target)) {
        errors.push(`file: disallowed or unsafe target ${entry.target}`);
      }
    }
  };

  for (const p of manifest.patches || []) checkEntry(p, "patch");
  for (const f of manifest.files || []) checkEntry(f, "file");

  // Manifest vs filesystem: unexpected files under patches/files when mode=patch and manifest lists entries
  // (allow extra empty dirs; flag unlisted files only if manifest has explicit lists and mode=patch)
  if (mode === "patch" && ((manifest.patches || []).length || (manifest.files || []).length)) {
    const listed = new Set([
      ...(manifest.patches || []).map((p) => normalize(p.path).replace(/\\/g, "/")),
      ...(manifest.files || []).map((f) => normalize(f.path).replace(/\\/g, "/")),
    ]);
    for (const sub of ["patches", "files"]) {
      const subDir = join(fixDir, sub);
      for (const name of walkFiles(subDir)) {
        const rel = `${sub}/${name}`;
        if (!listed.has(rel) && !listed.has(normalize(rel).replace(/\\/g, "/"))) {
          errors.push(`unlisted ${sub} file: ${rel}`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    mode,
    errors,
    manifest,
  };
}

function git(args, opts = {}) {
  const r = spawnSync("git", args, {
    cwd: opts.cwd || REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env || {}) },
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
    ok: (r.status ?? 1) === 0,
  };
}

function shortId() {
  return randomBytes(4).toString("hex");
}

/**
 * Apply fix package in a disposable worktree off baselineCommit (default HEAD).
 * Never checks out or modifies the primary worktree.
 */
export function applyInWorktree({
  fixDir,
  repoRoot = REPO_ROOT,
  baselineCommit = "HEAD",
  worktreeRoot = WORKTREES_ROOT,
  slug = "fix",
} = {}) {
  const validation = validateFixPackage(fixDir);
  if (!validation.ok) {
    return {
      ok: false,
      error: "validate_failed",
      errors: validation.errors,
      worktreePath: null,
      baselineBefore: null,
    };
  }
  if (validation.mode === "docs") {
    return {
      ok: true,
      skipped: true,
      reason: "docs",
      worktreePath: null,
      baselineBefore: null,
      mode: "docs",
    };
  }

  const base = git(["rev-parse", baselineCommit], { cwd: repoRoot });
  if (!base.ok) {
    return { ok: false, error: "bad_baseline", errors: [base.stderr || base.stdout], worktreePath: null };
  }
  const baselineBefore = base.stdout;

  mkdirSync(worktreeRoot, { recursive: true });
  const worktreePath = join(worktreeRoot, `${slug}-${baselineBefore.slice(0, 8)}-${shortId()}`);
  if (existsSync(worktreePath)) {
    return { ok: false, error: "worktree_exists", worktreePath, baselineBefore };
  }

  // Detached worktree at baseline — no branch yet
  const add = git(["worktree", "add", "--detach", worktreePath, baselineBefore], { cwd: repoRoot });
  if (!add.ok) {
    return {
      ok: false,
      error: "worktree_add_failed",
      errors: [add.stderr || add.stdout],
      worktreePath: null,
      baselineBefore,
    };
  }

  const manifest = validation.manifest;
  const applyLogs = [];

  try {
    for (const p of manifest.patches || []) {
      const abs = join(fixDir, p.path);
      const r = git(["apply", "--index", abs], { cwd: worktreePath });
      applyLogs.push({ path: p.path, ok: r.ok, stderr: r.stderr, stdout: r.stdout });
      if (!r.ok) {
        // fallback without --index
        const r2 = git(["apply", abs], { cwd: worktreePath });
        applyLogs.push({ path: p.path, ok: r2.ok, stderr: r2.stderr, stdout: r2.stdout, fallback: true });
        if (!r2.ok) {
          return {
            ok: false,
            error: "apply_failed",
            errors: [r2.stderr || r.stderr || `patch failed: ${p.path}`],
            worktreePath,
            baselineBefore,
            applyLogs,
          };
        }
      }
    }

    for (const f of manifest.files || []) {
      const src = join(fixDir, f.path);
      const dest = join(worktreePath, f.target);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest);
      git(["add", "--", f.target], { cwd: worktreePath });
      applyLogs.push({ path: f.path, target: f.target, ok: true, kind: "file" });
    }

    // Stage any unstaged apply results
    git(["add", "-A"], { cwd: worktreePath });
    const status = git(["status", "--porcelain"], { cwd: worktreePath });
    if (!status.stdout) {
      return {
        ok: false,
        error: "no_changes",
        errors: ["apply produced no changes"],
        worktreePath,
        baselineBefore,
        applyLogs,
      };
    }

    const commit = git(
      ["commit", "-m", `fix-package: ${slug} (${manifest.failureClass || "fix"})`],
      {
        cwd: worktreePath,
        env: {
          GIT_AUTHOR_NAME: "allbrew-fix-bot",
          GIT_AUTHOR_EMAIL: "fix-bot@local",
          GIT_COMMITTER_NAME: "allbrew-fix-bot",
          GIT_COMMITTER_EMAIL: "fix-bot@local",
        },
      },
    );
    if (!commit.ok) {
      return {
        ok: false,
        error: "commit_failed",
        errors: [commit.stderr || commit.stdout],
        worktreePath,
        baselineBefore,
        applyLogs,
      };
    }

    const head = git(["rev-parse", "HEAD"], { cwd: worktreePath });
    return {
      ok: true,
      skipped: false,
      worktreePath,
      baselineBefore,
      headSha: head.stdout,
      applyLogs,
      mode: "patch",
      manifest,
    };
  } catch (err) {
    return {
      ok: false,
      error: "apply_exception",
      errors: [String(err && err.message ? err.message : err)],
      worktreePath,
      baselineBefore,
      applyLogs,
    };
  }
}

/**
 * Run focused validation commands inside the worktree.
 */
export function validateBeforePromote({
  worktreePath,
  hints = null,
  commands = null,
} = {}) {
  if (!worktreePath || !existsSync(worktreePath)) {
    return { ok: false, logPath: null, log: "worktree missing", commands: [] };
  }

  const cmds =
    commands ||
    (hints && Array.isArray(hints.commands) && hints.commands.length
      ? hints.commands
      : ["bun test tests/unit/ --timeout 60000"]);

  const logs = [];
  let allOk = true;
  for (const cmd of cmds) {
    const r = spawnSync("bash", ["-lc", cmd], {
      cwd: worktreePath,
      encoding: "utf8",
      env: process.env,
    });
    const entry = {
      cmd,
      status: r.status,
      stdout: (r.stdout || "").slice(-8000),
      stderr: (r.stderr || "").slice(-8000),
      ok: (r.status ?? 1) === 0,
    };
    logs.push(entry);
    if (!entry.ok) allOk = false;
  }

  const logPath = join(worktreePath, ".fix-validation.log");
  const logText = logs
    .map(
      (l) =>
        `$ ${l.cmd}\nexit=${l.status}\n${l.stdout}\n${l.stderr}\n`,
    )
    .join("\n----\n");
  try {
    writeFileSync(logPath, logText);
  } catch {
    /* ignore */
  }

  return { ok: allOk, logPath, log: logText, commands: cmds, results: logs };
}

/**
 * Create a local branch fix/<slug>-<ts> from the worktree HEAD.
 * Does not merge into the user's current branch or reset main.
 */
export function promoteBaseline({
  worktreePath,
  branchName = null,
  slug = "fix",
  repoRoot = REPO_ROOT,
} = {}) {
  if (!worktreePath || !existsSync(worktreePath)) {
    return { ok: false, error: "worktree_missing", branchName: null, commit: null };
  }
  const head = git(["rev-parse", "HEAD"], { cwd: worktreePath });
  if (!head.ok) {
    return { ok: false, error: "rev_parse_failed", branchName: null, commit: null };
  }
  const commit = head.stdout;
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const branch = branchName || `fix/${slug}-${ts}`;

  // Create branch at commit from repo root without checking it out
  const existing = git(["rev-parse", "--verify", branch], { cwd: repoRoot });
  if (existing.ok) {
    return { ok: false, error: "branch_exists", branchName: branch, commit };
  }
  const created = git(["branch", branch, commit], { cwd: repoRoot });
  if (!created.ok) {
    return {
      ok: false,
      error: "branch_failed",
      errors: [created.stderr || created.stdout],
      branchName: branch,
      commit,
    };
  }
  return { ok: true, branchName: branch, commit, baselineAfter: commit };
}

/**
 * Remove a disposable worktree (best-effort).
 */
export function removeWorktree(worktreePath, repoRoot = REPO_ROOT) {
  if (!worktreePath) return { ok: true };
  const r = git(["worktree", "remove", "--force", worktreePath], { cwd: repoRoot });
  if (!r.ok && existsSync(worktreePath)) {
    try {
      rmSync(worktreePath, { recursive: true, force: true });
      git(["worktree", "prune"], { cwd: repoRoot });
      return { ok: true, forced: true };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }
  git(["worktree", "prune"], { cwd: repoRoot });
  return { ok: r.ok, stderr: r.stderr };
}

/**
 * Append a structured fix-index transition.
 */
export function recordFixTransition(entry) {
  const row = {
    ts: new Date().toISOString(),
    ...entry,
  };
  appendFixIndex(row);
  return row;
}

/**
 * Enqueue a linked retry without flipping the original run to success.
 * queuePath: agent-queue.json (array of items)
 */
export function enqueueLinkedRetry({
  queuePath = AGENT_QUEUE_PATH,
  sourceRunId,
  url,
  slug,
  fixEntry = {},
  agentName = null,
} = {}) {
  if (!url && !slug) {
    return { ok: false, error: "url_or_slug_required" };
  }

  let items = [];
  if (existsSync(queuePath)) {
    try {
      const raw = JSON.parse(readFileSync(queuePath, "utf8"));
      items = Array.isArray(raw) ? raw : raw.items || [];
    } catch {
      items = [];
    }
  }

  const linkedFixId =
    fixEntry.fixId ||
    fixEntry.id ||
    `${sourceRunId || slug || "fix"}-${Date.now()}`;

  // Prefer re-activating an existing queue row for same url/slug
  let item = items.find(
    (i) =>
      (url && i.url === url) ||
      (slug && (i.slug === slug || i.agentName === slug)),
  );

  if (item) {
    item.status = "retry";
    item.linkedFixId = linkedFixId;
    item.sourceRunId = sourceRunId || item.sourceRunId || null;
    item.retryEnqueuedAt = new Date().toISOString();
    item.fixPackagePath = fixEntry.fixPackagePath || item.fixPackagePath || null;
  } else {
    const idx =
      items.reduce((m, i) => Math.max(m, Number(i.idx) || 0), 0) + 1;
    item = {
      idx,
      url: url || null,
      slug: slug || null,
      agentName: agentName || `retry-${slug || idx}`,
      status: "retry",
      linkedFixId,
      sourceRunId: sourceRunId || null,
      retryEnqueuedAt: new Date().toISOString(),
      fixPackagePath: fixEntry.fixPackagePath || null,
    };
    items.push(item);
  }

  mkdirSync(dirname(queuePath), { recursive: true });
  // Preserve array shape used by run-agent-batch
  writeFileSync(queuePath, JSON.stringify(items, null, 2) + "\n");

  return {
    ok: true,
    linkedFixId,
    retryQueueId: item.idx,
    item,
  };
}

/**
 * Full reconcile for one fix package / run dir.
 */
export function reconcileOne(runDirOrFixDir, opts = {}) {
  const {
    repoRoot = REPO_ROOT,
    baselineCommit = "HEAD",
    dryRun = false,
    cleanup = true,
    skipValidation = false,
    queuePath = AGENT_QUEUE_PATH,
    validationCommands = null,
  } = opts;

  const fixDir =
    discoverFixPackage(runDirOrFixDir) ||
    (existsSync(runDirOrFixDir) &&
    (existsSync(join(runDirOrFixDir, "manifest.json")) ||
      existsSync(join(runDirOrFixDir, "FIX.md")))
      ? runDirOrFixDir
      : null);

  if (!fixDir) {
    return { ok: false, event: "missing", errors: ["no fix-package found"] };
  }

  const sourceRunId =
    opts.sourceRunId ||
    dirname(fixDir).split(/[/\\]/).filter(Boolean).pop();

  const discovered = recordFixTransition({
    event: "discovered",
    sourceRunId,
    fixPackagePath: fixDir,
  });

  const validation = validateFixPackage(fixDir);
  if (!validation.ok) {
    recordFixTransition({
      event: "validate_failed",
      sourceRunId,
      fixPackagePath: fixDir,
      errors: validation.errors,
    });
    return {
      ok: false,
      event: "validate_failed",
      errors: validation.errors,
      fixDir,
      sourceRunId,
    };
  }

  recordFixTransition({
    event: "validated",
    sourceRunId,
    fixPackagePath: fixDir,
    mode: validation.mode,
  });

  if (validation.mode === "docs") {
    recordFixTransition({
      event: "skipped_docs",
      sourceRunId,
      fixPackagePath: fixDir,
      mode: "docs",
    });
    return {
      ok: true,
      event: "skipped_docs",
      fixDir,
      sourceRunId,
      mode: "docs",
    };
  }

  if (dryRun) {
    return {
      ok: true,
      event: "dry_run",
      fixDir,
      sourceRunId,
      mode: validation.mode,
      manifest: validation.manifest,
    };
  }

  const slug =
    validation.manifest.slug ||
    sourceRunId ||
    "fix";

  const applied = applyInWorktree({
    fixDir,
    repoRoot,
    baselineCommit: validation.manifest.baselineCommit || baselineCommit,
    worktreeRoot: opts.worktreeRoot || WORKTREES_ROOT,
    slug,
  });

  if (applied.skipped) {
    recordFixTransition({
      event: "skipped_docs",
      sourceRunId,
      fixPackagePath: fixDir,
    });
    return { ok: true, event: "skipped_docs", fixDir, sourceRunId };
  }

  if (!applied.ok) {
    recordFixTransition({
      event: "apply_failed",
      sourceRunId,
      fixPackagePath: fixDir,
      worktreePath: applied.worktreePath,
      baselineBefore: applied.baselineBefore,
      errors: applied.errors || [applied.error],
    });
    return {
      ok: false,
      event: "apply_failed",
      ...applied,
      fixDir,
      sourceRunId,
    };
  }

  recordFixTransition({
    event: "applied",
    sourceRunId,
    fixPackagePath: fixDir,
    worktreePath: applied.worktreePath,
    baselineBefore: applied.baselineBefore,
    headSha: applied.headSha,
  });

  if (!skipValidation) {
    const v = validateBeforePromote({
      worktreePath: applied.worktreePath,
      hints: validation.manifest.validationHints,
      commands: validationCommands,
    });
    if (!v.ok) {
      recordFixTransition({
        event: "validation_failed",
        sourceRunId,
        fixPackagePath: fixDir,
        worktreePath: applied.worktreePath,
        logPath: v.logPath,
      });
      if (!cleanup) {
        /* keep worktree */
      } else {
        // leave worktree for inspection on validation failure
      }
      return {
        ok: false,
        event: "validation_failed",
        fixDir,
        sourceRunId,
        worktreePath: applied.worktreePath,
        validation: v,
      };
    }
  }

  const promoted = promoteBaseline({
    worktreePath: applied.worktreePath,
    slug,
    repoRoot,
  });

  if (!promoted.ok) {
    recordFixTransition({
      event: "promote_failed",
      sourceRunId,
      fixPackagePath: fixDir,
      worktreePath: applied.worktreePath,
      errors: promoted.errors || [promoted.error],
    });
    return {
      ok: false,
      event: "promote_failed",
      ...promoted,
      fixDir,
      sourceRunId,
      worktreePath: applied.worktreePath,
    };
  }

  recordFixTransition({
    event: "promoted",
    sourceRunId,
    fixPackagePath: fixDir,
    worktreePath: applied.worktreePath,
    baselineBefore: applied.baselineBefore,
    baselineAfter: promoted.baselineAfter,
    branchName: promoted.branchName,
    commit: promoted.commit,
  });

  const retry = enqueueLinkedRetry({
    queuePath,
    sourceRunId,
    url: validation.manifest.url,
    slug: validation.manifest.slug || slug,
    fixEntry: {
      fixId: `${sourceRunId}-${promoted.commit.slice(0, 8)}`,
      fixPackagePath: fixDir,
      branchName: promoted.branchName,
      commit: promoted.commit,
    },
  });

  recordFixTransition({
    event: "retry_enqueued",
    sourceRunId,
    fixPackagePath: fixDir,
    linkedFixId: retry.linkedFixId,
    retryQueueId: retry.retryQueueId,
    branchName: promoted.branchName,
    baselineAfter: promoted.baselineAfter,
  });

  if (cleanup) {
    removeWorktree(applied.worktreePath, repoRoot);
  }

  return {
    ok: true,
    event: "promoted",
    fixDir,
    sourceRunId,
    branchName: promoted.branchName,
    commit: promoted.commit,
    baselineBefore: applied.baselineBefore,
    baselineAfter: promoted.baselineAfter,
    retry,
    discovered,
  };
}

/**
 * Reconcile pending fix packages under runs roots (serial).
 */
export function reconcilePending(opts = {}) {
  const {
    runsRoots = [RUNS_ROOT, join(BATCH_DIR, "runs")],
    limit = Infinity,
  } = opts;
  const found = discoverFixPackages(runsRoots);
  const results = [];
  let n = 0;
  for (const item of found) {
    if (n >= limit) break;
    const r = reconcileOne(item.runDir, {
      ...opts,
      sourceRunId: item.sourceRunId,
    });
    results.push({ ...item, result: r });
    n += 1;
  }
  return { count: results.length, results };
}

export {
  writeFixPackage,
  FIX_INDEX,
  WORKTREES_ROOT,
  AGENT_QUEUE_PATH,
  REPO_ROOT,
  RUNS_ROOT,
};
