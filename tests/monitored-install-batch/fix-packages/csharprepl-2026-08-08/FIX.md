# Fix package: csharprepl

## URL
https://github.com/waf/CSharpRepl

## Failure class
`generate_fail` (wrong generator: source-build / make install instead of dotnet-package)

## Root cause
1. `lib/analyzer.ts` `detectInstallMethod` had no regex for `dotnet tool install [-g|--global] <pkg>`.
2. `lib/cli.ts` GitHub README method switch had no `case "dotnet"` → fell through to file inspection → default source-build with broken `make install`.
3. (Related) `lib/templates/formula/dotnet-package.ts` still used bin + `env_script_all_files`, which breaks .NET tool apphost `.store` layout (see dotnet-monitor fix-package).

## Fix
1. Add `DOTNET_TOOL_INSTALL_RE` and return `{ method: "dotnet", package }`.
2. Route `case "dotnet"` → `dotnet-package` generator.
3. Template: install to libexec + `write_env_script`; copy nupkg as `<id>.<version>.nupkg`.
4. Unit tests for `dotnet tool install -g csharprepl`.

## Agent judgment
- generator: **dotnet-package** / package **csharprepl**
- service: **false** (interactive CLI REPL)
- GitHub URL variant (idx 657), not NuGet page

## Local validation
- Detected install method: `dotnet (csharprepl)`
- Formula: NuGet url `.../csharprepl/0.9.2`, `depends_on "dotnet"`, libexec tool install
- Unit analyzer tests for dotnet tool install pass

## VM
- Must use `vm-install-one.mjs` (host brew not success criterion)
- Guest bottle may still lack fix until reconcile/release

## Residual risk
- Experimental generator; e2e-tap dotnet suite quarantined
- Files mode includes full analyzer.ts/cli.ts which may carry other WIP from dirty worktree — reconcile in worktree should review
