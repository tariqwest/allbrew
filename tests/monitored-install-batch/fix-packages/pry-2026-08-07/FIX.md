# Fix package: pry

## URL
https://github.com/pry/pry

## Failure class
`generate_fail` / wrong generator (source-build with make instead of gem-package)

## Mode
patch

## Summary
Pry is a Ruby REPL published as the `pry` gem. README documents `gem install pry` and the repo has `pry.gemspec`. allbrew ignored both and defaulted to source-build `make install`, producing a broken formula (GitHub tarball + make) and host/VM brew install failure.

Service: **false** (interactive CLI/REPL).

## Root cause
1. `detectInstallMethod` had no `gem install` README pattern (npm/pip/cargo/go present; gem missing).
2. `detectBuildSystemFromFiles` did not treat root `*.gemspec` as a gem install signal.
3. `cli.ts` GitHub analysis switch had no `case "gem"` → never routed to `gem-package`.

## Fix
- `lib/analyzer.ts`: `GEM_INSTALL_RE` + method `gem`; gemspec in `detectBuildSystemFromFiles`.
- `lib/cli.ts`: route `gem` → `gem-package` (README path and file path).
- Unit tests for both.

## Local validation (worktree)
- Generator: **gem-package**
- Version: **0.16.0**, url `https://rubygems.org/gems/pry-0.16.0.gem`
- Service: none
- Formula installs via `gem install pry` into Cellar GEM_HOME

## No release (child policy)
Option A only — stock guest allbrew will still mis-generate until parent reconciles/releases.
