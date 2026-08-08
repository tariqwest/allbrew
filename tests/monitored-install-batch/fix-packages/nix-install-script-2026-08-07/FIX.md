# FIX: nix official installer (`https://nixos.org/nix/install`)

## Case
Official multi-user Nix install script (not `formulae.brew.sh/formula/nix`).

## Reality check (Phase 0.5)
- URL 302 → `https://releases.nixos.org/nix/nix-*/install` (`Content-Type: text/plain`, shebang `#!/bin/sh`).
- Script downloads platform tarballs and runs nested installer that **populates `/nix`** and multi-user **nix-daemon**.
- **Not** Cellar/`PREFIX`-compatible. Homebrew core has **no** `nix` formula (API 404).
- **Judgment:** shape is `bash-script` → install-script, but packaging is **out of scope** for allbrew. Do not invent archive/`$system` downloads or monorepo source-build.

## Failures observed (released / main)
1. `classify` offline: `unknown` (path `/nix/install`, no `.sh`).
2. `classifyWithHead`: HEAD `text/plain` only matches `text/x-shellscript` / `application/x-sh` → stays `unknown`.
3. Page discovery (WebView) promotes literal template URL  
   `https://releases.nixos.org/nix/nix-2.35.1/nix-2.35.1-$system.tar.xz` → **HTTP 404**.
4. Outcome: opaque `generate_fail` (archive download), no formula written.

## Agent judgment
| Field | Value |
|-------|--------|
| inputShape | install-script-url / official multi-user nix |
| expected.generator | install-script (then **reject** as system-wide OOS) |
| expected.service | true (`nix-daemon`) if a formula ever existed — **not** applicable once OOS |
| installPossible | **false** |

## Fixes (worktree `worktrees/nix-2026-08-07`, batch mode — not released)
1. **`lib/classifier.ts`** — body shebang sniff for `text/plain` (and `/install` path fallback) → `bash-script`.
2. **`lib/page-discover.ts` + `page-discover-webview.ts`** — drop URLs with unexpanded `$system` / `${…}` placeholders; score them −1000.
3. **`lib/install-script-analyze.ts`** + **`handleBashScript`** — detect official Nix multi-user installer; throw clear out-of-scope error (no PREFIX formula).
4. **Unit tests** `tests/unit/nix-install-script.test.ts`.

## Validation
- Unit: 4/4 pass in worktree.
- Local generate after fix: classifies `bash-script`, exit 1 with clear OOS message (no `$system` 404).
- VM: attempted; pool contention / sparsebundle attach issues — baseline of bottle still expected generate_fail on `$system` until release.

## Residual risk
- Other system-wide installers (e.g. rustup multi-user, custom `/opt` daemons) may need more signals in `analyzeInstallScript`.
- True Nix packaging for Homebrew remains out of scope; users must use upstream installer.
