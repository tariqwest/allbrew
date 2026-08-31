---
name: monitored-install-dogfood
description: This skill should be used when the user asks to "dogfood install with allbrew", "monitored allbrew dogfood install", "troubleshoot allbrew dogfood", "contribute a dogfood test", or wants a URL driven through the `allbrew-dogfood` Homebrew formula (or `allbrew dogfood <url>` using the built-in `fm` model) with fixes captured as patches and submitted for review. Supports both maintainers (who can push to `allbrew-dogfood` / `main`) and community contributors (who submit a fork PR or a pre-filled issue for the maintainer to review).
metadata:
  version: "2.0"
---

# Monitored allbrew dogfood install

Drive a single URL through the **Homebrew-installed `allbrew-dogfood` package** (which provides the same `allbrew` command as the canonical build) — or the built-in **`allbrew dogfood <url>`** AI harness — and verify the resulting formula/cask install. On failure, capture the fix as a patch artifact and route it either (a) into the `allbrew-dogfood` branch + a new dogfood release (maintainers), or (b) into a fork PR / pre-filled issue for a maintainer to review (contributors).

`allbrew-dogfood` and `allbrew` are mutually exclusive: both install `/opt/homebrew/bin/allbrew`, so Homebrew will refuse to install one while the other is present.

This skill intentionally does **not** commit fixes to `main` or drive the canonical `allbrew` release. Patches live on the `allbrew-dogfood` branch and can later be cherry-picked / PR'd back to `main` when proven stable. When `main` releases, `scripts/release.ts` automatically rebases `allbrew-dogfood` on top of `main` and re-releases the dogfood build.

Run records live under `tests/monitored-install-runs/` so the same flat-file dogfood corpus is available for later promotion.

## Two modes

| | **Maintainer** | **Contributor** (community, non-admin) |
|---|---|---|
| Writes to `allbrew-dogfood` / `main` | yes (direct push) | no |
| Submits fix | push to branch + release | fork + PR, or pre-filled issue |
| Needs `GITHUB_TOKEN` | yes | only for a PR (optional; issue works without) |
| Repo path | maintainer clone | any clone; do **not** hardcode `/Users/...` |

Determine the mode first. If the user is a maintainer (can push to `tariqwest/allbrew`), follow the maintainer flow. Otherwise follow the **Contributor flow** (Phase 5 → "Contributor submission"), which requires no admin/contributor access to the source repo.

## Inputs

| Input | Required | Notes |
|-------|----------|-------|
| `url` | yes | GitHub repo, registry page, DMG/ZIP URL, MAS/Setapp link, or install-script URL |
| `name` | no | Formula/cask name override (`--name`) |
| `package` | no | Registry package name override (`--package` / crate / gem / go module) |
| `expect` | no | Expected binary name or app bundle for post-install checks |
| `mode` | no | `maintainer` (default if push access) or `contributor` |

Work from the allbrew repo root (resolve it generically — do not assume `~/Developer/allbrew`). Use `/opt/homebrew/bin/allbrew` (or `which allbrew`) for user-facing install attempts. Use a temp tap for local validation of an unreleased patch (`bun run bin/allbrew.ts --tap "$TMP_TAP"`) only when proving a source fix.

**Service blocks:** do **not** pass `--service` or `--no-service`. `allbrew-dogfood` must auto-detect whether a Homebrew `service` stanza is appropriate.

## Harnesses

Two equivalent ways to run the loop — pick whichever the user has access to:

1. **Agent harness** (this skill): an agent in any harness/model drives the phases below directly.
2. **`allbrew dogfood <url>`** (built-in AI): uses the Apple Foundation Models `fm` CLI (`/usr/bin/fm`, on-device `system` model) on macOS 27+. A Private Cloud Compute (`pcc`) backend is **aspirational** — selectable via `--backend pcc`, but it currently falls back to the on-device `fm` model. It classifies the URL, runs `allbrew <url> --verbose` non-interactively, and writes a run record (`agent-judgment.json`, `allbrew-run.log`, `diagnostic-report.md`). Its output is the same artifacts a contributor submits.

## Dogfood branch and tap layout

