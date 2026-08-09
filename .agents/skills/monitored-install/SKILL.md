---
name: monitored-install
description: This skill should be used when the user asks to "install with allbrew and monitor", "troubleshoot allbrew install", "allbrew this URL end-to-end", "monitored allbrew install", "fix allbrew generation for a URL", or wants a URL run through the Homebrew-installed allbrew CLI with error monitoring, post-install verification, codebase fix + release if needed, and a final retry. Accepts a package/repo/app URL and drives the full generate → install → verify → (fix → release → retry) loop.
metadata:
  version: "1.2"
---

# Monitored allbrew install

Drive a single URL through the Homebrew-installed `allbrew` CLI, verify the resulting formula/cask install, and — on failure — add a regression test case, fix the generator/analyzer in-repo, release a new allbrew, upgrade the brew-installed CLI, and retry until the install works.

Every run is persisted under `tests/monitored-install-runs/` as a dogfood flat-file record: agent judgment vs codebase classification, logs, outcome, and optional proposed classifier rules for later test promotion. See `references/run-records.md`.

## Inputs

| Input | Required | Notes |
|-------|----------|-------|
| `url` | yes | GitHub repo, registry package page, DMG/ZIP URL, MAS/Setapp link, or install-script URL |
| `name` | no | Formula/cask name override (`--name`) |
| `package` | no | Registry package name override (`--package` / crate / gem / go module) |
| `expect` | no | Expected binary name or app bundle for post-install checks |
| `release` | no | Default **patch** release on fix (`bun run release patch`) |

Work from the allbrew repo root: `~/Developer/allbrew` (or the active clone). Prefer the **Homebrew-installed** binary at `/opt/homebrew/bin/allbrew` for user-facing install attempts. Use local `bun run bin/allbrew.ts` only when validating an unreleased fix before release.

**Service blocks:** do **not** pass `--service` or `--no-service`. allbrew must auto-detect whether a Homebrew `service` stanza is appropriate. Independently evaluate the URL/docs first (Phase 0.5) and treat a mismatch with allbrew’s outcome as a product bug (`service_mismatch` → Phase 3).

## Success criteria

Stop when all of the following hold:

1. `allbrew <url> …` exits 0 and writes a formula/cask into the configured tap.
2. `brew install` / allbrew’s auto-install succeeds for that package.
3. Post-install verification passes (binary `--version`/`--help`, or `.app` present for casks).
4. Agent service expectation matches allbrew’s service decision (stanza present iff a long-running service is warranted).
5. If a code fix was required: fix is committed, pushed, released, and the brew-installed `allbrew --version` matches the new release; final retry with that bottle also passes.
6. A run record exists under `tests/monitored-install-runs/<run-id>/` with judgment, outcome, logs, and index.jsonl entry (and `classifier-rule.mjs` when deltas warranted a proposed rule).

## Phase 0 — Preconditions

1. Confirm the brew CLI is current enough:
   ```bash
   which allbrew
   allbrew --version
   brew info allbrew
   ```
2. Confirm tap config (token values stay redacted):
   ```bash
   allbrew config show
   # expect tapPath → homebrew-allbrew (or the user's configured tap)
   ```
3. Confirm the allbrew **source** checkout is clean enough to release later if a fix is needed:
   ```bash
   cd ~/Developer/allbrew
   git status
   git pull --ff-only
   ```
4. Load `GITHUB_TOKEN` for releases from the repo `.env` or environment without printing the secret. See `references/release-and-retry.md`.
5. Initialize a run record (required):
   ```bash
   bun .agents/skills/monitored-install/scripts/init-run-record.mjs \
     --url "<url>" --slug "<slug>"
   # capture RUN_DIR=... and RUN_ID=... from output
   ```
   Keep `RUN_DIR` for the rest of the workflow. Point capture logs into it (e.g. `--log "$RUN_DIR/allbrew-initial.log"`).

## Phase 0.5 — Independent agent classification (service + generator)

Before running allbrew, form an independent judgment from the URL and primary docs (README, homepage, `package.json` bin/scripts, release notes). Do **not** trust allbrew’s detector yet.

Write/update `$RUN_DIR/agent-judgment.json` as docs are read:

1. **`inputShape`** — URL kind (`github-repo`, `npm-package`, `pypi`, `cask-url`, …), host/owner/repo, and free-form `hints` (e.g. `readme-npm-global`, `npx`, `mcp-stdio`, `dmg-direct`).
2. **`expected`** — generator, package/formula/bin names, `service` boolean + command, suggested `allbrewArgs`, and `rationale`.
3. **`notes`** — short thought process (why this generator, why service true/false, ambiguous signals).

### Service expectation

Form `agent_service_expectation` / `expected.service` using:

