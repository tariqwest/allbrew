# FIX: tailscale install.sh (`https://tailscale.com/install.sh`)

## Case
Official multi-OS vendor install script. macOS branch only `open`s the Mac App Store (`PACKAGETYPE=appstore`, id `1475387142`). Linux uses apt/dnf/etc. Script never honors `PREFIX`/`DESTDIR`.

## Phase 0.5 judgment
| Field | Value |
|-------|--------|
| inputShape | `bash-script` / vendor install.sh |
| expected.generator | Prefer **homebrew-formula** `tailscale` (Case C) over install-script wrap |
| expected.service | **true** — `run opt_bin/"tailscaled"` (official core formula) |
| agent_service_expectation | true (mesh VPN daemon) |

## Failures observed (allbrew **0.0.24**)
1. Classified `bash-script` → generated **install-script** formula `tailscale-tap` (core name collision).
2. Formula ran `bash install.sh` with `PREFIX=cellar` → macOS path opens App Store → **Empty installation**.
3. Host temp-tap brew install failed: `Error: Empty installation`.
4. VM helper: local endpoints SSH unavailable; homeserver mutex held by other batch jobs — product failure proven via local generate.

## Root cause
1. No analysis of install-script body for App Store-only / distro-PM installers.
2. No Case C redirect when wrapping such a script would never populate Cellar, despite healthy homebrew/core `tailscale`.
3. Related: homebrew-formula bottle injector double-colons cellar (`::any_skip_relocation`) when API already includes `:`.

## Fix (batch Option A — no release)
1. **`lib/install-script-analyze.ts`** — detect `appstore-macos-only`, nix/homebrew OOS, distro PM installers; `packageHintFromInstallUrl`.
2. **`lib/cli.ts` `handleBashScript`** — fetch body; on OOS/appstore, `resolveExistingHomebrewClassification` → homebrew-formula/cask; else MAS id fallback; else clear error.
3. **`lib/utils.ts`** — `resolveExistingHomebrewClassification` (core preferred over cask).
4. **`lib/generators/homebrew-formula.ts`** — `formatBottleCellar` / safe bottle symbols.
5. Unit tests in `tests/unit/install-script-analyze-tailscale.test.ts`.

## Validation (worktree `worktrees/tailscale-install-sh-2026-08-07`)
```bash
bun test tests/unit/install-script-analyze-tailscale.test.ts  # 5 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://tailscale.com/install.sh" --name tailscale --tap "$(mktemp -d)" --verbose
# → Case C formula "tailscale", service do, bottle cellar :any_skip_relocation (not ::)
# host brew install succeeded then was uninstalled (isolation: not success path)
```

## Residual risk
- Full green path needs parent integrate + release + VM bottle upgrade; released 0.0.24 still Empty-installation.
- Case C prefers **formula** `tailscale` (CLI/daemon), not cask `tailscale-app` (GUI pkg). GUI users want `tailscale-app`.
- VPN/network extension / `brew services` root caveats not exercised in unit tests.
- VM pool SSH/mutex may still block post-release verify until harness healthy.
