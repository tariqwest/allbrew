---
name: monitored-install-batch-child
description: VM-isolated monitored-install for batch workers — keeps host clean, outputs fixes as patch artifacts. Use when the parent orchestrator spawns a batch child for one URL via monitored-install-batch, or when a URL must be judged/tried/fixed/verified without polluting the host's working tree, Homebrew prefix, or tap.
metadata:
  version: "1.0"
---

# Monitored-install (batch-child, VM-isolated)

VM-isolated variant of `.agents/skills/monitored-install` for `monitored-install-batch` workers. Keeps the **agent-in-the-loop judge → try → fix → verify** loop, but enforces batch guardrails: **always VM** for install/verify, **never live-fix the host's working tree** — code fixes are produced as **patch artifacts** in a disposable worktree's `fix-package/` for later parent-side integration.

This is the **only** skill batch children should follow for one queue URL. The host `monitored-install` (`.agents/skills/monitored-install/SKILL.md`) remains for single-URL, human-in-the-loop runs that may live-edit `main`. Do not mix them.

## Core contract

| Concern | Rule |
|---------|------|
| **Host working tree** | **Never** `git add/commit/push` to `main`, `origin/main`, or the host's `~/Developer/allbrew` checkout. All edits live in a **disposable `git worktree`** under `tests/monitored-install-batch/worktrees/<slug>-<ts>/` (or `worktrees/<slug>`). Host `main` stays clean. |
| **Host Homebrew** | **Never** `brew install`, `brew uninstall`, `brew services`, or `allbrew` host-tap auto-install as the green path. `brew` on host is only for `Lume`/`vm-install-one.mjs` plumbing, `git worktree`, and temp-tap *debug* (`CI=1 ALLBREW_NONINTERACTIVE=1 … --tap $(mktemp -d)`). Success = **VM** `VERIFY_OK=true`. |
| **Fix output** | **Never** live-patch host. On failure, export `fix-package/` as **patch artifacts** (`FIX.md`, `manifest.json`, `patches/*.patch`, `validation.json`) under `$RUN_DIR/fix-package/` and the worktree's `tests/monitored-install-batch/fix-packages/<slug>/`. Parent reconciles via `bun run batch:reconcile-fixes` inside `worktrees/` — no auto-release. |
| **VM isolation** | **Always** VM for full `install/verify/uninstall`. Local `bun run bin/allbrew.ts` is only for *fast* generator debug against a **temp tap** (`$(mktemp -d)`), not for the success verdict. |
| **Release** | **Never** `bun run release` / `git push --force` / `sudo`. Releases are parent/user-gated. |
| **Assignment** | Only the canonical `url`/`slug` from the parent prompt. No URL substitution. |

If any step would violate the above, stop, finalize the partial `RUN_DIR` with `blocked`/`failed` + `fix-package` (if any), and report `blocked_action` so the parent can widen privileges or requeue.

## Inputs (from parent)

| Input | Required | Source |
|-------|----------|--------|
| `url` | yes | Queue item `url` |
| `slug` | yes | Queue item `slug` (formula/cask name) |
| `idx` / `agentName` | yes | Queue `idx` / `agentName` for RUN_DIR naming |
| `launchName` | yes | Unique per-wave name (`u{idx}-{slug}-{ts}Z`) for child reporting |

Work from the **allbrew repo root** (`git rev-parse --show-toplevel` or the active clone). Do not `cd` elsewhere.

## Layout (batch-child)

| Path | Role |
|------|------|
| `tests/monitored-install-runs/<runId>/` | Canonical per-URL record (judgment, logs, outcome, `fix-package/` patches) |
| `tests/monitored-install-batch/worktrees/<slug>-<ts>/` | Disposable worktree for code edits (isolated `main` checkout) |
| `tests/monitored-install-batch/fix-packages/<slug>/` | Legacy mirror of `fix-package/` for reconcile tooling |
| `tests/monitored-install-batch/state/agent-queue.json` | Parent-owned queue (child only reads its row) |
| `tests/monitored-install-batch/vm-install-one.mjs` | **Required** VM helper — the only `brew install` that counts |

