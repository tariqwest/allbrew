# reveal-md service false positive

## Failure
- Generator: npm-package (correct)
- Formula renamed to `reveal-md-tap` (collides with homebrew/core `reveal-md`)
- **service_mismatch**: agent expects `service: false`; allbrew emitted `service do; run "reveal-md"; keep_alive true` at high confidence

## Root cause
`detectPortBoundPackageService` treated optional README `--port` docs on a **file-arg presentation CLI** as a supervised port-bound daemon. Bare `reveal-md` (directory listing) + `reveal-md slides.md --port 8888` triggered high-confidence service.

## Fix
`lib/analyzer.ts`: add `isFileArgDrivenPackageCli()` — when a majority of documented package invocations take a path/file positional, skip both port-bound and local-web service detection. Unit test for reveal-md-shaped README.

## Validation
- `bun test tests/unit/analyzer.test.ts` (reveal-md case + acp-router/maildev regression)
- Local temp-tap generate: no `service do` block
- VM install: attempted; pool endpoints degraded (SSH / sparsebundle) — re-run when VMs healthy

## Mode
`patch` — apply patches under worktree; no release (batch child policy)
