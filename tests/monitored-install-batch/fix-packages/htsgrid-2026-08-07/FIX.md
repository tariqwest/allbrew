# fix-package: htsgrid (gemspec → ruby-gem source-build)

## Failure
- **brew_fail / generate wrong shape**: GitHub repo has `htsgrid.gemspec` + `exe/htsgrid` but no Makefile.
- allbrew 0.0.24: `detectBuildSystemFromFiles` returned null → defaulted to **source-build + make** `system "make", "PREFIX=…", "install"`.
- Gem is **not** published on RubyGems.org (`404`), so pure `gem-package` alone is insufficient.

## Agent judgment
- expected generator: gem-package (if published) else ruby gem install from source
- service: **false** (GUI HTS viewer; `bundle exec ruby main.rb` / exe; not a daemon)

## Fix (Option A)
1. `lib/analyzer.ts` — detect root `*.gemspec` → `{ method: "gem" }` (files + archive helpers).
2. `lib/cli.ts` — `case "gem"`: try `gem-package` via RubyGems; on failure fall back to `source-build` with `system: "ruby-gem"`.
3. `lib/generators/source-build.ts` — `ruby-gem` depends_on ruby; `gem build` + `gem install` into libexec + `bin.env_script_all_files`.
4. Unit: `detectBuildSystemFromFiles` gemspec case.

## Validation
- Unit analyzer suite: gemspec test **pass**.
- Local temp-tap generate with fix: detects `gem`, logs RubyGems 404, writes ruby-gem formula (see `formula-fixed.rb`).
- Host `brew install --HEAD` of fixed formula: still may fail on native gem deps (`htslib`, `glimmer-dsl-libui` / LibUI) — residual packaging depth beyond detector.
- VM install against **unreleased** brew allbrew still exercises the **old** make path until parent reconciles/release.

## Residual
- Native deps for genomics/GUI gem not modeled (`depends_on` htslib / system libs).
- HEAD-only repo (no releases); livecheck github_latest may be weak.
- GUI app has no useful `--version` CLI contract for formula `test do`.
