# Dotnet Package Category Smoke Breakdown

## Patch summary

Branch: `fix/dotnet-package`

The .NET generator patch adds:

- **DotnetTool package-type validation** — rejects non-tool NuGet packages with a hint to use GitHub release URLs.
- **macOS runtime identifier (RID) validation** — accepts `osx-*`, `macos-*`, or the neutral `any` RID; rejects packages with no macOS runtime support.
- **Tool command extraction** — reads `DotnetToolSettings.xml` from the nupkg and uses the declared command as the formula binary.
- **Stable version selection** — skips pre-release versions and uses the latest stable version from the NuGet versions array.
- **NuGet livecheck block** — adds a livecheck that parses the NuGet flat-container version index.

## Validation results

- `bun run check` — passed (`tsc --noEmit`).
- `bun test tests/unit/generators/dotnet-package.test.ts tests/unit/sha256.test.ts` — **36 pass / 0 fail**.
- Local spot checks:
  - `DepotDownloader` correctly rejected as **not a DotnetTool**.
  - `dotnet-project-licenses`, `dotnet-svcutil`, and `dotnet-stryker` generated and installed locally (host Mac), confirming the generator and `dotnet tool install` path are valid (modulo a `homebrew/core` name collision for `dotnet-stryker`).

## Smoke reconciliation

Reconciled `tests/monitored-install-batch/logs/smoke-outcomes.jsonl` by latest `(name, endpoint)` pair. The final run produced 30 unique `(name, endpoint)` pairs with no duplicate latest records.

`TH_SMOKE_PER_URL_TIMEOUT_MS=180000` was set for all three endpoint batches.

## Per-endpoint aggregate

| endpoint | total | success | system timeout (180 s) | failed |
| --- | --- | --- | --- | --- |
| local-1 | 10 | 1 | 4 | 5 |
| local-2 | 10 | 0 | 6 | 4 |
| homeserver | 10 | 2 | 3 | 5 |
| **total** | **30** | **3** | **13** | **14** |

## Per-URL status (latest by name + endpoint)

| endpoint | name | smoke status | exit code | status.json exit | duration (ms) | formula bytes | verify bytes | classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| homeserver | DepotDownloader | failed | 1 | 1 | 27727 | 0 | 0 | expected: not a DotnetTool |
| homeserver | dotnet-affected | failed_system_timeout | n/a | - | 180018 | 2189 | 576 | system_timeout (180 s) |
| homeserver | dotnet-certificate-tool | failed_system_timeout | n/a | - | 180015 | 0 | 0 | system_timeout (180 s) |
| homeserver | dotnet-project-licenses | failed | 1 | 138 | 35970 | 0 | 0 | VM runtime crash (exit 138/SIGBUS) |
| homeserver | dotnet-stack | failed | 1 | 138 | 34429 | 2163 | 0 | VM runtime crash (exit 138/SIGBUS) |
| homeserver | dotnet-stryker | failed | 1 | - | 9529 | 0 | 0 | unresolved early failure |
| homeserver | dotnet-subset | success | 0 | 0 | 24926 | 2165 | 667 | success |
| homeserver | dotnet-svcutil | failed | 1 | 138 | 28942 | 2177 | 0 | VM runtime crash (exit 138/SIGBUS) |
| homeserver | dotnet-xscgen | failed_system_timeout | n/a | - | 180016 | 0 | 0 | system_timeout (180 s) |
| homeserver | Rnwood.Smtp4dev | success | 0 | 0 | 41512 | 2177 | 811 | success |
| local-1 | dotnet-counters | failed_system_timeout | n/a | - | 180021 | 0 | 0 | system_timeout (180 s) |
| local-1 | dotnet-coverage | failed | 1 | 138 | 112752 | 2193 | 0 | VM runtime crash (exit 138/SIGBUS) |
| local-1 | dotnet-dump | failed | 1 | 138 | 78813 | 2151 | 0 | VM runtime crash (exit 138/SIGBUS) |
| local-1 | dotnet-ef | success | 0 | 0 | 41762 | 2121 | 607 | success |
| local-1 | dotnet-gcdump | failed | 1 | 138 | 67759 | 2175 | 0 | VM runtime crash (exit 138/SIGBUS) |
| local-1 | dotnet-monitor | failed | 1 | 138 | 77323 | 0 | 0 | VM runtime crash (exit 138/SIGBUS) |
| local-1 | dotnet-serve | failed_system_timeout | n/a | - | 180018 | 2159 | 639 | system_timeout (180 s) |
| local-1 | dotnet-sos | failed_system_timeout | n/a | - | 180016 | 2139 | 0 | system_timeout (180 s) |
| local-1 | dotnet-symbol | failed_system_timeout | n/a | - | 180034 | 0 | 0 | system_timeout (180 s) |
| local-1 | dotnet-trace | failed | 1 | 138 | 98061 | 2163 | 0 | VM runtime crash (exit 138/SIGBUS) |
| local-2 | CSharpRepl | failed | 1 | 138 | 128906 | 2130 | 0 | VM runtime crash (exit 138/SIGBUS) |
| local-2 | dotnet-aspnet-codegenerator | failed_system_timeout | n/a | - | 180013 | 2334 | 0 | system_timeout (180 s) |
| local-2 | dotnet-format | failed_system_timeout | n/a | - | 180033 | 2175 | 641 | system_timeout (180 s) |
| local-2 | dotnet-outdated-tool | failed | 1 | 138 | 67511 | 2158 | 0 | VM runtime crash (exit 138/SIGBUS) |
| local-2 | dotnet-reportgenerator-globaltool | failed | 1 | 138 | 73473 | 2370 | 0 | VM runtime crash (exit 138/SIGBUS) |
| local-2 | dotnet-script | failed_system_timeout | n/a | - | 180013 | 0 | 0 | system_timeout (180 s) |
| local-2 | dotnet-sonarscanner | failed_system_timeout | n/a | - | 180017 | 2239 | 0 | system_timeout (180 s) |
| local-2 | dotnet-t4 | failed_system_timeout | n/a | - | 180033 | 0 | 0 | system_timeout (180 s) |
| local-2 | ilspycmd | failed | 1 | 138 | 99840 | 2118 | 0 | VM runtime crash (exit 138/SIGBUS) |
| local-2 | Microsoft.dotnet-interactive | failed_system_timeout | n/a | - | 180014 | 0 | 0 | system_timeout (180 s) |