### Expect `service: true` only when most of these hold

- The package is meant to run as a **long-lived process** managed outside an interactive terminal (daemon, background agent host, always-on local API/gateway/proxy).
- Docs show `brew services`, launchd/systemd, “start on login”, or an equivalent supervised lifecycle.
- There is a stable run command that **blocks and serves** (e.g. `foo serve`, `foo server`, `foo start --daemon`) rather than a one-shot CLI.
- A local port/socket is continuously listened on for clients that are **not** the same process’s parent (browser UI backend, LAN API, etc.).

### Expect `service: false` when

- Primary UX is one-shot CLI (`analyze`, `build`, `convert`, `query` then exit).
- “Server” means **stdio MCP** or editor-spawned subprocesses (Cursor/Claude Code start/stop them; not launchd).
- Optional `serve`/`ui` is a dev convenience, not the default install path.
- GUI `.app` / cask only (casks do not get formula `service` blocks).
- Library/SDK with no long-running supervisor story.

Also set generator expectations (`expected.generator`, `packageName`, …) the same way — this is the agent-side “oracle” later compared to codebase output.

Record a short rationale in `expected.rationale` / `notes`, e.g.:

```text
agent_service_expectation: false
reason: CLI+MCP stdio tool; optional `serve` is bridge-only, not brew-services primary
expected_command: (none)
generator: npm-package / packageName: gitnexus
```

or:

```text
agent_service_expectation: true
reason: docs document `brew services start foo` and a blocking `foo server` on :8080
expected_command: foo server
```

If service evidence is ambiguous, set `expected.service` to `null` / unclear and prefer observing allbrew’s choice, but still flag nonsense service **commands** (prose fragments, truncated markdown) as `service_mismatch`.

## Phase 1 — Baseline install attempt (Homebrew allbrew)

1. Derive a short package slug from the URL (repo name / npm name / filename).
2. Prefer non-interactive flags so prompts cannot hang the run:
   - always pass `--verbose`
   - pass `--name <slug>` when known
   - pass `--package` / `--bin-name` / `--app-name` / `--desc` when known
   - **do not** pass `--service` or `--no-service` (auto-detect)
3. Capture stdout+stderr under `$RUN_DIR/allbrew-initial.log` (preferred) or `/tmp/allbrew-monitor-<slug>-<ts>.log` then copy into the run dir.
4. Run via the capture helper when available (log **into** the run dir):
   ```bash
   .agents/skills/monitored-install/scripts/run-allbrew-capture.sh \
     --url "<url>" \
     --name "<slug>" \
     --log "$RUN_DIR/allbrew-initial.log" \
     --extra "--package <pkg>"   # optional
   ```
   Or equivalent:
   ```bash
   /opt/homebrew/bin/allbrew "<url>" --name "<slug>" --verbose 2>&1 | tee "$RUN_DIR/allbrew-initial.log"
   ```
5. Record: exit code, generator chosen, formula/cask path, brew install output, service-related log lines, and any stack traces.
6. Update `$RUN_DIR/agent-judgment.json` → `codebaseObserved` from the log + generated Ruby (strategy, generator, packageNameDetected, serviceDetected, serviceCommand, formulaPath, logSignals). Append an attempt object onto `metadata.json` → `attempts`.

### Derive `allbrew_service_decision` from the run

Inspect the log + generated Ruby:

| Evidence | Decision |
|----------|----------|
| Log: `Detected service/launchagent hint` and formula contains `service do` | `true` |
| Formula has no `service do` block | `false` |
| Manifest `options.service` if present | use as corroboration |

Also capture `allbrew_service_command` from the `service do` / `run […]` stanza when present.

### Classify the outcome

| Signal | Class |
|--------|--------|
| exit 0 + formula written + brew install ok | **install_ok** → Phase 1.5 then Phase 2 |
| generation error (registry 404, hash fail, classify fail, template throw) | **generate_fail** → Phase 3 |
| generation ok, `brew install` / link / test fails | **brew_fail** → Phase 3 |
| hung on interactive prompt | **prompt_hang** → re-run with stronger non-service flags; if still ambiguous, **generate_fail** |
| allbrew missing / wrong tap | **env_fail** → fix env, restart Phase 1 (no product code change) |

## Phase 1.5 — Service expectation vs allbrew decision

After a successful generate (and again after local fix validation), compare:

| `agent_service_expectation` | `allbrew_service_decision` | Result |
|-----------------------------|----------------------------|--------|
| `true` | `true` | OK if command is a real runnable argv (not prose) |
| `false` | `false` | OK |
| `true` | `false` | **`service_mismatch`** — allbrew under-detected |
| `false` | `true` | **`service_mismatch`** — allbrew over-detected |
| `unclear` | any | OK only if command (when present) is coherent; else **`service_mismatch`** |

