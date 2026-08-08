# Fix package: bartycrouch

## URL
https://github.com/FlineDev/BartyCrouch

## Failure class
`prompt_hang` (primary); residual `brew_fail` / core-duplication risk after guard

## Mode
code (patch)

## Summary
Swift CLI (Package.swift, executable `bartycrouch`). Service: false (one-shot init/update/lint).
Already in **homebrew/core** (`brew install bartycrouch`, bottled 4.15.1). README also documents Mint.

Non-interactive / CI / VM (`ALLBREW_NONINTERACTIVE=1`) hits `detectBrewInstall` then an **unguarded** `@inquirer/prompts` `select`, which hangs or ExitPromptError — never reaches a generator. Same bug as frogmouth/netbar runs.

## Root cause
`lib/cli.ts` `handleGithubRepo` after README fetch:

```ts
const choice = await select({ ... brew-install | continue ...});
```

Other selects in the file already use `if (isNonInteractive(opts)) { default } else { await select }`.

## Fix
When `isNonInteractive(opts)`, set `choice = "continue"`, log:
`Non-interactive: generating custom formula (skipping upstream brew offer).`
Fall through to normal SPM detection.

## Local validation (worktree)
With patch applied:
- Classified github-repo
- Skipped prompt
- Detected build system: swift, SPM executables: bartycrouch
- Name collision with core → formula **bartycrouch-tap**
- Generator: **spm-package** (swift build release)
- Formula written successfully
- Host `brew install bartycrouch-tap` then compiles from source (long / may fail without full Xcode); not required for generation fix proof

## VM note
Guest runs brew-installed allbrew **0.0.24** without this patch → still `prompt_hang` until reconcile/release.
Batch mode: no auto-release.

## Residual risk
- Core package still generates a **duplicate** formula (`bartycrouch-tap`) instead of short-circuiting to core.
- SPM source build is heavy vs bottled core; monitored verify may `brew_fail` after hang is fixed.
- Prefer longer-term: non-int short-circuit result kind for healthy core packages (MANIFEST optional / VERIFY via core name).