- **Source branch:** `allbrew-dogfood` on `github.com/tariqwest/allbrew` — long-lived, diverges from `main` with accumulated patches.
- **Patch artifacts:** one `.patch` per failure under `patches/dogfood/<run-id>/`. Also keep a copy in `tests/monitored-install-runs/<run-id>/fix-package/`.
- **Homebrew formula:** `tariqwest/homebrew-tap/Formula/allbrew-dogfood.rb` — a sibling to `allbrew.rb`.
- **Dogfood CLI:** `/opt/homebrew/bin/allbrew` (or `allbrew` on `PATH`).
- **Versioning:** semantically `X.Y.Z-dogfood.N` (e.g. `0.0.38-dogfood.1`). The base `X.Y.Z` tracks the last merged `main` tag; `N` is the dogfood patch counter. `scripts/release.ts` handles this automatically on each `main` release.

## Success criteria

Stop when:

1. `allbrew <url> …` exits 0 and writes a formula/cask into the configured tap. On the first successful run, **do not** generate a patch, do not touch the `allbrew-dogfood` branch, and do not release.
2. `brew install` / `allbrew` auto-install succeeds.
3. Post-install verification passes.
4. Agent service expectation matches `allbrew` service decision.
5. If a code fix was required: maintainers commit it to `allbrew-dogfood`, tag a new dogfood release, update the tap formula, and the final retry with `/opt/homebrew/bin/allbrew` passes. **Contributors** instead submit the patch + run record as a fork PR or pre-filled issue.
6. A run record exists under `tests/monitored-install-runs/<run-id>/` with judgment, outcome, logs, system-info report, and an `index.jsonl` entry.

## Phase 0 — Preconditions

1. Confirm the dogfood CLI is installed and current:
   ```bash
   which allbrew
   allbrew --version
   brew info allbrew-dogfood
   ```
2. Confirm tap config:
   ```bash
   allbrew config show
   # expect tapPath → homebrew-allbrew (or the user's tap)
   ```
3. Resolve the repo root generically (do **not** assume `/Users/<you>/Developer/allbrew`):
   ```bash
   REPO_ROOT=$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || echo "$HOME/Developer/allbrew")
   ```
   Maintainers: ensure the `allbrew-dogfood` branch exists and is up to date:
   ```bash
   git -C "$REPO_ROOT" fetch origin allbrew-dogfood
   git -C "$REPO_ROOT" branch --track allbrew-dogfood origin/allbrew-dogfood 2>/dev/null || true
   ```
4. Maintainers: load `GITHUB_TOKEN` from `.env` or environment without printing it. Contributors do **not** need a token (issue route) and only need one for the PR route.
5. Capture system info up front (this is what makes the report actionable):
   ```bash
   allbrew doctor --report "$RUN_DIR/diagnostic-report.md"
   ```
6. Initialize a run record:
   ```bash
   bun .agents/skills/monitored-install/scripts/init-run-record.mjs \
     --url "<url>" --slug "<slug>" --repo-root "$REPO_ROOT"
   ```
   Capture `RUN_DIR` and `RUN_ID` from output. The record now includes `host` (os/product/build/arch/node/bun) and `homebrew` (version, config, formulae, casks) metadata.

## Phase 1 — Independent agent classification

Same as `.agents/skills/monitored-install/SKILL.md` § Phase 1: form `expected` (generator, package/bin name, service) from the URL and README, write to `$RUN_DIR/agent-judgment.json`.

## Phase 2 — Baseline install attempt (Homebrew allbrew-dogfood, which provides `allbrew`)

1. Derive a slug and capture the attempt:
   ```bash
   allbrew "<url>" --name "<slug>" --verbose 2>&1 | tee "$RUN_DIR/allbrew-initial.log"
   ```
2. Record exit code, generator, formula/cask path, service, and failure class.
3. Update `$RUN_DIR/agent-judgment.json` → `codebaseObserved` and `$RUN_DIR/metadata.json` → `attempts`.

## Phase 3 — Service expectation vs allbrew-dogfood decision

Compare `agent_service_expectation` with the generated formula/cask. Same rules as `monitored-install`. Deltas go in `deltas[]`; write `$RUN_DIR/classifier-rule.mjs` when a generalizable rule is warranted.

## Phase 4 — Post-install verification

When install succeeds and Phase 3 passes:

```bash
brew list <name>
brew info <name>
which <bin>
<bin> --version
```

If verification fails, treat as `brew_fail` and continue to Phase 5.

## Phase 5 — Failure path: patch, capture, submit

