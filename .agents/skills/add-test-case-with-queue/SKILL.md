---
name: add-test-case-with-queue
description: Add a new app to the allbrew test case table, flow it through unit/integration/E2E suites, and enqueue its GitHub, package registry, homepage and download URLs to the monitored-install-batch queue. Use when the user wants a test case that is also batch-tested via VM.
metadata:
  version: "1.0"
---

# Add test case + enqueue to monitored-install-batch

Variant of `add-test-case` that also enqueues the new test case's URLs to `tests/monitored-install-batch/state/agent-queue.json` for VM batch verification.

## Steps 1–9: identical to add-test-case

Follow **steps 1–9** of `.agents/skills/add-test-case/SKILL.md` verbatim:

1. Gather metadata (GitHub release asset, homepage, registry, Homebrew status, license/version/stars).
2. Determine generator.
3. `add-row.mjs --dry-run` then write row to `.agents/plans/allbrew-test-cases.md` (use `md-spreadsheet-parser` via that script, never raw `split('|')`).
4. Unit test under `tests/unit/generators/<generator>.test.ts` (mocked, offline).
5. Integration test under `tests/integration/<generator>.int.test.ts` (live).
6. Optional manual drive example.
7. `tests/e2e/catalog.json` entry (`skip:true` unless user asks live).
8. `bun run check && bun run test`.
9. Summarize files changed.

## Step 10: Enqueue to monitored-install-batch

### 10a. Derive all queue URLs from the single input URL

From the canonical input URL (strip tracking params like `?utm_source=...`), collect:

- **GitHub repo URL** — `https://github.com/<owner>/<repo>` (always, if present)
- **Package registry URLs** — if the repo publishes to `cargo`/`npm`/`pip`/`go`/`rubygems`/`nuget`, include `https://crates.io/crates/<crate>`, `https://www.npmjs.com/package/<pkg>`, `https://pypi.org/project/<pkg>`, etc. Discover via `Cargo.toml`/`package.json`/`pyproject.toml`/`go.mod` in repo root.
- **Homepage** — `in_dev_website` (e.g. `https://antigma.ai`, `https://example.com`) when it hosts a download/install one-liner.
- **Direct download / install-script URLs** — any distinct installer the README advertises (`https://.../install.sh`, `https://.../download`, DMG/ZIP asset URLs from latest release). Prefer the script URL and one canonical release asset URL, not the full asset list.

Deduplicate by stripping scheme/trailing `/` and tracking params, lowercase host. Keep 2–5 URLs max (repo + 1–2 registry + homepage + script).

### 10b. Append to `state/agent-queue.json`

Use the helper in this skill (no hand-edit):

```bash
node .agents/skills/add-test-case-with-queue/add-to-queue.mjs \
  --urls "https://github.com/AntigmaLabs/ante,https://antigma.ai,https://ante.run/install.sh" \
  --dry-run        # preview

node .agents/skills/add-test-case-with-queue/add-to-queue.mjs \
  --urls "https://github.com/AntigmaLabs/ante,https://antigma.ai,https://ante.run/install.sh"
```

Helper behavior:

- Reads `tests/monitored-install-batch/state/agent-queue.json` (creates `{total,items,updatedAt}` if missing; preserves `updatedAt`/`total`).
- For each URL: derive `slug` (`ante` → `ante-install-sh` for script), `name` (from table `app` or URL basename), `source` (`in_github`/`in_dev_website`/`script_install`), `agentName` `url-<idx>-<slug>`, `status` `pending`, `idx = max+1`.
- Skips duplicates (exact URL match or slug match).
- Sets `total = items.length`, `updatedAt = now`.
- Prints added/skipped summary; with `--dry-run` prints without writing.

### 10c. Optional batch-ops archival check

If `tests/monitored-install-batch/fix-packages/` is lean/archived, verify the queue write survives archiving:

```bash
bun tests/monitored-install-batch/batch-ops.mjs --list-archived | head
```

### 10d. Verify

- `cat tests/monitored-install-batch/state/agent-queue.json | jq '.items[-3:]'`
- Confirm `tests/e2e/catalog.json` and `.agents/plans/allbrew-test-cases.md` still parse (`bun run check`).
- Leave E2E `skip:true`; live VM verification happens via `vm-install-one.mjs` when the orchestrator drains the queue.

## Reference

- Queue schema: `state/agent-queue.json` `{total, updatedAt, items:[{idx,name,url,source,slug,agentName,status}]}` — `state/` is gitignored, `archive/manifest.json` is tracked.
- Original skill: `.agents/skills/add-test-case/SKILL.md` steps 1–9.