## Phase 0 — Preconditions (VM-aware, host-clean)

1. Confirm the **host** toolchain (no installs):
   ```bash
   which allbrew; allbrew --version; brew info allbrew | head -20
   allbrew config show  # tapPath → homebrew-allbrew, token redacted
   cd "$(git rev-parse --show-toplevel)"
   git status --porcelain  # host main must be clean; do not dirty it
   git pull --ff-only
   ```
2. Initialize a run record (host FS, but VM will do the install):
   ```bash
   bun .agents/skills/monitored-install/scripts/init-run-record.mjs \
     --url "<url>" --slug "<slug>"
   # capture RUN_DIR=... RUN_ID=...
   ```
   Keep `RUN_DIR` for all logs. Do not `brew install` on host.

3. **Provision a disposable worktree** for any future code edits (create now so host `main` never gets dirty):
   ```bash
   WT="tests/monitored-install-batch/worktrees/<slug>-$(date -u +%Y%m%dT%H%M%SZ)"
   git worktree add "$WT" -b "agent/<slug>-<ts>" HEAD
   # All future lib/ edits happen inside $WT, not host main.
   # On success with no fix, simply `git worktree remove --force "$WT"`.
   ```

## Phase 0.5 — Independent judgment (JS-rendered, host FS)

Before any VM work, form the agent oracle. **Do not** trust the eventual `vm-install-one` log yet.

1. Run the WebView judgment helper (Bun.WebView when available, static fallback):
   ```bash
   bun .agents/skills/monitored-install/scripts/render-judgment.mjs \
     --url "<url>" --run-dir "$RUN_DIR" --slug "<slug>" --force
   ```
   - Under `bun` with `Bun.WebView` (macOS, chrome backend) it JS-renders 1280×900 ephemeral, waits ~3s, evaluates `document.body.innerText` + `pre,code` text, matches `lib/analyzer.ts:CURL_PIPE_SHELL_RE` / `BARE_SCRIPT_URL_RE` → `bash-script`/`install-script` with `install-command` +85 boost. Falls back to static fetch under `node/tsx`.
   - If hit, it patches `agent-judgment.json` to `inputShape.kind=bash-script, hints [js-rendered-webview, bashinstall:…]`, `expected={strategy:bash-script, generator:install-script, packageName:<scriptUrl>, service:false}`.

2. Fill the rest of `agent-judgment.json` (`inputShape`, `expected` generator/package/bin/service, `notes` rationale) using the rendered hints + primary docs (README, homepage, `package.json` bin/scripts). **Keep the helper's `bash-script` pre-fill if present.**

   Service expectation follows `.agents/skills/monitored-install/SKILL.md` § Service expectation (`true` only for long-lived supervised daemon with `brew services`/launchd + blocking `serve` on a port; `false` for one-shot CLI, stdio MCP, optional `serve`, casks, libraries).

3. Leave `codebaseObserved`/`deltas` for Phase 1.5. This judgment is the VM-consistent oracle — it must match what `lib/page-discover-webview.ts:discoverWithWebView` will find inside the VM (same `innerText` + `detectScriptInstall` logic).

## Phase 1 — VM-isolated try (no host success path)

**Host `brew install` is not a success signal.** Use **only**:

1. **Full install/verify/uninstall via VM helper** (counts for `VERIFY_OK`):
   ```bash
   LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
     --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install.log"
   ```
   - Acquires a Lume VM from `vm-pool.json` (3 endpoints: 2 local + homeserver), exclusive `/opt/homebrew` sparsebundle, `HOMEBREW_CASK_OPTS=--appdir=$HOME/Applications`, runs the full `allbrew` → `brew install` → verify → `brew uninstall` + `assertUninstallResiduals` **inside the VM**, then detaches prefix in `finally`.
   - Logs to `$RUN_DIR/vm-install.log` (parent tails this for liveness). `VERIFY_OK=true` in this log is the **only** green path.