Raise **`service_mismatch`** (treat like generate_fail → Phase 3) when:

1. Boolean expectation disagrees with allbrew’s stanza presence, or
2. A service block exists but `run` is empty, prose, markdown-truncated (`This starts the server on \``), or clearly not an executable invocation, or
3. Expectation was `true` and the command is missing/`keep_alive` wrong for a supervised daemon.

Also record **generator/parameter deltas** (not only service) into `agent-judgment.json` → `deltas[]` whenever agent `expected.*` disagrees with `codebaseObserved.*` (packageName, generator, binName, etc.). Severity `error` if it caused or would cause failure; `warn` if successful but wrong shape; `match` if aligned.

When any `error`/`warn` delta exists, write `$RUN_DIR/classifier-rule.mjs` exporting `matchCase(input)` plus `meta` — a pure rule (regex and/or small JS) the agent believes would classify this input shape correctly and could be promoted into `lib/classifier.ts` / `lib/analyzer.ts`. Prefer generalizable rules over host one-offs; one-offs are still valuable fixtures. Set `proposedRule` in the judgment JSON to point at that file.

Do **not** “fix” a mismatch by re-running with `--service` / `--no-service` as the permanent path. Fix detector/generator logic (usually `lib/analyzer.ts` service helpers and/or `lib/generators/service.ts`), add tests, release, and retry with auto-detect still enabled.

## Phase 2 — Post-install verification

When install appears successful and Phase 1.5 passed:

1. Resolve the installed name from the formula/cask path or allbrew summary line.
2. For formulae:
   ```bash
   brew list <name>
   brew info <name>
   which <bin>
   <bin> --version || <bin> --help || <bin> -h
   ```
3. When `allbrew_service_decision` is `true`, also sanity-check the service definition:
   ```bash
   brew info <name> | rg -n "Service|service"
   # optional, only if safe on the machine:
   # brew services info <name>
   ```
   Do not leave unwanted services running; stop anything started for a probe.
4. For casks:
   ```bash
   brew list --cask <name>
   ls "$HOME/Applications" /Applications | rg -i '<app>'
   ```
5. Confirm the allbrew manifest exists: `~/.config/allbrew/packages/<name>.json`.
6. If verification fails, treat as **brew_fail** and continue to Phase 3.
7. If verification passes and no code fix was required, report success and stop.

## Phase 3 — Failure path (test case + fix)

Do **not** ship a one-off tap-only workaround without fixing allbrew source when the failure is an allbrew bug (bad parsing, missing cleaner, hash/redirect, generator selection, service detection, etc.).

### 3a. Invoke `add-test-case`

Read and follow `.agents/skills/add-test-case/SKILL.md` with this URL:

1. Gather metadata (repo, registry, assets, license, version).
2. Choose the correct generator.
3. Add a row via `add-test-case/add-row.mjs` (dry-run first).
4. Add unit + integration coverage that reproduces the failure mode (not only a happy path). For `service_mismatch`, cover README/service fixtures that encode the expected boolean + command shape.
5. Add a `tests/e2e/catalog.json` entry with `skip: true` unless the user asked for live E2E.
6. Run:
   ```bash
   bun run check
   bun run test
   ```

### 3b. Root-cause the allbrew bug

Use the captured log + `references/failure-playbook.md`.

Typical investigation order:

1. Reproduce with local source for faster iteration:
   ```bash
   cd ~/Developer/allbrew
   bun run bin/allbrew.ts "<url>" --name "<slug>" --verbose
   ```
   Still omit `--service` / `--no-service` unless isolating a detector bug temporarily; strip those flags before release validation.
2. Trace classifier → analyzer (`detectInstallMethod`, `detectServiceConfig`) → generator (`collect*Payload`) → template renderer → brew install.
3. Prefer the smallest durable fix at the earliest wrong layer (e.g. strip `pkg@latest` in analyzer rather than special-casing one app; fix service command extraction rather than hardcoding one formula).
4. Add/adjust unit tests beside the fix so the regression is locked.

### 3c. Validate the fix locally (before release)

1. `bun run check && bun run test` (and targeted `bun test path/to/file`).
2. Generate against a **temporary tap path** when possible to avoid polluting the real tap mid-debug:
   ```bash
   TMP_TAP=$(mktemp -d)
   mkdir -p "$TMP_TAP/Formula" "$TMP_TAP/Casks"
   bun run bin/allbrew.ts "<url>" --name "<slug>" --tap "$TMP_TAP" --verbose
   ```
3. Re-run Phase 1.5 against the temp formula (service expectation must now match).
4. When the local generator payload + Ruby look correct, proceed to commit.

