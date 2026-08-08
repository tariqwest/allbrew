# Fix package: dotnet-monitor (GitHub URL)

## URL
https://github.com/dotnet/dotnet-monitor

## Failure class
`brew_fail` / wrong generator (`source-build` cmake) — product should use `dotnet-package`

## Root cause
1. Root README has no `dotnet tool install` (install lives in `documentation/setup.md`).
2. Repo ships `CMakeLists.txt` + `.sln` / `global.json` / `NuGet.config`. File detection preferred cmake source-build.
3. GitHub releases have **0 assets**; product is published as NuGet global tool `dotnet-monitor`.
4. (Template) bin + `env_script_all_files` breaks .NET tool apphost `.store` layout.

## Fix
1. `DOTNET_TOOL_INSTALL_RE` + README `case "dotnet"` routing.
2. `hasDotnetProjectMarkers` — prefer `.sln`/`global.json`/`NuGet.config`/`Directory.Build.props` over cmake.
3. Before native build switch: if markers present and NuGet package id (=repo name) exists → `dotnet-package`.
4. Template: install to libexec + `write_env_script`; nupkg named `<id>.<version>.nupkg`.

## Local validation
- Detected: Preferring NuGet global tool… package "dotnet-monitor" exists on NuGet
- Formula: nuget.org/api/v2/package/dotnet-monitor/10.0.3, depends_on "dotnet", libexec install
- Host temp-tap brew install OK (not success criterion); unit tests 3 pass

## Service
- Agent: service **true** (`dotnet-monitor collect` long-running HTTP diagnostics)
- allbrew auto-detect: **false** (root README lacks collect/brew-services wording)
- severity: **warn** (docs are nested; optional follow-up)

## Residual risk
- Experimental generator; e2e-tap dotnet suite may still be quarantined
- Service auto-detect for nested docs still weak
- Guest bottle may lack fix until reconcile/release