2. **Local generator debug (optional, temp tap only):**
   ```bash
   CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts "<url>" --name "<slug>" \
     --tap "$(mktemp -d)" --verbose 2>&1 | tee "$RUN_DIR/allbrew-initial.log"
   ```
   This exercises `lib/` without touching host `brew` or the tap. Use it to iterate on a fix inside the **worktree** (`$WT`), not host `main`. Never treat `host` `brew list`/`--version` from this leg as success.

3. Record `codebaseObserved` from the VM log + generated Ruby (when temp-tap leg ran): `strategy`, `generator`, `packageNameDetected`, `serviceDetected`/`serviceCommand`, `formulaPath`, `logSignals`. Preserve `vmHelperUsed=true` for the completion report.

**Pre-filter (do not VM):** `https://formulae.brew.sh/formula/*` bulk-mark `skipped` (`formulae_brew_sh_formula`) — not monorepo source-build. Report `blocked` with `fix-package` = null.

## Phase 1.5 — Service expectation vs VM decision

Compare `agent_service_expectation` (`expected.service` from Phase 0.5) vs `allbrew_service_decision` (from VM log + Ruby `service do`):

| expectation | decision | Result |
|-------------|----------|--------|
| true | true | OK if `run` is real argv (not prose) |
| false | false | OK |
| true | false | `service_mismatch` → Phase 3 |
| false | true | `service_mismatch` → Phase 3 |

Also record generator/parameter `deltas` into `agent-judgment.json` (packageName, generator, binName…). `error` if it would cause failure; `warn` if wrong shape but VM still passed.

When any `error`/`warn` delta exists, prepare a **patch artifact** (not a live host commit): ` $RUN_DIR/fix-package/patches/<rule>.patch` + `FIX.md` inside the **worktree**.

## Phase 2 — VM verification (already done by vm-install-one)

The VM helper already verified:

* `brew list <name>` / `brew info` inside VM
* `which <bin>` / `<bin> --version` / `--help` (formula) or `$HOME/Applications` / `/Applications` (cask)
* `~/.config/allbrew/packages/<name>.json` manifest in VM
* `assertUninstallResiduals` after `brew uninstall` (VM)

**Do not** re-verify on host (`which <bin>` on host is host pollution). If VM `VERIFY_OK=true` and Phase 1.5 passed, report `success` (or `fixed_success` if a patch was produced and re-verified in VM).

## Phase 3 — Fix in disposable worktree → patch artifacts (host never dirty)

**Never** `git add/commit` to host `main`. All fixes live in `$WT`.

1. **Invoke `add-test-case` logic** (worktree-local): gather metadata, choose generator, dry-run `add-test-case/add-row.mjs`, add unit + integration coverage that reproduces the failure (not just happy path). For `service_mismatch`, cover `README`/`service` fixtures. Do **not** run live E2E in the batch child.

2. **Root-cause in `$WT`:** trace `classifier.ts` → `analyzer.ts` (`detectInstallMethod`, `detectServiceConfig`, `detectScriptInstall` / `CURL_PIPE_SHELL_RE`) → `page-discover.ts` / `page-discover-webview.ts` (`innerText` `install-command`) → `generators/` → `templates/`. Prefer smallest durable fix at earliest wrong layer.

3. **Patch artifact, not live main:**
   ```bash
   cd "$WT"
   # edit lib/..., tests/...
   bun run check
   bun test tests/unit/<area>  # offline, not host brew
   git add <intentional files>
   git diff --cached --binary > "$RUN_DIR/fix-package/patches/<slug>-<ts>.patch"
   cat > "$RUN_DIR/fix-package/FIX.md" <<'MD'
   ## Failure class
   … (generate_fail / brew_fail / service_mismatch)
   ## Root cause
   … (why WebView/static missed, why service over/under-detected)
   ## Fix (worktree $WT, not host main)
   … (files, regex, score boost, template env)
   ## Validation
   … (bun run check, bun test, temp-tap `bun run bin/allbrew.ts … --tap $(mktemp -d)` inside $WT)
   MD
   cp -r "$RUN_DIR/fix-package" "tests/monitored-install-batch/fix-packages/<slug>/"
   # Do NOT git push, do NOT bun run release, do NOT brew upgrade.
   # Leave host main clean: git -C $WT diff, git worktree remove --force if done
   ```

   Mode `docs` = diagnosis only; `patch` = machine-applyable `*.patch`. Parent `bun run batch:reconcile-fixes -- --dry-run` later applies patches **only inside `worktrees/`** for integration.

