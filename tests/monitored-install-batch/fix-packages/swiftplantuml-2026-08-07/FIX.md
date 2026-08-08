# swiftplantuml fix-package

## Problem
`detectBrewInstall` finds `brew install swiftplantuml` (homebrew/core). Interactive `select()` always runs, ignoring `CI` / `ALLBREW_NONINTERACTIVE` / non-TTY. Batch/VM installs hang (`prompt_hang`) or cannot generate a tap formula.

## Fix
In `lib/cli.ts` when brew is already available: if `isNonInteractive(opts)`, log and **continue** generating a custom formula (do not auto-run host `brew install`, which skips tap write + manifest and breaks batch verify).

## Observed generation (post-fix, local)
- Generator: source-build via Makefile (`make PREFIX=… install` → `swift build -c release`)
- Name collision with homebrew/core → `swiftplantuml-tap`
- Service: false (one-shot CLI)
- Release 0.8.1, tarball URL + sha256

## Residual
- Prefer `spm-package` / `mint-package` over Makefile path may still be better product choice (delta vs agent expectation).
- Host `brew install` of generated make formula failed (non-Tier-1 / build); VM verification still required with released allbrew containing this noninteractive fix.
- Without release, stock VM allbrew still hangs on brew-available prompt.

## No release (child policy)
Option A only.
