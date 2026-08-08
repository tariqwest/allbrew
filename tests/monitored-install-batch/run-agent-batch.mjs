#!/usr/bin/env bun
/**
 * Agent-driven monitored-install batch dispatcher.
 *
 * Unlike run-orchestrator.mjs (deterministic heuristics), this emits a queue of
 * per-URL work items for the parent Oz agent to spawn via run_agents, each
 * following monitored-allbrew-install with real judgment + fix intelligence.
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
  ".agents/skills/monitored-allbrew-install/SKILL.md",
);

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
      if (r.status === "success" && r.url) ok.add(r.url);
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
        if ((r.status === "success" || r.status === "fixed_success") && r.url)
          ok.add(r.url);
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
  return JSON.parse(readFileSync(QUEUE_PATH, "utf8")).items;
}

function basePrompt() {
  return `You are a child agent running ONE monitored allbrew install in the allbrew repo.

## Repo
Working directory (absolute): ${REPO_ROOT}
cd there first for judgment, code fixes, and unit tests only.

## Skill (required)
Read and FOLLOW:
${SKILL_PATH}
plus references/run-records.md, failure-playbook.md, release-and-retry.md (local validation only).

## HARD ISOLATION RULES (do not violate)
1. **Do NOT clutter or mutate the host machine's real Homebrew**.
   - Forbidden as success path: host \`brew install\`, host \`allbrew <url>\` auto-install into the user's real tap, host \`brew services\`.
2. **Full install/verify/uninstall MUST run in the Lume VM** via:
   \`\`\`bash
   LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \\
     --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install.log"
   \`\`\`
   That helper uses th-allbrew + exclusive prefix + unlock hygiene, then uninstalls.
3. Local generate/debug only:
   \`bun run bin/allbrew.ts "<url>" --name "<slug>" --tap "$(mktemp -d)" --verbose\`
   with CI=1 ALLBREW_NONINTERACTIVE=1.
4. Code fixes only in disposable worktree: \`git worktree add /tmp/allbrew-wt-<slug>-$$ -b agent/<slug> HEAD\` then export patches into fix-package/. Never commit/push/release to main unless parent asks.
5. Real Phase 0.5 judgment from URL+docs (not stubs). No --service/--no-service.
6. Option A fix-package/ on failure (FIX.md, patches/, validation.json). Finalize run records + append tests/monitored-install-batch/state/agent-index.jsonl.
7. Completion message: URL, status, RUN_DIR, deltas, fix-package, residual risk, and confirm VM helper was used for install.

## Out of scope
Other URLs; host brew pollution; auto-release.
`;
}

function perUrlPrompt(item) {
  return `## Your single URL
- idx: ${item.idx}
- name: ${item.name}
- slug: ${item.slug}
- url: ${item.url}
- source column: ${item.source}

## Steps
1. cd ${REPO_ROOT}
2. Read the monitored-allbrew-install SKILL.md and execute Phases 0→5 for THIS url only.
3. Init run record with slug \`${item.slug}\`.
4. Independent judgment BEFORE allbrew (real docs fetch).
5. Install via Homebrew allbrew if available, else document env_fail; still try local bun generate for product bugs.
6. On failure: root-cause, implement durable fix in a disposable worktree, validate, export fix-package/ (option A). Do not release.
7. Finalize run record + append agent-index.jsonl.
8. Reply with structured completion summary.

Start now.`;
}

function printWave() {
  const concurrency = Math.max(1, envInt("TH_BATCH_CONCURRENCY", 6));
  const items = loadQueue();
  const pending = items.filter(
    (i) => i.status === "queued" || i.status === "retry",
  );
  const wave = pending.slice(0, concurrency).map((i) => ({
    ...i,
    status: "launching",
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
  const items = loadQueue();
  for (const i of items) {
    if (i.agentName === name || String(i.idx) === String(name)) {
      i.status = status;
      i.finishedAt = new Date().toISOString();
      Object.assign(i, extra);
    }
  }
  saveQueue(items);
  appendFileSync(
    AGENT_INDEX,
    JSON.stringify({
      agentName: name,
      status,
      finishedAt: new Date().toISOString(),
      ...extra,
    }) + "\n",
  );
  console.log(JSON.stringify({ ok: true, name, status }));
}

function status() {
  const items = existsSync(QUEUE_PATH) ? loadQueue() : buildQueue();
  if (!existsSync(QUEUE_PATH)) saveQueue(items);
  const c = {};
  for (const i of items) c[i.status] = (c[i.status] || 0) + 1;
  console.log(
    JSON.stringify(
      {
        total: items.length,
        counts: c,
        next: items
          .filter((i) => i.status === "queued" || i.status === "retry")
          .slice(0, 10)
          .map((i) => ({ idx: i.idx, name: i.name, url: i.url })),
      },
      null,
      2,
    ),
  );
}

const args = process.argv.slice(2);
const cmd = args[0] || "--print-wave";

if (cmd === "--rebuild-queue") {
  const items = buildQueue();
  saveQueue(items);
  console.log(JSON.stringify({ ok: true, total: items.length }));
} else if (cmd === "--print-wave") {
  printWave();
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
    "Usage: --print-wave | --rebuild-queue | --status | --mark-launched names... | --base-prompt",
  );
  process.exit(2);
}