4. **Validate fix in worktree (still VM-isolated):**
   ```bash
   cd "$WT"
   bun run check && bun test tests/unit/<area>
   CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts "<url>" --name "<slug>" --tap "$(mktemp -d)" --verbose
   # optional VM re-verify of the fix:
   LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
     --url "<url>" --name "<slug>" --log "$RUN_DIR/vm-install-fixed.log"
   ```
   Only if VM `VERIFY_OK=true` and Phase 1.5 now matches does the patch count as verified (`validation.json`).

## Phase 4 — No host commit/push/release

Batch children **never** `git push origin main`, `git push --force`, or `bun run release`. The patch artifact + `RUN_DIR` is the deliverable. The parent/user decides when to integrate (`reconcile-fixes` → `worktrees/` → PR → `main` → `release patch` → `brew upgrade allbrew` + final retry).

## Phase 5 — Persist run record + patch artifacts + report to parent

1. Ensure `$RUN_DIR/agent-judgment.json` is complete (inputShape, expected, codebaseObserved, deltas, notes, proposedRule, `_renderMeta` with `mode=webview` when used).
2. Copy logs: `allbrew-initial.log` (temp-tap debug), `vm-install.log` (VM, the only `VERIFY_OK` source), optionally `vm-install-fixed.log`, `formula.rb`/`cask.rb` when useful, and `fix-package/` (if any) into `$RUN_DIR/`.
3. Write `$RUN_DIR/summary.md` (thought process, failure class, fix as patch artifact path, residual risk, host-clean note).
4. Finalize the batch record (do **not** use the single-URL `finalize-run-record.mjs` alone — the batch parent marks via `run-agent-batch.mjs`):
   ```bash
   # Child reports completion shape; parent marks via queue CLI
   # STATUS: success | fixed_success | failed | blocked | skipped
   # failureClass: generate_fail | brew_fail | service_mismatch | …
   ```
   For local testing without a parent, you may locally run:
   ```bash
   bun .agents/skills/monitored-install/scripts/finalize-run-record.mjs \
     --run-dir "$RUN_DIR" --status <status> --failure-class <class> \
     --package-name "<slug>" --verify-ok <true|false>
   ```
   but the batch parent's `--mark-done` is authoritative.

5. **Report to parent** (harness message / status event):
   ```
   COMPLETION launchName=… agentName=… idx=…
   URL: …
   STATUS: success|failed|… 
   failureClass: …|null
   RUN_DIR: tests/monitored-install-runs/…
   vmHelperUsed: true
   fixPackage: tests/monitored-install-runs/…/fix-package (or null)
   patchArtifact: tests/monitored-install-batch/fix-packages/<slug>/patches/… (or null)
   residualRisk: …
   hostClean: true
   ```

   The parent marks `bun tests/monitored-install-batch/run-agent-batch.mjs --mark-done <agentName> <status>` and later reconciles patches without ever having host-polluted `main`.

## Anti-patterns (batch-child)

* Host `brew install --cask` or `brew list` as success → must be VM
* `git commit`/`push` to host `main` from child → must be worktree patch
* `bun run release` / `git push --force` from child → parent-gated
* `rm -rf ~` / `sudo` / `diskutil` → forbidden (see `assets/child-agent-privileges.DRAFT.toml`)
* Waiting on interactive approval UI → bypass or finalize partial + report `blocked_action`
* Launching without `vm-install-one.mjs` (host-only) → violates VM guardrail