Only enter this phase if the monitored install failed and a source fix is needed. A first-attempt successful install does not generate a patch or a dogfood release.

### 5a. Root-cause and fix on a disposable worktree from `main`

1. Reproduce locally against a **temp tap** using a worktree from `main`:
   ```bash
   TMP_TAP=$(mktemp -d)
   mkdir -p "$TMP_TAP/Formula" "$TMP_TAP/Casks"
   git -C "$REPO_ROOT" worktree add /tmp/allbrew-dogfood-wt main
   cd /tmp/allbrew-dogfood-wt
   bun run bin/allbrew.ts "<url>" --name "<slug>" --tap "$TMP_TAP" --verbose
   ```
2. Patch the source at the earliest wrong layer (same guidance as `monitored-install`).
3. `bun run check && bun run test`.
4. Confirm the temp tap formula installs:
   ```bash
   brew install --formula "$TMP_TAP/Formula/<name>.rb"
   ```

### 5b. Capture the patch artifact + run record

Generate the patch from the worktree so it is a clean diff against `main`. Persist it as a `patches/dogfood/` artifact and as a run record:

```bash
mkdir -p "$RUN_DIR/fix-package" "patches/dogfood"
git -C /tmp/allbrew-dogfood-wt diff > "$RUN_DIR/fix-package/fix.patch"
cp "$RUN_DIR/fix-package/fix.patch" "patches/dogfood/$RUN_ID.patch"
```

Write a short `$RUN_DIR/fix-package/FIX.md` summarizing the bug and the fix. Ensure `$RUN_DIR/diagnostic-report.md` (from Phase 0) is present — it carries the OS version, Homebrew version/state, allbrew version, and manifest list a maintainer needs to assess the fix.

### 5c. Maintainer path — apply to `allbrew-dogfood` and release

Maintainers only:

```bash
git -C "$REPO_ROOT" switch allbrew-dogfood
git -C "$REPO_ROOT" apply --check "patches/dogfood/$RUN_ID.patch" || {
  # if the patch does not apply cleanly, resolve manually and regenerate
  git -C "$REPO_ROOT" apply "patches/dogfood/$RUN_ID.patch" 2>&1 | tee "$RUN_DIR/fix-package/apply.log"
}
git -C "$REPO_ROOT" add -A
git -C "$REPO_ROOT" commit -m "dogfood: apply <run-id> patch for <name> (<failure-class>)"
git -C "$REPO_ROOT" push origin allbrew-dogfood
```

If the patch needs hand-editing to apply to `allbrew-dogfood` (e.g. because the branch already carries prior dogfood patches), edit on the branch directly, commit, then regenerate `patches/dogfood/$RUN_ID.patch` from the `main`-relative diff in the worktree so the artifact stays canonical.

Continue to Phase 6.

### 5d. Contributor path — submit a fork PR (or issue fallback)

Contributors (no push access) submit for review instead of pushing. This is the core "non-developers contribute their monitored experience" route.

1. **Fork and branch** (if GitHub auth/`gh` is available):
   ```bash
   gh repo fork tariqwest/allbrew --clone=false --remote 2>/dev/null || true
   # or manual: fork via the web UI, then:
   git -C "$REPO_ROOT" remote add fork https://github.com/<you>/allbrew.git 2>/dev/null || true
   git -C "$REPO_ROOT" checkout -b dogfood/<run-id> main
   git -C "$REPO_ROOT" add "patches/dogfood/$RUN_ID.patch" "$RUN_DIR/fix-package/FIX.md" "$RUN_DIR/fix-package/fix.patch"
   git -C "$REPO_ROOT" commit -m "dogfood(artifact): <run-id> patch for <name> (<failure-class>)"
   git -C "$REPO_ROOT" push fork dogfood/<run-id>
   ```
2. **Open a PR** against `tariqwest/allbrew` `main` (or `allbrew-dogfood`):
   ```bash
   gh pr create --base main --head "<you>:dogfood/<run-id>" \
     --title "dogfood: <name> (<failure-class>) — patch + run record" \
     --body "Generated by monitored-install-dogfood (contributor). See $RUN_DIR for full logs. Diagnostic: $(cat "$RUN_DIR/diagnostic-report.md")"
   ```
