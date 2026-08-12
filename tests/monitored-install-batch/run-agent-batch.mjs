#!/usr/bin/env bun
/**
 * Agent-driven monitored-install batch dispatcher.
 *
 * Unlike run-orchestrator.mjs (deterministic heuristics), this emits a queue of
 * per-URL work items for the parent Oz agent to spawn via run_agents, each
 * following monitored-install with real judgment + fix intelligence.
 *
 * Usage (from parent agent or human):
 *   bun tests/monitored-install-batch/run-agent-batch.mjs --print-wave
 *   bun tests/monitored-install-batch/run-agent-batch.mjs --mark-launched <ids...>
 *   bun tests/monitored-install-batch/run-agent-batch.mjs --status
 *
 * Env:
 *   TH_BATCH_CONCURRENCY=6
 *   TH_BATCH_URLS=...
 *   TH_BATCH_START=0
 *   TH_BATCH_LIMIT=
 *   TH_BATCH_ONLY_FAILED=1   # default: skip prior successes
 *   TH_BATCH_FIX_MODE=docs   # option A
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { fileURLToPath } from "node:url";

const BATCH_DIR = resolve(import.meta.dir || fileURLToPath(new URL(".", import.meta.url)));
const REPO_ROOT = resolve(BATCH_DIR, "../..");
const STATE_DIR = join(BATCH_DIR, "state");
const QUEUE_PATH = join(STATE_DIR, "agent-queue.json");
const WAVE_PATH = join(STATE_DIR, "agent-wave.json");
const AGENT_INDEX = join(STATE_DIR, "agent-index.jsonl");
const SKILL_PATH = join(
  REPO_ROOT,
  ".agents/skills/monitored-install-batch-child/SKILL.md",
);

const STATUS_ALIASES = {
  queued: "pending",
  retry: "pending",
  launching: "pending",
  success: "succeeded",
  "success-not-fixed": "succeeded",
  fixed_success: "succeeded",
  "failed-fix-applied": "succeeded",
  "failed-agent-runtime": "failed_system",
  "failed-timeout": "failed_system",
  infrastructure_failed: "failed_system",
  done: "failed_system",
};

function normalizeStatus(status) {
  if (!status) return status;
  const s = String(status).trim();
  return STATUS_ALIASES[s] || s;
}

function isSucceeded(status) {
  const n = normalizeStatus(status);
  return n === "succeeded";
}

function isPending(status) {
  const n = normalizeStatus(status);
  return n === "pending";
}

function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function slugify(name, url) {
  return (
    (name || url || "pkg")
      .toLowerCase()
      .replace(/https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "pkg"
  );
}

function loadPriorSuccessUrls() {
  const idx = join(BATCH_DIR, "index.jsonl");
  const ok = new Set();
  if (!existsSync(idx)) return ok;
  for (const line of readFileSync(idx, "utf8").splitlines?.() ||
    readFileSync(idx, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (isSucceeded(r.status) && r.url) ok.add(r.url);
    } catch {
      /* ignore */
    }
  }
  // also agent-index
  if (existsSync(AGENT_INDEX)) {
    for (const line of readFileSync(AGENT_INDEX, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (isSucceeded(r.status) && r.url) ok.add(r.url);
      } catch {
        /* ignore */
      }
    }
  }
  return ok;
}

function buildQueue() {
  const urlsPath = resolve(
    process.env.TH_BATCH_URLS || join(BATCH_DIR, "urls-shuffled.json"),
  );
  const urls = JSON.parse(readFileSync(urlsPath, "utf8"));
  const start = envInt("TH_BATCH_START", 0);
  const limit = process.env.TH_BATCH_LIMIT
    ? envInt("TH_BATCH_LIMIT", urls.length)
    : urls.length;
  const onlyFailed = envBool("TH_BATCH_ONLY_FAILED", true);
  const success = onlyFailed ? loadPriorSuccessUrls() : new Set();

  const items = [];
  for (let i = start; i < Math.min(urls.length, start + limit); i++) {
    const u = urls[i];
    if (onlyFailed && success.has(u.url)) continue;
    const slug = slugify(u.name, u.url);
    items.push({
      idx: i,
      name: u.name,
      url: u.url,
      source: u.source || "urls-shuffled",
      slug,
      agentName: `url-${String(i).padStart(4, "0")}-${slug}`.slice(0, 48),
      status: "queued",
    });
  }
  return items;
}

function saveQueue(items) {
  writeFileSync(
    QUEUE_PATH,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        total: items.length,
        items,
      },
      null,
      2,
    ) + "\n",
  );
}