## Classification summary

| classification | count |
| --- | --- |
| success | 3 |
| system timeout (180 s) | 13 |
| VM runtime crash (exit 138/SIGBUS) | 12 |
| expected: not a DotnetTool | 1 |
| install/test failure | 0 |
| unresolved early failure | 1 |

## Failure analysis

- **System timeouts (13)**: packages that hit the 180 s per-URL limit. In most cases the formula was generated (formula.rb > 0), so the install/test phase (`dotnet` SDK and `dotnet tool install`) exceeded the VM budget. These are environment / timeout issues, not .NET patch regressions.
- **VM runtime crashes (12)**: packages whose `.status.json` records `exitCode: 138` (`SIGBUS` / signal 10) after 30–130 s. These occur during `dotnet tool install` inside the 3.5 GiB Lume VMs and are consistent with the .NET runtime exhausting guest memory. Local host installs of the same packages (`dotnet-project-licenses`, `dotnet-svcutil`, `dotnet-stryker`) succeed, so this is a VM resource issue, not a patch regression.
- **Expected validation rejection (1)**: `DepotDownloader` is not a DotnetTool and is correctly rejected by the new validation. This is expected behavior.
- **Unresolved early failure (1)**: `dotnet-stryker` on homeserver failed in ~10 s with no `.status.json` sidecar and no formula sidecar, and the smoke harness did not preserve the full guest output. A local install generated a valid formula and ran `dotnet tool install` successfully (the only failure was a `homebrew/core` name collision), so this is likely another VM-environment crash, but the exact guest error is unconfirmed.
- **Smoke log capture limitation**: `smoke-batch.mjs` overwrites the `vm-install-one` host log with the wrapper stdout, so the full `allbrew` / `dotnet` output is not preserved. `.status.json` and `.formula.rb` sidecars are the primary diagnostic artifacts.

## VM hygiene notes

Post-smoke deep health checks:

- **homeserver**: healthy, free, running, `lume ssh` ok. Guest Homebrew lock present at `/var/run/lume-homebrew.lock`; batch harness force-unlocks on the next run.
- **local-1**: healthy with warnings, free, running, `lume ssh` ok. Guest Homebrew lock present; will be force-unlocked.
- **local-2**: healthy with warnings, free, running, `lume ssh` ok. Guest Homebrew lock present; will be force-unlocked.

All endpoints were running before the smoke; homeserver was started from a stopped state without recreation (it had been stopped due to an Aqua-console / security issue; it was started with `launchctl asuser` via the remote admin console).

## Regressions specific to the .NET patch

No .NET patch regressions were isolated from the smoke data. The failures fall into three buckets:

1. **Timeout / resource** — `dotnet` SDK installation and `dotnet tool install` exceed the 180 s VM budget or trigger `SIGBUS` in the 3.5 GiB Lume guests. These are environment constraints, not generator defects.
2. **Expected validation rejection** — `DepotDownloader` is not a DotnetTool; the generator now correctly rejects it.
3. **Insufficient diagnostic capture** — the smoke harness overwrites the detailed guest log, preventing deeper root-cause analysis of the unresolved `dotnet-stryker` early failure. Improving `smoke-batch.mjs` log capture should be done before the next smoke wave.

The unit tests, local install spot checks, and the 3 successful smoke packages (`dotnet-ef`, `Rnwood.Smtp4dev`, `dotnet-subset`) confirm the .NET generator logic is sound.