3. **Issue fallback** (no fork/PR access): emit a pre-filled issue with the artifacts attached. Compose the body from `$RUN_DIR/summary.md` + `$RUN_DIR/diagnostic-report.md` + `$RUN_DIR/fix-package/FIX.md`, and attach `patches/dogfood/$RUN_ID.patch` and `$RUN_DIR/allbrew-initial.log`. Open it:
   ```bash
   gh issue create --repo tariqwest/allbrew \
     --title "dogfood: <name> (<failure-class>) — contributed run" \
     --body-file "$RUN_DIR/summary.md" --label "dogfood"
   ```
   If `gh` is unavailable, print a self-contained bundle for the user to paste into a GitHub issue manually (patch + diagnostic report + summary).

4. **No `main` commits, no releases**: contributors never push to `origin` and never run Phase 6. The maintainer reviews the PR/issue, applies the patch to `allbrew-dogfood`, and releases.

## Phase 6 — Release allbrew-dogfood (maintainers only)

`scripts/release.ts` now performs this automatically after every `main` release. To release a dogfood build manually after applying a patch:

1. Choose the next version. The base `X.Y.Z` is the last `allbrew` tag on `main`; the dogfood counter `N` is the current count of dogfood-specific patches on the branch:
   ```bash
   BASE=$(git -C "$REPO_ROOT" describe --tags --abbrev=0 main)
   N=$(git -C "$REPO_ROOT" rev-list --count main..allbrew-dogfood)
   VERSION="${BASE#v}-dogfood.${N}"
   ```
2. Tag the tip of `allbrew-dogfood`:
   ```bash
   git -C "$REPO_ROOT" tag -a "v$VERSION" -m "dogfood v$VERSION"
   git -C "$REPO_ROOT" push origin "v$VERSION"
   ```
3. Compute the source tarball SHA-256 for the tap formula:
   ```bash
   curl -sL "https://github.com/tariqwest/allbrew/archive/refs/tags/v$VERSION.tar.gz" -o "/tmp/allbrew-dogfood-$VERSION.tar.gz"
   SHA=$(shasum -a 256 "/tmp/allbrew-dogfood-$VERSION.tar.gz" | awk '{print $1}')
   ```
4. Update `tariqwest/homebrew-tap/Formula/allbrew-dogfood.rb` (`url`, `sha256`, `version`), commit and push the tap.
5. Upgrade the dogfood CLI:
   ```bash
   brew update
   brew upgrade allbrew-dogfood || brew reinstall allbrew-dogfood
   allbrew --version
   ```

## Phase 7 — Retry and finalize

1. Re-run the same URL with `/opt/homebrew/bin/allbrew` (maintainers) and capture to `$RUN_DIR/allbrew-retry.log`.
2. On success, copy the final retry log to `$RUN_DIR/allbrew-final.log`, copy the generated tap formula/cask to `$RUN_DIR/formula.rb`, write `$RUN_DIR/summary.md`, and run the finalizer:
   ```bash
   bun .agents/skills/monitored-install/scripts/finalize-run-record.mjs \
     --run-dir "$RUN_DIR" \
     --status fixed_success \
     --failure-class brew_fail \
     --package-name "<name>" \
     --package-version "<ver>" \
     --package-kind formula \
     --verify-ok true \
     --release-tag "v$VERSION" \
     --allbrew-version-final "$(allbrew --version)"
   ```
3. Confirm `tests/monitored-install-runs/latest` and `index.jsonl`.

## Guardrails

- Never commit the actual code fix to `main` from this skill; only the patch artifact and run record go to `main` (and, for contributors, only via PR for review).
- Contributors never push to `origin` (the upstream repo); they use a fork PR or an issue.
- Never print `GITHUB_TOKEN` / `githubToken`.
- Never commit `.env` or config tokens. `allbrew doctor` redacts tokens/secrets in its report.
- Do not use `--service` / `--no-service` as the success path; auto-detect must be correct.
- Cap automated fix → release → retry loops at **2** per URL.
- Keep `allbrew-dogfood` patches tracked as files; do not let them live only in the branch history.
- Do not have `allbrew` and `allbrew-dogfood` installed at the same time; the formulae declare `conflicts_with` to prevent this. Use `allbrew --version` to verify the active package is the dogfood build.
- Always include the diagnostic report (`allbrew doctor`) in any submitted patch/PR/issue so a maintainer can assess the fix against the contributor's environment.
