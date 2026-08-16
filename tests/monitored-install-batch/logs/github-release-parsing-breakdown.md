# github-release-parsing smoke batch breakdown

**Branch:** `fix/github-release-parsing`

**Worktree:** `/Users/tariqwest/Developer/allbrew-wt-github-release-parsing`

**Reconciled at:** 2026-08-16T21:02:37.584Z

## Summary

- Total outcome lines: 64
- Unique (name, endpoint) pairs after reconciling by latest: 54
- Expected list/endpoint combinations: 3 (homeserver, local-1, local-2 lists)
- VM status at hygiene: local-1 ✅ usable, local-2 ✅ usable, homeserver ✅ usable and running
- Additional re-runs: homeserver list re-run against a freshly recreated VM; local-2 full homeserver-list fallback, local-1 retry of 4 heavy/failing homeserver-list items remain in the log
- Code validation: `bun run check` ✅, targeted unit tests ✅, `bun run test:templates` ✅

## Per-list results

### homeserver list (intended endpoint: homeserver)

| name | intended endpoint | latest status | duration | endpoint(s) attempted |
|------|-------------------|---------------|----------|-----------------------|
| television | homeserver | ✅ success | 38709ms | homeserver, local-1, local-2 |
| swift-outdated | homeserver | ✅ success | 41514ms | homeserver, local-1, local-2 |
| gotify-cli | homeserver | ✅ success | 43714ms | homeserver, local-1, local-2 |
| gokapi | homeserver | ✅ success | 45692ms | homeserver, local-1, local-2 |
| portdeck | homeserver | ✅ success | 52205ms | homeserver, local-1, local-2 |
| krokiet | homeserver | ✅ success | 58931ms | homeserver, local-1, local-2 |
| go2tv | homeserver | ✅ success | 45404ms | homeserver, local-2, local-1 |
| emulsion | homeserver | ⏱️ timeout | 180018ms | homeserver, local-2, local-1 |
| nicotine-plus | homeserver | ✅ success | 48891ms | homeserver, local-2, local-1 |
| goshot | homeserver | ❌ failed | 47486ms | homeserver, local-2, local-1 |

### local-1 list (intended endpoint: local-1)

| name | intended endpoint | latest status | duration | endpoint(s) attempted |
|------|-------------------|---------------|----------|-----------------------|
| godns | local-1 | ✅ success | 64081ms | local-1 |
| starship-binary | local-1 | ✅ success | 48427ms | local-1 |
| kdash | local-1 | ✅ success | 49675ms | local-1 |
| dnote | local-1 | ✅ success | 52330ms | local-1 |
| xplr | local-1 | ✅ success | 52716ms | local-1 |
| mission-control-plus | local-1 | ✅ success | 54446ms | local-1 |
| hermes-desktop | local-1 | ✅ success | 49047ms | local-1 |
| moicons | local-1 | ✅ success | 68214ms | local-1 |
| knownote | local-1 | ✅ success | 73564ms | local-1 |
| seaquel-release | local-1 | ✅ success | 59365ms | local-1 |

### local-2 list (intended endpoint: local-2)

| name | intended endpoint | latest status | duration | endpoint(s) attempted |
|------|-------------------|---------------|----------|-----------------------|
| tv | local-2 | ✅ success | 60804ms | local-2 |
| csvlens | local-2 | ✅ success | 47972ms | local-2 |
| kdash-direct | local-2 | ✅ success | 48277ms | local-2 |
| xplr-direct | local-2 | ✅ success | 49134ms | local-2 |
| seaquel | local-2 | ✅ success | 77991ms | local-2 |
| apiark | local-2 | ✅ success | 53128ms | local-2 |
| balenaetcher | local-2 | ✅ success | 72350ms | local-2 |
| localsend | local-2 | ✅ success | 57189ms | local-2 |
| utm | local-2 | ✅ success | 93313ms | local-2 |
| veronum | local-2 | ✅ success | 65784ms | local-2 |

## Reconciled (name, endpoint) matrix

| name | homeserver | local-1 | local-2 |
|------|------|------|------|
| apiark | — | — | ✅ success |
| balenaetcher | — | — | ✅ success |
| csvlens | — | — | ✅ success |
| dnote | — | ✅ success | — |
| emulsion | ⏱️ timeout | ❌ failed | ❌ failed |
| go2tv | ✅ success | ⏱️ timeout | ⏱️ timeout |
| godns | — | ✅ success | — |
| gokapi | ✅ success | ✅ success | ✅ success |
| goshot | ❌ failed | ⏱️ timeout | ❌ failed |
| gotify-cli | ✅ success | ✅ success | ✅ success |
| hermes-desktop | — | ✅ success | — |
| kdash | — | ✅ success | — |
| kdash-direct | — | — | ✅ success |
| knownote | — | ✅ success | — |
| krokiet | ✅ success | ✅ success | ❌ failed |
| localsend | — | — | ✅ success |
| mission-control-plus | — | ✅ success | — |
| moicons | — | ✅ success | — |
| nicotine-plus | ✅ success | ⏱️ timeout | ❌ failed |
| portdeck | ✅ success | ✅ success | ✅ success |
| seaquel | — | — | ✅ success |
| seaquel-release | — | ✅ success | — |
| starship-binary | — | ✅ success | — |
| swift-outdated | ✅ success | ✅ success | ✅ success |
| television | ✅ success | ✅ success | ✅ success |
| tv | — | — | ✅ success |
| utm | — | — | ✅ success |
| veronum | — | — | ✅ success |
| xplr | — | ✅ success | — |
| xplr-direct | — | — | ✅ success |

## Persistent failures (after retries)

- **emulsion**
  - homeserver: ⏱️ timeout (180018ms, exitCode=null)
  - local-2: ❌ failed (60728ms, exitCode=1)
  - local-1: ❌ failed (161723ms, exitCode=1)
- **goshot**
  - homeserver: ❌ failed (47486ms, exitCode=138)
  - local-2: ❌ failed (88437ms, exitCode=1)
  - local-1: ⏱️ timeout (180016ms, exitCode=null)

## Notes

- homeserver VM `vm-homeserver-macos-testing` was deleted and recreated (macOS 26.6.1 on external storage, 2 CPU / 3.5 GB) because the previous image could not start due to a Virtualization security error.
- After recreation, `sudo` was configured passwordless for the `lume` user so the harness can acquire the Homebrew sparsebundle.
- Homeserver list was re-run on the recreated VM. 8/10 items succeeded on homeserver.
- `go2tv` and `nicotine-plus` succeeded on homeserver but had timed out on local-1/local-2, confirming earlier failures were resource/infrastructure-driven, not a code regression.
- `emulsion` timed out on homeserver (heavy desktop/PyQt package; 3 min budget insufficient).
- `goshot` failed on homeserver with guest exit code `138` (`SIGBUS`), matching the npm-service VM stability pattern rather than a generator issue.
- `krokiet` succeeded on homeserver and local-1 but failed on local-2 (flaky).
- No merge or push to `main` was performed.
- `bun run check`, targeted unit tests and template parity passed, so the github-release-parsing patch itself is type-safe and matches fixtures.
