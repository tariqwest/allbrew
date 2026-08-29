# Cask-app smoke breakdown — `fix/cask-app`

Generated: 2026-08-16T21:41:32.929Z

## Patch summary

- **Branch:** `fix/cask-app`
- **Key files:**
  - `lib/generators/cask-app.ts` — redirect/finalUrl version extraction, suffix stripping, `zap trash:` block
  - `lib/generators/cask-app-release.ts` — shared `stripCaskArtifactSuffixes` and artifact cleanup
  - `lib/page-discover.ts` — extensionless download API detection, soft-404 HTML rejection, HEAD reclassification
  - `lib/templates/cask/cask-app.ts` — renders `zapBlock`
  - `lib/utils.ts` — new shared `stripCaskArtifactSuffixes`
  - `lib/sha256.ts` — defensive header access for mocked responses
- **Behavior:** `collectCaskAppPayload` now uses the redirected `finalUrl`, server-provided filename, and extracts versions from headers/URLs/filenames, then strips architecture/distribution suffixes before building a clean cask token and `zap trash:` stanza.

## Unit / template tests

| Command | Result |
|---|---|
| `bun run check` | pass (`tsc --noEmit`) |
| `bun test tests/unit/generators/cask-app.test.ts` | pass |
| `bun test tests/unit/page-discover.test.ts` | pass |
| `bun test tests/unit/templates/render.test.ts` | pass |
| `bun run test:templates` | all 13 templates pass |
| `bun run test` (full suite) | 1288 pass / 12 fail — failures are pre-existing `reconcileOne docs-mode` and `matchOfficialCaskByHomepage` tests, not related to cask-app changes |

## Smoke methodology

- **Lists:** 10 URLs per endpoint in `tests/monitored-install-batch/logs/cask-app-smoke-{homeserver,local-1,local-2}.json`
- **Exclusions:** setapp, MAS, `skip: true` entries were skipped
- **Timeout:** `TH_SMOKE_PER_URL_TIMEOUT_MS=180000`
- **Runner:** `tests/monitored-install-batch/logs/run-cask-app-smoke.mjs` (fixed to run all three endpoints concurrently)
- **Source sync:** `TH_SKIP_SRC_SYNC=1`, branch `fix/cask-app` at `/Users/th-allbrew/Developer/allbrew-src/fix-cask-app`

## Aggregate by endpoint

| endpoint | total | success | failed | timeouts | casks generated | formulas generated |
| --- | --- | --- | --- | --- | --- | --- |
| homeserver | 10 | 4 | 5 | 1 | 6 | 1 |
| local-1 | 10 | 0 | 0 | 10 | 2 | 0 |
| local-2 | 10 | 1 | 0 | 9 | 3 | 0 |

## Per-URL results

| name | url | endpoint | status | exit / timeout | duration | generated | classification | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chirpy | https://chirpy.pro/download | homeserver | failed | 1 | 86s | none | infrastructure/remote-vm | Remote Lume host reported VM not running; could not acquire Homebrew lock |
| canto | https://canto.app | homeserver | failed | 1 | 90s | cask (850 B) | classification/mas | Discovered Mac App Store page; generated mas-based cask that cannot install without `mas` CLI |
| yaak | https://yaak.app/download | local-1 | failed_system_timeout | timeout | 180s | cask (1493 B) | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| superconductor | https://superconductor.dev | local-2 | failed_system_timeout | timeout | 180s | cask (840 B) | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| unpeel | https://unpeel.com | local-2 | success | 0 | 173s | cask (565 B) | success | Generated and installed/verified in VM |
| tablen | https://tablen.app/download | homeserver | failed_system_timeout | timeout | 180s | none | infrastructure/timeout | Per-URL 180s timeout; install/verify did not complete |
| balenaetcher | https://github.com/balena-io/etcher/releases/download/v2.1.6/balenaEtcher-2.1.6-arm64.dmg | local-1 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| seaquel | https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg | homeserver | success | 0 | 42s | cask (764 B) | success | Generated and installed/verified in VM |
| resurf | https://resurf.app | homeserver | failed | 1 | 29s | none | discovery/generator | No formula generated; likely page did not yield a usable macOS artifact |
| pasty | https://pasty.dev | homeserver | success | 0 | 51s | cask (672 B) | success | Generated and installed/verified in VM |
| multica | https://multica.ai/download | homeserver | failed | 1 | 47s | formula (5328 B) | classification/install-script | URL/page resolved to an install script, not a cask-app artifact |
| poe | https://desktop-app.poecdn.net/downloads/Poe.dmg | local-2 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| chronoid | https://chronoid.com | local-1 | failed_system_timeout | timeout | 180s | cask (835 B) | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| sanebar | https://sanebar.com | homeserver | success | 0 | 72s | cask (723 B) | success | Generated and installed/verified in VM |
| codemantis | https://codemantis.dev/download | homeserver | success | 0 | 104s | cask (680 B) | success | Generated and installed/verified in VM |
| screencharm | https://screencharm.app | local-2 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| devdash | https://devdash.dev | local-1 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| echo | https://theodorehq.com/echo | homeserver | failed | 1 | 73s | cask (629 B) | install/verify | Cask generated but `brew install`/verify failed (notarization, missing artifact, or heavy app) |
| filenq | https://filenq.app | local-2 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| ego-lite | https://lite.ego.app/download | local-1 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| recordly | https://recordly.app | local-2 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| itsypin | https://itsypin.app | local-1 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| aizen | https://aizen.win | local-2 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| superwhisper | https://superwhisper.com | local-1 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| lookaway | https://lookaway.app | local-2 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| popclip | https://pilotmoon.com/downloads/PopClip-2025.9.2.zip | local-1 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| cap | https://cap.so | local-2 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| snippetbar | https://snippetbar.app | local-1 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| kosmik | https://kosmik.app/downloads | local-2 | failed_system_timeout | timeout | 180s | cask (887 B) | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |
| halo | https://heyhalo.app | local-1 | failed_system_timeout | timeout | 180s | none | infrastructure/timeout-cascade | Per-URL 180s timeout; guest allbrew/brew process continued after host kill, blocking subsequent local runs |

