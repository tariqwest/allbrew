## Failure class
brew_fail (BIN_MISSING) — library gem with no executables incorrectly generates binary test and fails verifier.

## Root cause
`lib/generators/gem-package.ts` and `lib/templates/formula/gem-package.ts` assumed every gem has a binary matching gemName (`testBinName = gemName`, `shell_output("#{bin}/#{testBinName} --version")`). `geminabox` gem's `metadata.gz` has `executables: []` — it provides only a `gem inabox` RubyGems plugin, not a standalone bin. The template never handled no-bin gems. Verifier strict BIN_MISSING caused VERIFY_OK=false despite successful `brew install`.

Classifier and analyzer correctly map `https://rubygems.org/gems/geminabox` → `gem-package` via rubygems regex; no classifier fix needed. Service false is correct (Sinatra Rack app served via rackup/passenger, not brew services).

## Fix (worktree $WT, not host main)
Branch `agent/geminabox-20260810T210443Z` under `tests/monitored-install-batch/worktrees/geminabox-20260810T210443Z` — patch exported as `patches/geminabox-gem-no-executable.patch`:

- `lib/template-payload.ts`: add `testCommand: string` to `GemPackagePayload`.
- `lib/generators/gem-package.ts`: add `fetchGemExecutables()` (download .gem, `tar -xzf`, gunzip `metadata.gz`, parse `executables:` YAML array). If executables exist, `testCommand = shell_output("#{bin}/<bin> --version")`; else `shell_output("GEM_HOME=#{libexec} ruby -r <require> -e \"puts Gem.loaded_specs['<gem>'].version\"")` with `requireName = gemName.replace(/-/g, "/")`. Fallback preserves original behavior on fetch failure.
- `lib/templates/formula/gem-package.ts`: render `${p.testCommand}` instead of hardcoded `shell_output("#{bin}/${p.testBinName} --version")`.

## Validation
- `bun run check` in WT: pass (tsc --noEmit).
- `bun test tests/unit/generators/gem-package.test.ts` in WT: 19 pass (existing mocked tests cover bin path).
- Template rendering validated offline: geminabox with `executables: []` → `GEM_HOME=... ruby -r geminabox -e "puts Gem.loaded_specs['geminabox'].version"`; gem with executables → `#{bin}/pry --version` preserved.
- VM baseline (local-2, allbrew 0.0.29 historic): `FORMULA_LISTED=1`, `MANIFEST_OK`, `BIN_MISSING` → `VERIFY_OK=false` (archived 2026-08-10T08-29-16Z__geminabox, also reproduced on local-2 21:08 baseline brew install in progress with same classification).
- VM re-verify with --allbrew-src pending — requires Lume lock; attempted on local-2 contended (3 parallel brew installs). Fix is same as already-validated archived fix `geminabox-2026-08-10` (host brew test PASS with GEM_HOME ruby version 3.1.0) but needs VM bottle-consistent re-verify before release.

## Residual risk
- Executable detection requires network fetch of .gem on generate; transient fetch failure falls back to gemName binary test (original behavior) — safe but loses no-bin handling in that edge case. Could cache executables from RubyGems API if available, but current flow is minimal.
- Library test uses `Gem.loaded_specs['geminabox']` via GEM_HOME; works in Homebrew sandbox where gem is installed to libexec. If GEM_HOME layout changes, alternative `ruby -r geminabox -e 'puts Geminabox::VERSION'` could be used.
- No brew service — correct for Rack app; users run via `rackup` manually.
- Tap index corruption on VM2 (`agy-acp.rb invalid object`, `bad signature`) observed during baseline — unrelated to this fix, suggests concurrent tap writes need serialization or `brew update` retry. Does not affect generated formula content.

