# Fix package: dotnet-monitor

## URL
https://nuget.org/packages/dotnet-monitor

## Failure class
`brew_fail` (verify broken after "successful" install) + experimental `dotnet-package` generator

## Root cause
`lib/templates/formula/dotnet-package.ts` installed the .NET global tool with
`--tool-path "#{bin}"` then called `bin.env_script_all_files(libexec, DOTNET_ROOT: ...)`.

Homebrew's `env_script_all_files` moves only the executable shim from `bin/` into
`libexec/` and leaves the tool's `.store/` tree behind under `bin/`. The .NET
apphost resolves `dotnet-monitor.dll` relative to itself under `libexec/.store/...`,
which does not exist.

Additionally, NuGet local feeds require the package file to be named
`<id>.<version>.nupkg`.

## Fix
1. Install with `--tool-path libexec` so apphost + `.store/` stay co-located.
2. Create `bin/<tool>` via `write_env_script` with `DOTNET_ROOT`.
3. Copy downloaded nupkg to `nupkg/<package_id>.<version>.nupkg` before install.

## Files
- `lib/templates/formula/dotnet-package.ts`
- `tests/unit/templates/dotnet-package-template.test.ts` (new)

## Local validation
- Temp tap `allbrew-test/dotnet-monitor-fix`
- `dotnet-monitor --version` → `10.0.3+215faa16aba9252ef6275144caf9433b8a50ffaf`
- Unit tests: 17 pass

## VM status
- homeserver: generate OK, brew install EXIT_CODE=1 (truncated log; likely timeout on `dotnet` pour)
- Fix not released; guest bottle still 0.0.24 without template fix
- vmHelperUsed: true

## Service
- Agent: service true (`dotnet-monitor collect`)
- allbrew: no service stanza
- severity: warn

## Residual risk
- Experimental generator; e2e-tap quarantined
- NuGet-only service auto-detect still weak
- Host may retain validation tap/package (cleanup recommended)