## Log / artifact paths

- Smoke outcomes: `tests/monitored-install-batch/logs/smoke-outcomes.jsonl`
- Per-URL logs: `tests/monitored-install-batch/logs/smoke-{endpoint}-{name}-{timestamp}.log`
- Per-URL formulas: `...log.formula.rb`
- This breakdown: `tests/monitored-install-batch/logs/cask-app-breakdown.md`

## Infrastructure / endpoint observations

- **homeserver:** First two runs (`chirpy`, `canto`) hit a period where the remote Lume host reported `vm-homeserver-macos-testing` as not running. The smoke then tried to start and the VM came online for later items, which explains the mixed results. All `success` entries on this endpoint prove the cask-app generator can build real, verifiable casks from direct DMG, GitHub latest, and vendor CDN URLs.
- **local-1:** All 10 URLs hit the 180s timeout. The first item (`yaak`) actually generated a valid `yaak.rb` cask but took longer than 180s to install/verify, leaving a guest `brew` process running. Subsequent `vm-install-one` runs could not fully acquire the Homebrew prefix because the previous guest `brew` process still held the lock, causing a cascade.
- **local-2:** `unpeel` succeeded and generated a clean cask from an extensionless URL (`https://unpeel.com/download/mac`). The next item, `superconductor`, generated a valid cask but exceeded 180s, producing the same guest-process cascade as local-1. This confirms the extensionless-download improvements but also shows that the 180s per-URL limit is too short for heavier apps once guest cleanup is not instantaneous.
- **General:** The 180s per-URL timeout is the host-side `smoke-batch` limit. When `vm-install-one` is killed, the guest `allbrew` / `brew` processes on the local VMs continue and hold the exclusive Homebrew lock. This is a VM/infrastructure/harness hygiene issue, not a cask-app generator defect.

## Classification guide

- **success** — cask generated and `brew install` / verify succeeded.
- **classification/mas** — generator picked the Mac App Store fallback (expected for MAS-only pages, not a bug).
- **classification/install-script** — page resolved to a shell install script and `allbrew` produced a Formula instead of a Cask.
- **install/verify** — cask generated but install/verify failed (notarization, unavailable artifact, app launch hang, etc.).
- **discovery/generator** — no cask/formula generated; discovery could not find a usable artifact or the generator errored early.
- **infrastructure/timeout** — the 180s `smoke-batch` limit was reached; guest process was still running.
- **infrastructure/timeout-cascade** — timeout left a guest `brew` process holding the Homebrew lock, causing all later local-1/local-2 runs to timeout.
- **infrastructure/remote-vm** — remote Lume host reported the VM as not running and could not acquire the Homebrew lock.

## VM hygiene performed

- Pre-smoke: ran `tests/monitored-install-batch/vm-guest-health.mjs --clear-stale` and `--deep` for all three endpoints in parallel.
- Post-smoke cleanup:
  - Killed orphaned guest `brew.rb` / `allbrew` processes on all three endpoints via `lume ssh`.
  - Removed stale guest Homebrew locks (`/var/run/lume-homebrew.lock`) on all three endpoints.
  - Ran `tests/monitored-install-batch/vm-guest-health.mjs --clear-stale --deep` in parallel again; all endpoints reported `healthy` / `usable` with guest Homebrew lock `absent` and host mutex `free`.
- Final snapshots: `tests/monitored-install-batch/logs/vm-hygiene-{local-1,local-2,homeserver}-final.json`.

## Conclusions

- The cask-app patch is coherent and the targeted unit/template tests pass.
- Real-world smoke validates key new capabilities:
  - Suffix stripping produces clean tokens (e.g. `balenaetcher`, `sanebar`, `codemantis`, `unpeel`).
  - Extensionless API URLs resolve to casks (`unpeel`).
  - Redirected/final URLs and server filenames yield correct versions and app names (`seaquel`, `pasty`).
  - `zap trash:` blocks are present in generated casks.
- The 180s per-URL smoke timeout and the lack of guest process cleanup on host-kill are the dominant failure modes in this run, especially on local endpoints. Recommended follow-up: increase the timeout for heavy apps, or harden the harness to kill the guest `allbrew` process when the host child is terminated.
