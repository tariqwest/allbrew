# FIX: SDKMAN (`https://get.sdkman.io`)

## Case
Official SDKMAN bootstrap URL. Installs under `$HOME/.sdkman` (or `SDKMAN_DIR`), patches shell rc files, requires Bash 4+. No homebrew/core formula.

## Failures observed (allbrew main)
1. `classify` offline: `unknown` (path `/`, no `.sh`).
2. `classifyWithHead`: HEAD `Content-Type: text/plain` only matches `text/x-shellscript` / `application/x-sh` → stays `unknown`.
3. Page discovery WebView promotes unrelated links (apache license, discord, api host).
4. Outcome: opaque `generate_fail` ("Unable to automatically handle URL").

## Agent judgment
| Field | Value |
|-------|--------|
| inputShape | bash-install-script / sdkman bootstrap |
| expected.generator | install-script then **reject** as home-dir OOS |
| expected.service | **false** |
| installPossible via install-script wrap | **false** |

## Fix (batch Option A — no release)
1. **`lib/classifier.ts`** — body shebang sniff for `text/plain` (and `/install` path fallback) → `bash-script`.
2. **`lib/install-script-analyze.ts`** — detect SDKMAN (`get.sdkman.io` / `SDKMAN_DIR` + `sdkman-init.sh`); `packageHint` → `sdkman`; kind `home-dir-installer`.
3. **`lib/cli.ts` `handleBashScript`** — on home-dir/OOS/appstore, Case C via `resolveExistingHomebrewClassification` when core/cask exists; else clear error (SDKMAN has no core formula).
4. **`lib/utils.ts`** — `resolveExistingHomebrewClassification`.
5. Unit tests `tests/unit/sdkman-install-script.test.ts`.

## Validation (worktree `worktrees/sdkman-2026-08-08`)
```bash
bun test tests/unit/sdkman-install-script.test.ts  # 4 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://get.sdkman.io" --name sdkman --tap "$(mktemp -d)" --verbose
# → Classified bash-script; clear home-dir OOS error (no formula written)
```

## Residual risk
- Full green install is **not** possible: SDKMAN is intentionally out of scope for Cellar PREFIX packaging until/unless an official Homebrew formula appears.
- Released bottle still classifies `unknown` until parent reconciles + release.
- Bash 3.2 on macOS would fail even a naive install-script wrap.
