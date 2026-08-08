# FIX: Official Homebrew bootstrap (`Homebrew/install` install.sh)

## Case
URL: `https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh`  
Slug: `homebrew` · idx 372 · batch monitored install

## Reality check (Phase 0.5)
- Content-Type `text/plain`; shebang `#!/bin/bash`.
- Script is the **official Homebrew bootstrap**: writes `/opt/homebrew` or `/usr/local`, clones `Homebrew/brew`, often needs sudo / NONINTERACTIVE.
- **Not** Cellar/`PREFIX`-compatible. Packaging it as a formula is **meta-recursive** (allbrew and the generated formula require an already-working `brew`).
- **Judgment:** shape is `bash-script` → install-script generator, but packaging is **out of scope**. Do not invent binary-release/source-build for brew itself.

## Failures observed (main / released)
1. Classifier correctly: `bash-script`.
2. Generator writes formula with `version "0.0.1"`, runs `system "bash", cached_download` with `ENV["PREFIX"]=prefix` — installer ignores PREFIX and targets system Homebrew paths.
3. Host temp-tap: formula written; `brew install` fails (build failure / expected non-Tier-1 noise).
4. Generated test expects `#{bin}/homebrew --version` — wrong binary name even if install partially succeeded (`brew` not `homebrew`).
5. VM helper: pool contention / SSH unavailable on local-1; product failure already proven via local generate.

## Agent judgment
| Field | Value |
|-------|--------|
| inputShape | bash-script / official Homebrew bootstrap |
| expected.generator | install-script then **reject** as system-wide OOS |
| expected.service | false |
| installPossible | **false** |

## Fixes (batch mode — fix-package only, not released)
1. **New `lib/install-script-analyze.ts`** — detect Homebrew/install URL + bootstrap body signals; also retain Nix multi-user OOS (see sibling fix-package).
2. **`lib/generators/install-script.ts` / `handleBashScript`** — `assertInstallScriptInScope` before writing formula.
3. **Unit tests** `tests/unit/homebrew-install-script.test.ts` (copy from fix-package tests).

## Validation
- Unit: analyzeInstallScript + assert throw on HB fixture; prefix-ok on ordinary script.
- Local generate after fix: should exit non-zero with clear OOS message (no formula, no brew install attempt).
- VM: not required for OOS product path once generate rejects; attempted but endpoint SSH/lock failures.

## Residual risk
- Other system package-manager bootstraps (MacPorts, pkgsrc, Conda miniconda installer) may need similar signals.
- Users who truly want “install Homebrew” must use https://brew.sh upstream — allbrew must not claim success.
