---
name: monitored-install-dogfood
description: This skill should be used when the user asks to "dogfood install with allbrew", "monitored allbrew dogfood install", "troubleshoot allbrew dogfood", or wants a URL driven through the `allbrew-dogfood` Homebrew formula with fixes captured as patches, applied to the `allbrew-dogfood` branch, and released as a separate tap formula. Treats the dogfood branch as a long-lived sandbox where fixes are staged before being proposed back to `main`.
metadata:
  version: "1.0"
---

# Monitored allbrew dogfood install

Drive a single URL through the **Homebrew-installed `allbrew-dogfood` package**, which provides the same `allbrew` command as the canonical build. Verify the resulting formula/cask install, and — on failure — capture the fix as a patch artifact, apply it to the `allbrew-dogfood` branch, release a new `allbrew-dogfood` version to the Homebrew tap, and retry.

`allbrew-dogfood` and `allbrew` are mutually exclusive: both install `/opt/homebrew/bin/allbrew`, so Homebrew will refuse to install one while the other is present.

This skill intentionally does **not** commit fixes to `main` or drive the canonical `allbrew` release. Patches live on the `allbrew-dogfood` branch and can later be cherry-picked / PR'd back to `main` when proven stable.

Run records still live under `tests/monitored-install-runs/` so the same flat-file dogfood corpus is available for later promotion.

## Inputs

| Input | Required | Notes |
|-------|----------|-------|
| `url` | yes | GitHub repo, registry page, DMG/ZIP URL, MAS/Setapp link, or install-script URL |
| `name` | no | Formula/cask name override (`--name`) |
| `package` | no | Registry package name override (`--package` / crate / gem / go module) |
| `expect` | no | Expected binary name or app bundle for post-install checks |

Work from the allbrew repo root. Use `/opt/homebrew/bin/allbrew` for user-facing install attempts. Use a temp tap for local validation of an unreleased dogfood patch (`bun run bin/allbrew.ts --tap "$TMP_TAP"`) only when proving a source fix before it lands on the `allbrew-dogfood` branch.

**Service blocks:** do **not** pass `--service` or `--no-service`. `allbrew-dogfood` must auto-detect whether a Homebrew `service` stanza is appropriate.

## Dogfood branch and tap layout

- **Source branch:** `allbrew-dogfood` on `github.com/tariqwest/allbrew` — long-lived, diverges from `main` with accumulated patches.
- **Patch artifacts:** one `.patch` per failure under `patches/dogfood/<run-id>/` in the `allbrew-dogfood` branch. Also keep a copy in `tests/monitored-install-runs/<run-id>/fix-package/`.
- **Homebrew formula:** `tariqwest/homebrew-tap/Formula/allbrew-dogfood.rb` — a sibling to `allbrew.rb`.
- **Dogfood CLI:** `/opt/homebrew/bin/allbrew`.
- **Versioning:** semantically `X.Y.Z-dogfood.N` (e.g. `0.0.37-dogfood.1`). The base `X.Y.Z` tracks the last merged `main` tag; `N` is the dogfood patch counter.

## Success criteria

Stop when:

1. `allbrew <url> …` exits 0 and writes a formula/cask into the configured tap. On the first successful run, **do not** generate a patch, do not touch the `allbrew-dogfood` branch, and do not release.
2. `brew install` / `allbrew` auto-install succeeds.
3. Post-install verification passes.
4. Agent service expectation matches `allbrew` service decision.
5. If a code fix was required: the fix is committed to the `allbrew-dogfood` branch, a new `allbrew-dogfood` tag is released, the tap formula is updated, and the final retry with `/opt/homebrew/bin/allbrew` passes.
6. A run record exists under `tests/monitored-install-runs/<run-id>/` with judgment, outcome, logs, and `index.jsonl` entry.

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
   # expect tapPath → homebrew-allbrew
   ```
3. Ensure the `allbrew-dogfood` branch exists and is up to date:
   ```bash
   git fetch origin allbrew-dogfood
   git -C /Users/tariqwest/Developer/allbrew branch --track allbrew-dogfood origin/allbrew-dogfood 2>/dev/null || true
   ```
4. Load `GITHUB_TOKEN` from `.env` or environment without printing it.
5. Initialize a run record:
   ```bash
   bun .agents/skills/monitored-install/scripts/init-run-record.mjs \
     --url "<url>" --slug "<slug>"
   ```
   Capture `RUN_DIR` and `RUN_ID` from output.

## Phase 1 — Independent agent classification

Same as `.agents/skills/monitored-install/SKILL.md` § Phase 1: form `expected` (generator, package/bin name, service) from the URL and README, write to `$RUN_DIR/agent-judgment.json`.

## Phase 2 — Baseline install attempt (Homebrew allbrew-dogfood, which provides `allbrew`)

1. Derive a slug and capture the attempt:
   ```bash
   /opt/homebrew/bin/allbrew "<url>" --name "<slug>" --verbose 2>&1 | tee "$RUN_DIR/allbrew-initial.log"
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

## Phase 5 — Failure path: patch, branch fix, no `main` release

Only enter this phase if the monitored install failed and the agent must fix allbrew source to make it succeed. A first-attempt successful install does not generate a patch or a dogfood release.

Do **not** apply the fix to `main` or release the canonical `allbrew` package from a dogfood run.

### 5a. Root-cause and fix on a disposable worktree from `main`

