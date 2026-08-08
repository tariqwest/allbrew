# Fix package: ilspycmd

## URL
https://github.com/icsharpcode/ILSpy

## Failure class
`brew_fail` / wrong generator (`binary-release` on desktop ILSpy.app zip with `bin.install "ilspycmd"`)

## Root cause
1. Latest release ships arch-tagged `ILSpy_macos-arm64_*.zip` containing **ILSpy.app**, classified as `isBinaryAsset` (cpu arch in name) not `isAppAsset`.
2. `binary-release` installs formula name `ilspycmd` which is not in the zip → `Errno::ENOENT: ilspycmd`.
3. README documents NuGet tool via markdown link to `nuget.org/packages/ilspycmd/` without a `dotnet tool install -g ilspycmd` shell one-liner, so `detectInstallMethod` returned null even if README were consulted.
4. Release binary short-circuit never reaches README/package-manager routing.
5. HEAD `dotnet-package` template used bin + `env_script_all_files` (apphost `.store` layout break) — fixed to libexec + `write_env_script`.

## Fix
1. `DOTNET_TOOL_INSTALL_RE` + NuGet URL link extraction (`extractNugetPackageIds` / `pickPreferredNugetPackage`).
2. Before release app/binary short-circuit: if `--name`/`--package` matches a NuGet tool (README link or name≠repo and package exists on NuGet) → `dotnet-package`.
3. README switch `case "dotnet"` → generator.
4. Template: nupkg rename + libexec install + env shim.
5. Unit tests for NuGet link + shell install detection.

## Agent judgment
- generator: **dotnet-package** / package **ilspycmd**
- service: **false** (one-shot CLI decompiler)
- GitHub monorepo URL with name override to CLI tool

## Local validation
- Preferring NuGet global tool "ilspycmd" over release assets
- Formula: nuget.org/api/v2/package/ilspycmd/11.0.0.9335-rc, depends_on "dotnet", libexec
- Temp-tap brew install succeeded (not success criterion)
- Unit: NuGet package link detection 2 pass

## Residual risk
- Experimental dotnet generator; e2e-tap may still quarantine
- Without `--name ilspycmd`, default path still treats desktop zip as binary/cask mis-route for the Avalonia app (separate cask fix)
- Guest bottle lacks this fix until parent reconcile/release
