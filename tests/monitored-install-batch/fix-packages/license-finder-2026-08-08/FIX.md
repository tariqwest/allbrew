# FIX: license-finder (pivotal/LicenseFinder)

## URL
https://github.com/pivotal/LicenseFinder

## Failure class
**generate_fail** / wrong generator: GitHub README documents `gem install license_finder`, but `detectInstallMethod` had no `gem install` matcher and `detectBuildSystemFromFiles` ignored `*.gemspec`. Fallback produced **source-build** with `make install` + GitHub tarball — install fails / wrong package shape.

## Expected path
- Generator: **gem-package**
- gemName: **license_finder** (RubyGems)
- formulaName: license-finder
- bin: **license_finder** (not hyphenated formula token)
- service: **false** (one-shot CLI license audit)

## Root cause
1. `lib/analyzer.ts` `detectInstallMethod` covered npm/pip/cargo/go/dotnet but not `gem install`.
2. `detectBuildSystemFromFiles` did not treat root `*.gemspec` as gem.
3. `lib/cli.ts` had no `case "gem"` on README or file-based install routing.
4. Gem formula test defaulted `testBinName` to hyphenated formula name.

## Fix (Option A — no release)
1. `GEM_INSTALL_RE` + `method: "gem"` in `detectInstallMethod`.
2. Root `*.gemspec` → `{ method: "gem", package: <basename> }` before Makefile.
3. `cli.ts` README + file branches route to `gem-package`.
4. `gem-package.ts` `testBinName` defaults to `gemName`.
5. Unit tests for gem install + gemspec file detection.

## Validation (local worktree / dirty main)
```bash
bun test tests/unit/analyzer.test.ts --test-name-pattern "gem"  # pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://github.com/pivotal/LicenseFinder" --name license-finder --tap "$(mktemp -d)" --verbose
# → Detected install method: gem (license_finder)
# → rubygems.org/gems/license_finder-7.2.1.gem, depends_on "ruby", no service block
```

## VM with brew allbrew (unpatched)
Expected still **generate_fail** / wrong source-build until patch is reconciled/released.
