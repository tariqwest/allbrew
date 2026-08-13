# Monitored-install-batch reconcile — updated 2026-08-12

> Integrate `fix-package/` patches from monitored-install-batch into `main` without bulk-am, without host live-patch during waves, and without regressions.

## Status (2026-08-12 evening — updated for 0.0.32)

| Milestone | State |
|-----------|--------|
| Bottle | **`0.0.32` released** (`cd54499` → `e1f7f29`, tag `v0.0.32`) — oatmeal/go2tv/gotify/elia/pyqt-openai |
| Bottle (prev) | `0.0.31` released `df0b0bb` (P0 category + first residual wave, `390eb89`) |
| P0 category product | **Landed** (install-script, prerelease, core API, binary-release, gem, pip seeds, cargo unlock, npm service) |
| Residual P0 patches | **Landed** in `390eb89` (starship `sh`, toolong `tl`, cargo reject-locked, verdaccio GH README, core third-party false positive) |
| Wave 2 product patches | **Landed & released in 0.0.32** (`cd54499`): oatmeal binary prefer, go2tv app-peek cask route, gotify product-cli bin, elia tap trust, pyqt-openai python@ requires_python + portaudio |
| Infra wave 2026-08-12T21:29Z | **0/10** on `0.0.31` bottle (`72134e1`) — 6 skipped (marketing/404) + 4 product fails (ugm/electrum/tes3edit/dotnet-counters); reclassified as product/catalog, not host hygiene |
| Permanent skips | **4 applied** (`ecf8e1e`): ugm, electrum, tes3edit, dotnet-counters (`permanentSkip:true`, `permanent_catalog_skip`); queue `643/20/85/19/0` |
| Cold smoke 0.0.31 | **6/6 green** (verdaccio after link residual retry) |
| Cold smoke 0.0.32 | **Required before next release** — sample oatmeal/go2tv/pyqt-openai/gotify/elia (bottle-only, 1/generator group) |
| Full 213-archive bulk merge | **Not done** (superseded by selective high-value integration; archive remains in `~/.cache/allbrew/batch-artifacts/2026-08-10/`) |

### Already on `main` (do not re-apply)

| Area | Evidence |
|------|----------|
| install-script FORCE/BIN_DIR/`sh`/`-y` | `390eb89`, templates |
| cargo unlock | reject `--locked` |
| pip undeclared + force-link bin | `d857e25`+ |
| gem native + library mode | `5ee2778` |
| binary-release entrypoint/docs refuse | `70488f6` |
| GitHub prerelease fallback | `73a6189` |
| core collision API + third-party reject | `19b1fc5`, `390eb89` |
| npm service + GH README fallback | `bb1ae28`, `390eb89` |

### This execute (applied cleanly via `git apply --3way`)

| Slug | Patch | Product effect |
|------|-------|----------------|
| oatmeal | `oatmeal-20260812T191623Z.patch` | crates.io → GitHub macOS arm binary-release when available |
| go2tv | `go2tv-20260812T191231Z.patch` | Peek macOS zip for `.app` → cask-app-release; refuse `.app` as binary-release |
| gotify | `gotify-binname-product-cli-*.patch` | bare `*-cli` assets → product bin name |
| elia | `elia-*-tap-trust.patch` | `HOMEBREW_NO_REQUIRE_TAP_TRUST` in auto-install path |
| pyqt-openai | `pyqt-openai-20260812T184429Z.patch` | `selectPipFormulaPython` / `RESOURCE_SYSTEM_DEPS` (portaudio) / dynamic `python@X.Y` |

### Deferred / do not bulk-merge

| Class | Why |
|-------|-----|
| Permanent skips (ugm, electrum, tes3edit, dotnet-counters, nix, brew.sh cask URLs, marketing) | Catalog out-of-scope — see `failed-queue-remaining-2026-08-12.md` |
| MAS Apple-ID apps (bear, …) | env_fail without `mas signin` — selection fixes only |
| Overlapping stale patches vs already-landed hunks | `git apply --check` fails; treat as superseded |
| Full 213-archive fan-out | Diminishing returns; selective product fixes + bottle release preferred |

## Goals

- Distinct new scenarios merged as minimal typed product changes
- Gate: `bun run check`, targeted unit tests, `bun run test:templates`
- **Mandatory** VM cold smoke (bottle-only, 1/generator group) before next release — red blocks release

## Non-goals

- No bulk `git am` of 213 patches onto `main`
- No `bun run release` from batch children
- No host `brew install` as success path

## Strategy (current)

### 1. Prefer product reimplementation / clean apply over worktree promote

```bash
# Inventory applyability
for p in tests/monitored-install-batch/fix-packages/<slug>/patches/*.patch; do
  git apply --check "$p" && echo CLEAN $p || echo FAIL $p
done
# Apply only CLEAN product patches (lib/ + tests/unit)
git apply --3way path/to/clean.patch
bun run check && bun run test:templates && bun test ./tests/unit/...
```

### 2. When conflicts: hand-port FIX.md root cause into main

Read `FIX.md` + patch hunks; land minimal equivalent (as done for P0 residuals). Preserve tests from patch when possible.

### 3. Archive hygiene

```bash
bun scripts/archive-batch-artifacts.mjs --dry-run
# after large waves:
bun scripts/archive-batch-artifacts.mjs --verify --prune-move
```

### 4. Release after product land

```bash
# clean tree required
GITHUB_TOKEN=… bun run release patch
brew update && brew upgrade allbrew && allbrew --version
```

### 5. Cold smoke sample (bottle only)

```bash
# no --allbrew-src
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url <url> --name <slug> --log /tmp/<slug>.log
```

Suggested sample after next release: oatmeal, go2tv, pyqt-openai, gotify, elia (plus prior 6/6 set).

## Verification gates

| Gate | When |
|------|------|
| `bun run check` | every land |
| `bun run test:templates` | every land |
| Targeted unit tests for touched generators | every land |
| Full `bun test ./tests/unit` | before release |
| VM cold smoke 1/generator group | after release |

## Risks

- **Same-file hunk drift** after 0.0.31 — prefer `--3way` or hand-port
- **guest-ops patches** mixed into product patches — already partly on main; re-apply carefully
- **MAS/env** — never gate product on headless `mas signin`

## Files

- Plan companion: `failed-queue-remaining-2026-08-12.md`, `failed-queue-category-fixes-2026-08-12.md`
- Archive: `tests/monitored-install-batch/archive/manifest.json` → `~/.cache/allbrew/batch-artifacts/2026-08-10/`
- Tools: `reconcile-fix-packages.mjs`, `batch-ops.mjs`, `vm-install-one.mjs`
