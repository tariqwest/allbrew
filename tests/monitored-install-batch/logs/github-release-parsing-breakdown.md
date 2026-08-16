# github-release-parsing smoke batch breakdown

**Branch:** `fix/github-release-parsing`

**Worktree:** `/Users/tariqwest/Developer/allbrew-wt-github-release-parsing`

**Reconciled at:** 2026-08-16T20:25:53.139Z

## Summary

- Total outcome lines: 54
- Unique (name, endpoint) pairs after reconciling by latest: 50
- Expected list/endpoint combinations: 3 (homeserver, local-1, local-2 lists)
- VM status at hygiene: local-1 ✅ usable, local-2 ✅ usable, homeserver ❌ stopped (security error on start)
- Additional re-runs: local-2 full homeserver-list fallback, local-1 retry of 4 heavy/failing homeserver-list items
- Code validation: `bun run check` ✅, targeted unit tests ✅, `bun run test:templates` ✅

## Per-list results

### homeserver list (intended endpoint: homeserver)

| name | intended endpoint | latest status | duration | endpoint(s) attempted |
|------|-------------------|---------------|----------|-----------------------|
| television | homeserver | ✅ success | 50065ms | homeserver, local-1, local-2 |
| swift-outdated | homeserver | ✅ success | 49657ms | homeserver, local-1, local-2 |
| gotify-cli | homeserver | ✅ success | 54945ms | homeserver, local-1, local-2 |
| gokapi | homeserver | ✅ success | 48743ms | homeserver, local-1, local-2 |
| portdeck | homeserver | ✅ success | 54424ms | homeserver, local-1, local-2 |
| krokiet | homeserver | ✅ success | 53291ms | homeserver, local-1, local-2 |
| go2tv | homeserver | ⏱️ timeout | 180020ms | homeserver, local-2, local-1 |
| emulsion | homeserver | ❌ failed | 161723ms | homeserver, local-2, local-1 |
| nicotine-plus | homeserver | ⏱️ timeout | 180342ms | homeserver, local-2, local-1 |
| goshot | homeserver | ⏱️ timeout | 180016ms | homeserver, local-2, local-1 |

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
| emulsion | ❌ failed | ❌ failed | ❌ failed |
| go2tv | ❌ failed | ⏱️ timeout | ⏱️ timeout |
| godns | — | ✅ success | — |
| gokapi | ❌ failed | ✅ success | ✅ success |
| goshot | ❌ failed | ⏱️ timeout | ❌ failed |
| gotify-cli | ❌ failed | ✅ success | ✅ success |
| hermes-desktop | — | ✅ success | — |
| kdash | — | ✅ success | — |
| kdash-direct | — | — | ✅ success |
| knownote | — | ✅ success | — |
| krokiet | ❌ failed | ✅ success | ❌ failed |
| localsend | — | — | ✅ success |
| mission-control-plus | — | ✅ success | — |
| moicons | — | ✅ success | — |
| nicotine-plus | ❌ failed | ⏱️ timeout | ❌ failed |
| portdeck | ❌ failed | ✅ success | ✅ success |
| seaquel | — | — | ✅ success |
| seaquel-release | — | ✅ success | — |
| starship-binary | — | ✅ success | — |
| swift-outdated | ❌ failed | ✅ success | ✅ success |
| television | ⏱️ timeout | ✅ success | ✅ success |
| tv | — | — | ✅ success |
| utm | — | — | ✅ success |
| veronum | — | — | ✅ success |
| xplr | — | ✅ success | — |
| xplr-direct | — | — | ✅ success |

## Persistent failures (after retries)

- **go2tv**
  - homeserver: ❌ failed (84827ms, exitCode=1)
  - local-2: ⏱️ timeout (180015ms, exitCode=null)
  - local-1: ⏱️ timeout (180020ms, exitCode=null)
- **emulsion**
  - homeserver: ❌ failed (85166ms, exitCode=1)
  - local-2: ❌ failed (60728ms, exitCode=1)
  - local-1: ❌ failed (161723ms, exitCode=1)
- **nicotine-plus**
  - homeserver: ❌ failed (85503ms, exitCode=1)
  - local-2: ❌ failed (64440ms, exitCode=1)
  - local-1: ⏱️ timeout (180342ms, exitCode=null)
- **goshot**
  - homeserver: ❌ failed (85200ms, exitCode=1)
  - local-2: ❌ failed (88437ms, exitCode=1)
  - local-1: ⏱️ timeout (180016ms, exitCode=null)

## Notes

- homeserver endpoint could not be used: `vm-homeserver-macos-testing` is stopped and fails to start with `Unable to access security information. The virtual machine encountered a security error.`
- Homeserver-list items were therefore re-run on local-2 (10 items) and the 4 heaviest/failing items were retried on local-1.
- `go2tv`, `emulsion`, `nicotine-plus`, and `goshot` remain non-success across all endpoints/timeouts. These are heavy desktop/PyQt/Go-build packages and may need a longer per-URL budget or generator fixes beyond the current branch.
- `krokiet` succeeded on local-1 and homeserver-list but failed on local-2 (flaky).
- `bun run check`, targeted unit tests and template parity passed, so the github-release-parsing patch itself is type-safe and matches fixtures.