function loadQueue() {
  if (!existsSync(QUEUE_PATH)) {
    const items = buildQueue();
    saveQueue(items);
    return items;
  }
  const data = JSON.parse(readFileSync(QUEUE_PATH, "utf8"));
  let migrated = false;
  for (const i of data.items) {
    const canonical = normalizeStatus(i.status);
    if (canonical !== i.status) {
      if (!i.legacyStatus) i.legacyStatus = i.status;
      i.status = canonical;
      migrated = true;
    }
  }
  if (migrated) {
    writeFileSync(QUEUE_PATH, JSON.stringify(data, null, 2) + "\n");
  }
  return data.items;
}

function getSkillPhases() {
  try {
    const raw = readFileSync(SKILL_PATH, "utf8");
    const phases = [...raw.matchAll(/^## Phase (\d+) — (.+)$/gm)].map((m) => `Phase ${m[1]} — ${m[2].trim()}`);
    if (phases.length >= 6) return phases.join(" → ");
  } catch {}
  return "Phases 0→7 as written in SKILL.md";
}

function basePrompt() {
  const phasesLabel = getSkillPhases();
  return `You are a child agent running ONE monitored allbrew install (batch-child, VM-isolated) in the allbrew repo.

## Repo
Working directory (absolute): ${REPO_ROOT}
cd there first. All work is VM-isolated; host Homebrew must stay clean.

## Skill (required) — THIS IS THE ONLY SKILL FOR BATCH CHILDREN
Read and FOLLOW:
${SKILL_PATH}
— VM-isolated variant of monitored-install. Host single-URL .agents/skills/monitored-install/SKILL.md is NOT for batch children; do not mix them.
Also read references/run-records.md for RUN_DIR layout. Do NOT follow references that tell you to run host allbrew/brew install.
Skill phases (derived at runtime from SKILL.md): ${phasesLabel} — execute the skill exactly as written; do NOT rely on any cached phase summary below.

## HARD ISOLATION RULES (do not violate — batch-child guardrails)
1. **Host Homebrew is forbidden as success path.** Never \`brew install\`, \`brew uninstall\`, \`brew services\`, or \`allbrew <url>\` on the host. Host \`brew\` is only for Lume/vm-install-one orchestration — not for installs. Success = VM-only \`VERIFY_OK=true\` from \`vm-install-one.mjs\`.
2. **Always VM for every allbrew/brew install/verify.** The ONLY brew-capable path is:
   \`\`\`bash
   bun tests/monitored-install-batch/vm-install-one.mjs \\
     --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install.log" --run-dir "$RUN_DIR"
   \`\`\`
   The helper picks the least-busy endpoint from \`vm-pool.json\` (homeserver + local-1 + local-2) via \`acquirePoolSlot()\`. Do NOT add \`--endpoint\` — you would serialize onto one VM while the other two sit idle. For patch re-verify add \`--allbrew-src "$WT"\` (worktree path) — helper pushes agent/* branch and VM runs \`bun --cwd <vmSrc> run bin/allbrew.ts\` inside VM.
3. **Host validation is offline only.** \`bun run check\` / \`bun test tests/unit/<area>\` on host is allowed. Never \`bun run bin/allbrew.ts --tap $(mktemp -d)\` on host — that still writes to host Caskroom and is forbidden.
4. **Fixes live in disposable worktree, never host main.** Provision immediately:
   \`\`\`bash
   WT="tests/monitored-install-batch/worktrees/<slug>-$(date -u +%Y%m%dT%H%M%SZ)"
   git worktree add "$WT" -b "agent/<slug>-<ts>" HEAD
   \`\`\`
   All lib/ edits happen inside \`$WT\`. Export patches to \`$RUN_DIR/fix-package/patches/*.patch\` + \`FIX.md\` + \`validation.json\` (and mirror to \`tests/monitored-install-batch/fix-packages/<slug>/\`). Never \`git add/commit/push\` to host main. Never \`bun run release\` / \`git push --force\`.
5. **Real Phase 1 judgment via render helper (Phase label from SKILL.md at runtime).** Before VM, run:
   \`bun .agents/skills/monitored-install/scripts/render-judgment.mjs --url "<url>" --run-dir "$RUN_DIR" --slug "<slug>" --force\`
   (Bun.WebView JS-render when available) plus primary docs. Service expectation: true only for long-lived supervised daemon with brew services + blocking serve on port.
6. **Option A patch artifacts on failure.** FIX.md + manifest.json + patches/*.patch + validation.json. Parent reconciles via \`bun run batch:reconcile-fixes\`; no auto-release.
7. **Completion message must include:** URL, status, RUN_DIR, vmHelperUsed=true, endpointId, poolWaitMs, vm-meta.json path, vmLog tail, fix-package/patch artifact paths (or null), residualRisk, hostClean=true.

## Out of scope
Other URLs; host brew installs; host main commits; auto-release.
`;
}

function perUrlPrompt(item) {
  return `## Your single URL
- idx: ${item.idx}
- name: ${item.name}
- slug: ${item.slug}
- url: ${item.url}
- source column: ${item.source}

## Steps (batch-child: .agents/skills/monitored-install-batch-child/SKILL.md — VM-only, patch artifacts, host-clean)
1. cd ${REPO_ROOT}
2. Read .agents/skills/monitored-install-batch-child/SKILL.md and execute its Phases as listed in that file at runtime (derived at runtime) for THIS url only — do NOT rely on the cached summary in this prompt. Do NOT use .agents/skills/monitored-install/SKILL.md (host loop).
3. Init run record: \`bun .agents/skills/monitored-install/scripts/init-run-record.mjs --url "${item.url}" --slug "${item.slug}"\` (capture RUN_DIR). Then provision disposable worktree: \`WT="tests/monitored-install-batch/worktrees/${item.slug}-$(date -u +%Y%m%dT%H%M%SZ)"; git worktree add "$WT" -b "agent/${item.slug}-<ts>" HEAD\` — all lib edits inside $WT, never host main.
4. Phase 1 (Independent judgment) BEFORE VM — see SKILL.md Phase 1: \`bun .agents/skills/monitored-install/scripts/render-judgment.mjs --url "${item.url}" --run-dir "$RUN_DIR" --slug "${item.slug}" --force\` + primary docs. Fill agent-judgment.json expected/service; keep js-rendered bash-script pre-fill if present.
5. Phase 2 (VM-isolated try) — the ONLY brew path: \`bun tests/monitored-install-batch/vm-install-one.mjs --url "${item.url}" --name "${item.slug}" --log "$RUN_DIR/vm-install.log" --run-dir "$RUN_DIR"\` (VM-only VERIFY_OK). No host \`allbrew --tap $(mktemp -d)\` or host brew. Pre-filter formulae.brew.sh/formula/* → skipped.
6. Phase 3 (Service vs VM) deltas + Phase 5 (Fix in worktree) in $WT if failed/mismatch: smallest durable fix at earliest layer, \`bun run check\` + \`bun test\` offline, export \`$RUN_DIR/fix-package/patches/*.patch\` + FIX.md + validation.json (mirror to tests/monitored-install-batch/fix-packages/${item.slug}/). Re-verify patch ONLY via VM: same vm-install-one.mjs with \`--allbrew-src "$WT"\`.
7. Finalize: ensure $RUN_DIR/agent-judgment.json + vm-install.log + vm-meta.json + fix-package (if any) + summary.md; hostClean=true. Append tests/monitored-install-batch/state/agent-index.jsonl. Never commit/push main or release.
8. Reply structured completion: URL, STATUS (success|failed|blocked|skipped|failed_system), failureClass, RUN_DIR, vmHelperUsed=true, endpointId, poolWaitMs, vmMeta, vmLogTail, fixPackage/patchArtifact (or null), residualRisk, hostClean.

Start now — only this URL.`;
}

function printWave() {
  const concurrency = Math.max(1, envInt("TH_BATCH_CONCURRENCY", 6));
  const items = loadQueue();
  const pending = items.filter((i) => isPending(i.status));
  const wave = pending.slice(0, concurrency).map((i) => ({
    ...i,
    status: "pending",
    waveStatus: "launching",
  }));

  const profile = process.env.TH_AGENT_PROFILE || "subagent_general";
  const payload = {
    createdAt: new Date().toISOString(),
    profile,
    concurrency,
    remaining: pending.length,
    waveSize: wave.length,
    basePrompt: basePrompt(),
    skillPath: SKILL_PATH,
    repoRoot: REPO_ROOT,
    agents: wave.map((i) => ({
      name: i.agentName,
      title: `monitored-install ${i.slug}`,
      idx: i.idx,
      url: i.url,
      slug: i.slug,
      prompt: perUrlPrompt(i),
    })),
  };

  writeFileSync(WAVE_PATH, JSON.stringify(payload, null, 2) + "\n");

  // human-readable for parent agent
  console.log(JSON.stringify({ ok: true, wave: payload }, null, 2));
  return payload;
}

function markLaunched(names) {
  const items = loadQueue();
  const set = new Set(names);
  for (const i of items) {
    if (set.has(i.agentName) || set.has(String(i.idx))) {
      i.status = "running";
      i.launchedAt = new Date().toISOString();
    }
  }
  saveQueue(items);
  console.log(JSON.stringify({ ok: true, marked: [...set] }));
}

function markDone(name, status, extra = {}) {
  const canonical = normalizeStatus(status);
  const legacyStatus = String(status);
  const items = loadQueue();
  for (const i of items) {
    if (i.agentName === name || String(i.idx) === String(name)) {
      i.status = canonical;
      if (legacyStatus !== canonical) i.legacyStatus = legacyStatus;
      i.finishedAt = new Date().toISOString();
      Object.assign(i, extra);
    }
  }
  saveQueue(items);
  appendFileSync(
    AGENT_INDEX,
    JSON.stringify({
      agentName: name,
      status: canonical,
      legacyStatus: legacyStatus !== canonical ? legacyStatus : undefined,
      finishedAt: new Date().toISOString(),
      ...extra,
    }) + "\n",
  );
  console.log(JSON.stringify({ ok: true, name, status: canonical, legacyStatus: legacyStatus !== canonical ? legacyStatus : undefined }));
}

function status() {
  const items = existsSync(QUEUE_PATH) ? loadQueue() : buildQueue();
  if (!existsSync(QUEUE_PATH)) saveQueue(items);
  const c = {};
  const legacy = {};
  for (const i of items) {
    const n = normalizeStatus(i.status);
    c[n] = (c[n] || 0) + 1;
    if (i.legacyStatus && i.legacyStatus !== n) legacy[i.legacyStatus] = (legacy[i.legacyStatus] || 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        total: items.length,
        counts: c,
        legacyCounts: Object.keys(legacy).length ? legacy : undefined,
        next: items
          .filter((i) => isPending(i.status))
          .slice(0, 10)
          .map((i) => ({ idx: i.idx, name: i.name, url: i.url })),
        statuses: ["pending", "running", "succeeded", "failed", "failed_system", "skipped", "blocked"],
      },
      null,
      2,
    ),
  );
}

async function ensureLocalVms() {
  const { spawnSync } = await import("node:child_process");
  let pool;
  try {
    pool = JSON.parse(readFileSync(join(BATCH_DIR, "vm-pool.json"), "utf8"));
  } catch {
    return { attempted: [], skipped: "no vm-pool.json" };
  }
  const localEndpoints = (pool.endpoints || []).filter(
    (e) => e.id !== "homeserver" && e.id.startsWith("local-") && e.enabled !== false,
  );
  if (!localEndpoints.length) return { attempted: [], skipped: "no local endpoints" };
  let vms = [];
  try {
    const ls = spawnSync("lume", ["ls", "--format", "json"], { encoding: "utf8", timeout: 10000 });
    if (ls.stdout) vms = JSON.parse(ls.stdout);
  } catch {
    return { attempted: [], skipped: "lume ls failed" };
  }
  const byName = new Map(vms.map((v) => [v.name, v]));
  const results = [];
  for (const ep of localEndpoints) {
    const vmName = ep.env?.LUME_VM_NAME;
    if (!vmName) continue;
    const vm = byName.get(vmName);
    if (!vm) {
      results.push({ endpoint: ep.id, vmName, status: "not-found", action: "skip" });
      continue;
    }
    if (vm.status === "running") {
      results.push({ endpoint: ep.id, vmName, status: "running", action: "already-running" });
      continue;
    }
    if (vm.status === "stopped") {
      const run = spawnSync("lume", ["run", vmName, "--detach"], { encoding: "utf8", timeout: 30000 });
      const ok = run.status === 0;
      results.push({
        endpoint: ep.id,
        vmName,
        status: vm.status,
        action: ok ? "started" : "failed",
        exitCode: run.status,
        stderr: (run.stderr || "").slice(0, 300),
      });
      if (ok) await new Promise((r) => setTimeout(r, 3000));
    } else {
      results.push({ endpoint: ep.id, vmName, status: vm.status, action: "skip-unknown-status" });
    }
  }
  return { attempted: results };
}

const args = process.argv.slice(2);
const cmd = args[0] || "--print-wave";

if (cmd === "--rebuild-queue") {
  const items = buildQueue();
  saveQueue(items);
  console.log(JSON.stringify({ ok: true, total: items.length }));
} else if (cmd === "--print-wave") {
  printWave();
} else if (cmd === "--ensure-vms") {
  const res = await ensureLocalVms();
  console.log(JSON.stringify({ ok: true, ...res }, null, 2));
} else if (cmd === "--print-wave-ensured") {
  const vms = await ensureLocalVms();
  const wave = printWave();
  console.log(JSON.stringify({ vms, waveCreated: !!wave }, null, 2));
} else if (cmd === "--mark-launched") {
  markLaunched(args.slice(1));
} else if (cmd === "--mark-done") {
  markDone(args[1], args[2] || "done", {});
} else if (cmd === "--status") {
  status();
} else if (cmd === "--base-prompt") {
  console.log(basePrompt());
} else {
  console.error(
    "Usage: --print-wave | --print-wave-ensured | --ensure-vms | --rebuild-queue | --status | --mark-launched names... | --base-prompt",
  );
  process.exit(2);
}