## Phase 4 — Commit, push, release, upgrade, retry

Follow `references/release-and-retry.md` in full. Summary:

1. Stage **only** intentional fix + tests (no secrets, no unrelated dirty work unless it is part of the fix).
2. Commit with conventional style, e.g. `fix(analyzer): strip npm version tags from install specs`.
3. `git push origin main`.
4. Ensure working tree is clean (release script requires it).
5. Load `GITHUB_TOKEN` and run:
   ```bash
   bun run release patch
   ```
6. Upgrade the Homebrew-installed CLI:
   ```bash
   brew update
   brew upgrade allbrew || brew reinstall allbrew
   allbrew --version   # must match the new release
   ```
7. **Retry Phase 0.5 → Phase 1 → Phase 1.5 → Phase 2** using `/opt/homebrew/bin/allbrew` (not the local bun entry) against the same URL, still without service force-flags.
8. On retry failure, return to Phase 3 (do not loop more than twice without reporting a hard blocker).

## Phase 5 — Persist run record + report

### 5a. Finalize the flat-file run record (required)

1. Ensure `$RUN_DIR/agent-judgment.json` is complete (inputShape, expected, codebaseObserved, deltas, notes, proposedRule).
2. Copy final retry log to `$RUN_DIR/allbrew-final.log` when a retry ran; copy generated formula/cask to `$RUN_DIR/formula.rb` when useful.
3. Write `$RUN_DIR/summary.md` with the human narrative (thought process, failure mode, fix, residual risk).
4. Optionally enrich `outcome.json` verification commands/outputs before finalize.
5. Finalize index + symlink:
   ```bash
   bun .agents/skills/monitored-install/scripts/finalize-run-record.mjs \
     --run-dir "$RUN_DIR" \
     --status success|fixed_success|failed|blocked \
     --failure-class generate_fail|brew_fail|service_mismatch|prompt_hang|env_fail|null \
     --package-name "<name>" \
     --package-version "<ver>" \
     --verify-ok true|false \
     --release-tag "vX.Y.Z" \          # if released
     --release-commit "<sha>" \        # if released
     --allbrew-version-final "$(allbrew --version)"
   ```
6. Confirm `tests/monitored-install-runs/latest` points at this run and `index.jsonl` gained a line.

Do this even on failure. Redact secrets from any copied logs. Run artifacts stay local (gitignored); promote learnings into unit tests / fixtures deliberately.

### 5b. Chat report

Report a short structured summary:

- URL and final formula/cask name
- `agent_service_expectation` vs `allbrew_service_decision` (+ command)
- Generator/package deltas (agent vs codebase)
- Initial outcome (ok / fail + root cause)
- Files changed / commit / release tag (if any)
- Final `allbrew --version` and package version
- Verification commands and results
- Path to run record: `tests/monitored-install-runs/<run-id>/` (and whether `classifier-rule.mjs` was written)
- Residual risks (ambiguous service UX, unsigned cask, native npm rebuild, etc.)

## Guardrails

- Prefer Homebrew core/cask when README already documents `brew install …` and the package is healthy upstream — allbrew may offer that path; do not force a duplicate formula unless the user wants one.
- Never print `GITHUB_TOKEN` / `githubToken` values.
- Never commit `.env` or config tokens.
- Never use `--service` / `--no-service` as the monitored success path; auto-detect must be correct.
- Do not force-push release tags or rewrite published release assets.
- Do not mark E2E catalog entries `skip: false` unless the user explicitly wants a live brew install in CI/E2E.
- Cap automated fix→release→retry loops at **2** releases per URL; escalate with findings after that.
- Keep product fixes in `lib/` + tests; do not “fix” by only hand-editing the generated tap `.rb` as the permanent solution.
- Always write a monitored-install run record; never skip Phase 5a because the install “mostly worked.”
- Do not commit `tests/monitored-install-runs/**` contents (gitignored). Do commit skill helpers/schema and any promoted unit fixtures derived from runs.

## Resources

- **`references/run-records.md`** — run dir layout, JSON schemas, classifier-rule.mjs contract, index.jsonl
- **`references/failure-playbook.md`** — common failure signatures and fix locations (includes the GitNexus `@latest` case and service mismatches)
- **`references/release-and-retry.md`** — token loading, `bun run release patch`, brew upgrade, final retry checklist
- **`scripts/init-run-record.mjs`** / **`scripts/finalize-run-record.mjs`** — create and seal run records
- **`scripts/run-allbrew-capture.sh`** — non-interactive capture helper for install attempts
- **Sibling skill** — `.agents/skills/add-test-case/SKILL.md` (required on every generate/brew/service_mismatch failure that indicates product gaps)