1. Reproduce locally against a **temp tap** using a worktree from `main`:
   ```bash
   TMP_TAP=$(mktemp -d)
   mkdir -p "$TMP_TAP/Formula" "$TMP_TAP/Casks"
   git -C /Users/tariqwest/Developer/allbrew worktree add /tmp/allbrew-dogfood-wt main
   cd /tmp/allbrew-dogfood-wt
   bun run bin/allbrew.ts "<url>" --name "<slug>" --tap "$TMP_TAP" --verbose
   ```
2. Patch the source at the earliest wrong layer (same guidance as `monitored-install`).
3. `bun run check && bun run test`.
4. Confirm the temp tap formula installs:
   ```bash
   brew install --formula "$TMP_TAP/Formula/<name>.rb"
   ```

### 5b. Capture and commit the patch artifact to `main`

Generate the patch from the worktree so it is a clean diff against `main`. Persist it as a `patches/dogfood/` artifact and as a run record:

```bash
mkdir -p "$RUN_DIR/fix-package" "patches/dogfood"
git -C /tmp/allbrew-dogfood-wt diff > "$RUN_DIR/fix-package/fix.patch"
cp "$RUN_DIR/fix-package/fix.patch" "patches/dogfood/$RUN_ID.patch"
```

Also write a short `$RUN_DIR/fix-package/FIX.md` summarizing the bug and the fix.

Commit the patch artifact to `main` immediately so it is available for later review or PR:

```bash
git -C /Users/tariqwest/Developer/allbrew switch main
git -C /Users/tariqwest/Developer/allbrew add "patches/dogfood/$RUN_ID.patch" "$RUN_DIR/fix-package/FIX.md"
git -C /Users/tariqwest/Developer/allbrew commit -m "dogfood(artifact): <run-id> patch for <name> (<failure-class>)"
git -C /Users/tariqwest/Developer/allbrew push origin main
```

### 5c. Apply the patch to the `allbrew-dogfood` branch

```bash
git -C /Users/tariqwest/Developer/allbrew switch allbrew-dogfood
git -C /Users/tariqwest/Developer/allbrew apply --check "patches/dogfood/$RUN_ID.patch" || {
  # if the patch does not apply cleanly, resolve manually and regenerate
  git -C /Users/tariqwest/Developer/allbrew apply "patches/dogfood/$RUN_ID.patch" 2>&1 | tee "$RUN_DIR/fix-package/apply.log"
}
git -C /Users/tariqwest/Developer/allbrew add -A
git -C /Users/tariqwest/Developer/allbrew commit -m "dogfood: apply <run-id> patch for <name> (<failure-class>)"
git -C /Users/tariqwest/Developer/allbrew push origin allbrew-dogfood
```

If the patch needs hand-editing to apply to `allbrew-dogfood` (e.g. because the branch already carries prior dogfood patches), edit on the branch directly, commit, then regenerate `patches/dogfood/$RUN_ID.patch` from the `main`-relative diff in the worktree so the artifact stays canonical.

## Phase 6 — Release allbrew-dogfood

1. Choose the next version. The base `X.Y.Z` is the last `allbrew` tag on `main`; the dogfood counter `N` is the current count of dogfood-specific patches on the branch:
   ```bash
   BASE=$(git -C /Users/tariqwest/Developer/allbrew describe --tags --abbrev=0 main)
   N=$(git -C /Users/tariqwest/Developer/allbrew rev-list --count main..allbrew-dogfood)
   VERSION="${BASE#v}-dogfood.${N}"
   ```
2. Tag the tip of `allbrew-dogfood`:
   ```bash
   git -C /Users/tariqwest/Developer/allbrew tag -a "v$VERSION" -m "dogfood v$VERSION"
   git -C /Users/tariqwest/Developer/allbrew push origin "v$VERSION"
   ```
3. Compute the source tarball SHA-256 for the tap formula:
   ```bash
   curl -sL "https://github.com/tariqwest/allbrew/archive/refs/tags/v$VERSION.tar.gz" -o "/tmp/allbrew-dogfood-$VERSION.tar.gz"
   SHA=$(shasum -a 256 "/tmp/allbrew-dogfood-$VERSION.tar.gz" | awk '{print $1}')
   ```
4. Update `tariqwest/homebrew-tap/Formula/allbrew-dogfood.rb`:
   - `url` → `https://github.com/tariqwest/allbrew/archive/refs/tags/v#{version}.tar.gz` (or the literal `v$VERSION` URL)
   - `sha256` → the computed SHA
   - `version "X.Y.Z-dogfood.N"`
5. Commit and push the formula:
   ```bash
   git -C /opt/homebrew/Library/Taps/tariqwest/homebrew-tap commit -a -m "allbrew-dogfood $VERSION"
   git -C /opt/homebrew/Library/Taps/tariqwest/homebrew-tap push origin main
   ```
6. Upgrade the dogfood CLI:
   ```bash
   brew update
   brew upgrade allbrew-dogfood || brew reinstall allbrew-dogfood
   allbrew --version
   ```

## Phase 7 — Retry and finalize

1. Re-run the same URL with `/opt/homebrew/bin/allbrew` and capture to `$RUN_DIR/allbrew-retry.log`.
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

- Never commit the actual code fix to `main` from this skill; only the patch artifact and run record go to `main`.
- Never print `GITHUB_TOKEN` / `githubToken`.
- Never commit `.env` or config tokens.
- Do not use `--service` / `--no-service` as the success path; auto-detect must be correct.
- Cap automated fix → release → retry loops at **2** per URL.
- Keep `allbrew-dogfood` patches tracked as files; do not let them live only in the branch history.
- Do not have `allbrew` and `allbrew-dogfood` installed at the same time; the formulae declare `conflicts_with` to prevent this. Use `allbrew --version` to verify the active package is the dogfood build.
