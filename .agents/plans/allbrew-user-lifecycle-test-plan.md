# allbrew User Lifecycle Test Plan

> **Goal:** Close the gap between “allbrew emits valid Homebrew Ruby” and “a macOS user can trust allbrew as their global solution for installing, updating, tracking, and uninstalling CLIs, GUI apps, and long-running service apps (including tools they would otherwise install via `npm -g`, `uv tool`, `pipx`, `cargo install`, etc.).”
>
> **Status:** Tier 0 (PR0: T0.1–T0.4) **implemented** in the allbrew repo. T0.5 (PR0b: exclusive `/opt/homebrew` sparsebundle) **implemented** in `macos-testing-harness` (acquire/release/reset lifecycle, profile system, config fixes, tests, docs; allbrew `test-suite.ts` wiring + VM acceptance pending). **Tier A–C implemented** in the allbrew repo. Remaining work is the allbrew→harness migration, Lume VM acceptance, and the nightly user-journey profile. Derived from a full-suite evaluation (unit / integration / E2E catalog / E2E-tap / Lume VM) against real-world user personas.
>
> **Related plans:**
> - [`allbrew-tap-update-e2e.md`](./allbrew-tap-update-e2e.md) — fixture server + generate → tap install → livecheck update cycle (**implemented**)
> - [`allbrew-e2e-lume-vm.md`](./allbrew-e2e-lume-vm.md) — isolated macOS VM harness
> - [`macos-testing-harness/.../allbrew-migration.md`](https://github.com/tariqwest/macos-testing-harness/blob/main/.agents/plans/allbrew-migration.md) — harness migration; **exclusive `/opt/homebrew` sparsebundle model** (§2.5)
> - [`allbrew-test-cases.md`](./allbrew-test-cases.md) — research master table (~200 apps)
> - [`allbrew-hooks-uninstall-detection.md`](./allbrew-hooks-uninstall-detection.md) — OOB uninstall (feature + future tests)
> - [`allbrew-scan.md`](./allbrew-scan.md) / [`allbrew-switch.md`](./allbrew-switch.md) — planned features
> - [`fable-app-review-2026-07-11.md`](./fable-app-review-2026-07-11.md) — security hardening items that need adversarial tests

---

## 1. Problem statement

### 1.1 What the suite proves today

| Tier | Gate | Strength |
|------|------|----------|
| Unit (849) | always | Generators, templates, classifier, analyzer, brew-hooks, launchd-service, config, sha256, classifier conflict matrix, bin-name matrix, failure injection, cleanup registry, quarantine helper, CLI commands |
| Integration | live network | Registry/API fetch → payload → Ruby shape (`assertValidFormula`); live-smoke subset (one per registry) |
| E2E catalog (~49) | `E2E=1` | Generate → `brew install` from **file path** → `--version` / `open -a` → uninstall + residual checks |
| E2E-tap (~39) | `E2E_TAP=1` | Generate → git push → `brew install <name>` → livecheck → `update-formulas` → upgrade; service stanza + direct launch |
| E2E heavy (6) | `E2E_HEAVY=1` | Heavy real packages (one per ecosystem) + residual checks |
| E2E polluted PATH | `E2E=1` | `command -v` resolves to Homebrew Cellar despite same-named dummy earlier in PATH |
| Templates | always | Byte-for-byte Ruby parity |
| Lume VM | manual | Isolated macOS + timestamped run records; harness integration in progress |

**Strategy in one line:** strong *compiler* tests for “URL → valid Homebrew Ruby”; incomplete *product* tests for “this Mac’s apps stay installed, updated, running, and removable.”

### 1.2 What real users need proven

A power-user Mac treats allbrew as the system of record for:

1. **CLI / terminal tools** (replacements for `npm -g`, `uv tool install`, `cargo install`, raw tarballs).
2. **GUI apps** (DMG/ZIP/PKG, GitHub releases, MAS, Setapp).
3. **Long-running services** (daemons with optional web UIs: maildev, wakapi, godns, verdaccio, marimo-class tools).
4. **Day-2 ops** — auto-update via hooks/launchd, clean uninstall, no stale manifests/formulas.

The suite almost never asserts (2)–(4) beyond “binary prints a version” or “Ruby contains `service do`.”

### 1.3 Structural omissions (summary)

| # | Omission | Status | Evidence |
|---|----------|--------|----------|
| 1 | **Services disabled in E2E** | ⚠️ Partial | `tests/e2e/catalog.e2e.test.ts` still passes `--no-service` (Lume journeys will cover). `tests/e2e-tap/service.e2e-tap.test.ts` exercises `--service` generation, stanza inspection, direct launch + HTTP probe, and `brew services` start/stop. |
| 2 | **No `brew services` runtime** | ⚠️ Partial | e2e-tap service test covers start/stop; Lume full lifecycle (start → HTTP → upgrade → stop → no LaunchAgent) pending harness acceptance. |
| 3 | **No HTTP / web UI probes** | ✅ Fixed | `service.e2e-tap.test.ts` HTTP-probes `fake-service`. Lume probes for real services (maildev, wakapi-class) pending. |
| 4 | **Uninstall is cleanup, not a product assertion** | ✅ Fixed | `tests/helpers/uninstall-residuals.ts` wired into e2e + e2e-tap: `brew list` absent, bin/Cellar gone, app path absent, manifest persists. |
| 5 | **Hooks + launchd untested** | ⚠️ Partial | Unit suites for `brew-hooks` (15), `launchd-service` (15) and CLI --help. Lume activation smoke (sourced wrapper + `update-formulas` side effect) pending. |
| 6 | **GUI shallow** | ⏳ | `open -a` only; Gatekeeper, zap execution, helpers, multi-app DMGs still pending. Cua Driver integration in harness enables future GUI automation. |
| 7 | **MAS / Setapp** | ⏳ | Generation/integration only; e2e-tap explicitly out of scope. Live install requires credentials + Lume. |
| 8 | **Research catalog ≫ executable depth** | ⚠️ Partial | ~200 research apps vs 49 e2e. New `tests/e2e/catalog-heavy.json` adds 6 heavy real packages. No automated status column yet. |
| 9 | **Core modules without unit suites** | ✅ Fixed | `analyzer` (61), `config` (20), `sha256` (11), `brew-hooks` (15), `launchd-service` (15), `test-cleanup-registry` (15), `uninstall-residuals` (11), `classifier-conflict-matrix` (20), `bin-name-matrix` (16), `failure-injection` (12), `quarantine` (9), `cli-commands` (31). `archive-inspector`, `setup`, `github` still light or un-silofed. |
| 10 | **Synthetic fixtures too clean** | ⚠️ Partial | Heavy E2E uses real packages with native deps / postinstall. Still no Electron/notarized DMG fixture. |
| 11 | **Default CI path is unit-only** | ⚠️ Partial | Unit + templates + live-smoke gate feasible; full E2E remains optional.

---

## 2. Goals and non-goals

### 2.1 Goals

1. Define **user personas** and map each to concrete, automatable assertions.
2. Specify **test tiers** (unit / integration / e2e / e2e-tap / Lume nightly) for each gap so work lands in the right place.
3. Prioritize a **thin nightly “user journey” suite** that must pass on Lume before calling day-2 automation safe.
4. Link work to existing research catalog and planned features (scan / switch / uninstall-detection).
5. Improve **suite health** (flaky integration, fidelity of fixtures, residual-state checks).

### 2.2 Non-goals (this plan)

- Replacing the existing unit/generator matrix (keep it; it is the foundation).
- Full GUI automation with Cua for every cask (optional later; not required for Tier A).
- Live MAS/Setapp install in CI without test accounts (document limits; mock where possible).
- Implementing scan/switch/list/doctor features themselves (only their test requirements once shipped).
- Concurrent multi-user bottle-correct Homebrew on one macOS instance (macOS mounts are global; see T0.5 / harness migration §2.5).
- macFUSE/FSKit path spoofing of `/opt/homebrew` (rejected: FSKit cannot mount outside `/Volumes`; kext unavailable in VMs).

---

## 3. Current coverage baseline

### 3.1 E2E catalog (`tests/e2e/catalog.json`)

- ~49 entries across most generators.
- Flow: generate → install from **file** → `verifyCommand` → uninstall.
- Always `--no-service`.
- Verify is almost always `tool --version` or `open -a AppName`.
- Server-ish notes exist (maildev, wakapi, godns, process-compose, ddclient) but are not exercised as services.

### 3.2 E2E-tap (`tests/e2e-tap/`)

- Synthetic fixture server + disposable bare-repo taps.
- Per-family generate/install/update/upgrade paths.
- Cross-cutting: multi-package batch update, dry-run, no-op, livecheck error skip, manifest persistence, unmanaged skip.
- **Out of scope (by design in original plan):** real GitHub remote, GUI automation, MAS/Setapp, Linux.

### 3.3 Integration

- Live registry/API + Ruby validation.
- Known flakiness from third-party 404s/timeouts (especially cask-app URLs).
- Pip resources: block *existence* asserted; full heavy-graph install not guaranteed.

### 3.4 Unit

- Strong generator and template coverage.
- Service: string builder only (e2e-tap `service.e2e-tap.test.ts` covers direct launch + `brew services` start/stop round-trip).
- Classifier: many URL shapes; **crates.io now routes to `cargo-package`** (B3 conflict matrix; `tests/unit/classifier-conflict-matrix.test.ts`).
- Orchestration modules now covered: `analyzer` (61 tests), `brew-hooks` (15), `launchd-service` (15), `config` (20), `sha256` (11), `test-cleanup-registry` (15), `uninstall-residuals` (11), `bin-name-matrix` (16), `classifier-conflict-matrix` (20), `failure-injection` (12), `quarantine` (9), `cli-commands` (31).

### 3.5 Research master table

- [`.agents/plans/allbrew-test-cases.md`](./allbrew-test-cases.md): TUI/GUI/WebUI flags, bin-name notes, service hints.
- No automated status column (`unit` / `int` / `e2e` / `service-e2e`).
- Notes like “needs broker → service-block test” (flower) are archaeology, not tickets.

---

## 4. Personas (primary test design units)

Each persona is a **named journey** with setup, actions, and residual-state asserts. Prefer one solid persona over ten version-only catalog rows.

### P1 — CLI daily driver

| | |
|--|--|
| **Examples** | starship, npkill, process-compose, godns (CLI mode) |
| **User intent** | Replace raw binary / install script with brew-managed tool on PATH |
| **Must prove** | Install → correct bin on PATH → version → upgrade → uninstall → bin gone |
| **Today** | Partial (e2e version + uninstall exit 0) |
| **Add** | `which`/PATH identity; no leftover Cellar link; upgrade preserves identity |

### P2 — Global package-manager tool

| | |
|--|--|
| **Examples** | npm: maildev, cline, taskbook; pip: marimo, s-tui, toolong; cargo/go/gem/dotnet analogs |
| **User intent** | Stop using `npm -g` / `uv tool` / `pipx` / `cargo install`; one managed install |
| **Must prove** | Isolated runtime (node/python/virtualenv); bin name may ≠ package name; upgrade updates that bin |
| **Today** | Generate + some install smoke; bin mismatches mostly in research notes |
| **Add** | Bin-name matrix; optional “polluted PATH” env (existing `~/.local/bin` or npm prefix shadow); one heavy native-dep package per ecosystem |

### P3 — Background service + web UI

| | |
|--|--|
| **Examples** | maildev, wakapi, godns (web panel), verdaccio, json-server, flower (needs broker), marimo edit |
| **User intent** | Install once, `brew services start`, open browser, survive upgrade, clean stop on uninstall |
| **Must prove** | Service block *runtime*: start → HTTP probe → status → stop; logs if configured; uninstall clears launchd job |
| **Today** | **Gap** — `--no-service` everywhere; only Ruby text unit tests |
| **Add** | Service personas (Tier A, §6) |

### P4 — Desktop GUI

| | |
|--|--|
| **Examples** | Seaquel, LocalSend, UTM, Ollama, balenaEtcher |
| **User intent** | App installed via cask, opens, updates via brew, zap removes leftovers |
| **Must prove** | App path exists (Lume: `$HOME/Applications/<App>.app` under harness cask opts; production-default may be `/Applications`); launch does not immediately crash; uninstall removes app; `--zap` hits trash paths |
| **Today** | `open -a` smoke; zap strings only |
| **Add** | Path asserts under the active cask appdir; zap persona; optional quarantine/xattr note for real DMGs |

### P5 — MAS / Setapp

| | |
|--|--|
| **Examples** | Magnet (MAS), Bartender (Setapp) |
| **User intent** | Track store apps in tap; reinstall via mas/setapp-cli |
| **Must prove** | Cask generates; bootstrap paths; install when credentials/subscription available |
| **Today** | Integration/unit generation; Setapp e2e often skipped |
| **Add** | Document permanent mock limits; optional VM-with-account suite; never pretend CI covers live store |

### P6 — Day-2 automation operator

| | |
|--|--|
| **Examples** | Multi-package managed set on a personal Mac |
| **User intent** | After `brew update` or on schedule, formulas regenerate and upgrades apply without babysitting |
| **Must prove** | hooks wrapper runs update-formulas; launchd plist valid + script paths; concurrent run safe; dry-run safe |
| **Today** | update-formulas well covered in e2e-tap; **hooks/launchd not** |
| **Add** | Hooks + launchd smoke; lock-file tests when implemented |

### P7 — Ambiguous URL paster

| | |
|--|--|
| **Examples** | GitHub repo with releases + Package.swift + install.sh + npm package |
| **User intent** | Paste URL; get right generator or clear override |
| **Must prove** | Classifier + analyzer conflict matrix; `--type` override; “already in Homebrew” offer path |
| **Today** | Classifier happy paths; **analyzer largely untested** |
| **Add** | Analyzer unit suite + conflict fixtures |

### P8 — Clean uninstall / tracking integrity

| | |
|--|--|
| **Examples** | Any managed formula/cask |
| **User intent** | Remove app fully; tap + manifests stay consistent |
| **Must prove** | brew uninstall residuals; manifest lifecycle; OOB delete detection (when feature ships) |
| **Today** | Uninstall exit 0 only; `deleteManifest` only in test setup |
| **Add** | Residual checklist; feature tests per hooks/scan plans |

---

## 5. Gap catalog (detailed)

### 5.1 Long-running services

| Gap | Failure mode if untested | Tier |
|-----|--------------------------|------|
| No `brew services start/stop/status` | Wrong `run` args only appear at start | e2e / e2e-tap / Lume |
| No HTTP probe | CLI `--version` works while server fails | e2e |
| keep_alive unproven | Crash loops unnoticed | e2e (optional kill -9 restart) |
| log_path / error_log_path | Debugging story broken | unit + e2e |
| Analyzer service inference | Auto-service invents wrong command | unit (`analyzer`) |
| Upgrade while service running | Dead binary still launched by plist | e2e |
| Uninstall with service active | Leftover LaunchAgent | e2e |

### 5.2 Global tool replacement

| Gap | Failure mode | Tier |
|-----|--------------|------|
| PATH collisions with npm -g / cargo bin / `~/.local/bin` | Wrong binary runs | e2e (polluted PATH fixture) |
| Bin name ≠ package name | User types wrong command | unit + catalog matrix |
| Scoped npm install | Token/class/url bugs | e2e-tap or e2e |
| Native modules / postinstall | Fixture shells hide node-gyp failures | e2e (one real heavy pkg) |
| Heavy pip resource graphs | Wrong SHA / yanked dep | e2e selective |
| Multi-binary packages | Only first bin linked | unit + e2e |

### 5.3 GUI / cask

| Gap | Failure mode | Tier |
|-----|--------------|------|
| `open -a` only | Broken app “passes” | e2e (path + optional `mdls`) |
| Quarantine / Gatekeeper / notarization | Real DMG fails where fake works | Lume + real artifact |
| Multi-volume / nested .app / helpers | Wrong app stanza | unit archive-inspector + int |
| `.pkg` admin / pkgutil | Incomplete uninstall | e2e rare / manual |
| Privileged helpers / LaunchDaemons | Residual system state | documented manual / Lume |
| `brew uninstall --zap` never run | zap paths wrong | e2e zap persona |
| Auto-update Electron vs brew | Dual update channels | notes + optional e2e |
| GUI + companion CLI | Only one surface tracked | catalog note + dual verify |

### 5.4 Lifecycle / tracking

| Gap | Failure mode | Tier |
|-----|--------------|------|
| Manifest left after brew uninstall | Stale update-formulas targets | e2e residual |
| Hooks after brew update | Auto-update never runs | Lume smoke |
| Launchd schedule / paths / log rotate | Silent service failure | unit + Lume |
| Concurrent update-formulas | Corrupted tap/manifests | unit when lock ships |
| Partial failure cleanup | Temp files / half-written .rb | unit + int |
| list / info / remove / doctor | N/A until features ship | e2e when shipped |
| scan / switch / OOB uninstall | Feature plans | follow those plans’ test sections |

### 5.5 Classifier / analyzer / UX

| Gap | Failure mode | Tier |
|-----|--------------|------|
| No `analyzer.ts` unit suite | Wrong install method / service | unit |
| crates.io → unknown | Dead-end paste | unit + product fix |
| Conflict priority (releases vs SPM vs script vs registry) | Wrong generator | unit matrix |
| Interactive prompts | Headless-only confidence | unit with mocked inquirer or CLI flag matrix |
| `allbrew init` / config / token / remote | First-run breakage | unit + Lume once |
| Security edges (SSRF, huge download, rubyEscape adversarial) | Unsafe automation | unit (see fable review) |

### 5.6 Homebrew-native edge cases

| Gap | Failure mode | Tier |
|-----|--------------|------|
| Name collision with homebrew-core | Install wrong package / refusal | e2e or unit naming |
| Injected `depends_on allbrew` | Tap break if allbrew formula broken | e2e-tap |
| Arch asset selection (arm vs intel) | Wrong binary on arch | unit + e2e-tap arch assets |
| Rolling / latest-in-URL / :no_check | Livecheck/update wrong | int + e2e-tap |
| Install script ignores PREFIX | Files outside Cellar | e2e |
| Offline / rate-limit GitHub | Hang or opaque error | unit mocks |

### 5.7 Suite health

| Issue | Mitigation |
|-------|------------|
| Integration flakiness from third-party URLs | Pin known-good fixtures; quarantine flaky hosts; prefer e2e-tap fakes for structure |
| Synthetic fidelity gap | Keep fakes for lifecycle; add “heavy real” e2e spots for packaging realism |
| Optional gates hide product truth | Lume nightly must run e2e personas (not unit only) |
| Research notes not actionable | Status columns or companion checklist (§8) |

---

## 6. Implementation tiers

### Tier 0 — State isolation and recovery (prerequisite)

Ship this **before** any Tier A work that mutates host Homebrew or allbrew state. Without reliable snapshot/restore, every subsequent lifecycle test signal is unreliable and host-state-dependent.

#### T0.1 Snapshot and restore `~/.config/allbrew/`

The existing e2e-tap helper (`tests/e2e-tap/helpers/config.ts`) only backs up `config.json`, misreads the packages directory as a file, and cannot restore an initially-absent configuration. Replace it with:

1. Snapshot the **entire** `~/.config/allbrew/` directory — `config.json` **and** `packages/*.json` manifests.
2. Restore both cases:
   - pre-existing state (config + manifests), and
   - the "directory/config did not exist" case (delete the test-created directory on restore).
3. Snapshot at suite start (Vitest `globalSetup`), restore at suite end and on interruption.

#### T0.2 Remove test-created state even after failed tests

- Disposable taps: `brew untap --force` + remove work/remote dirs (extend `destroyDisposableTap` in `tests/e2e-tap/helpers/tap.ts`).
- Installed packages: `brew uninstall --force` for anything installed during the run.
- Service agents: `brew services stop` + `launchctl unload` for any service started during the run.
- Fixture processes: kill orphaned fixture server PIDs (track started PIDs in a registry; clean up in teardown and via a manual recovery script).

#### T0.3 Manual recovery for interrupted runs

Provide `scripts/test-local-cleanup.sh` with:
- `--dry-run` — show what would be removed without acting.
- `--restore` — restore the most recent snapshot.
- `--force` — skip confirmation prompts.

This covers the Ctrl-C / crash case where Vitest teardown does not run.

#### T0.4 Destructive lifecycle tests are Lume-first

Service lifecycle (A1), zap (A4), and hooks (A3) tests mutate launchd, app install locations, and Homebrew service state. These run on **Lume by default**; local execution is explicitly opt-in via an env flag (e.g., `ALLBREW_LIFECYCLE_LOCAL=1`). The e2e-tap runner is serialized (`vitest.config.ts` singleFork) but still operates against the active host's Homebrew installation with developer/trust bypass env vars (`tests/e2e-tap/helpers/run.ts`), so it is not a production-equivalence environment.

#### T0.5 Bottle-compatible Homebrew prefix on multi-user Lume VMs

Lifecycle journeys that install real formulae/casks, run `brew services`, or assert PATH/Cellar residuals must use a **real default prefix** (`/opt/homebrew` on Apple Silicon). Custom prefixes such as `$HOME/.homebrew` are **not** the primary model: many bottles refuse to pour or misbehave off the default prefix.

**Decided approach** (aligned with [`allbrew-migration.md` §2.5](https://github.com/tariqwest/macos-testing-harness/blob/main/.agents/plans/allbrew-migration.md)):

1. **Exclusive, time-multiplexed `/opt/homebrew`** — not concurrent per-user views of the same path.
2. Each Lume project user owns an APFS sparsebundle, e.g. `$HOME/Library/LumeHomebrew/homebrew.sparsebundle`.
3. Before Homebrew-mutating journeys/profiles, the harness:
   - acquires a VM-global lock;
   - detaches any volume at `/opt/homebrew`;
   - attaches that user’s sparsebundle at `/opt/homebrew`;
   - ensures a default-prefix Homebrew install exists on the volume;
   - runs tests as the project user with `/opt/homebrew/bin` on `PATH` and `HOMEBREW_CASK_OPTS=--appdir=$HOME/Applications`.
4. Always detach + unlock in `finally`; project reset deletes the sparsebundle (and recovers stale mounts/locks).
5. **Rejected:** macFUSE/FSKit spoofing of `/opt/homebrew` (global mounts; FSKit mountpoints limited to `/Volumes`; kext unsupported in VMs).
6. **Rejected as primary:** shared group-writable `/opt/homebrew`, or silent fallback to custom prefix for bottle/lifecycle tests.
7. **Concurrency:** multiple project users may coexist (homes, configs, sparsebundles); only one may hold `/opt/homebrew` at a time. Parallel bottle-heavy suites require separate VMs.

**Test implications:**

| Assertion surface | Expected path under Lume exclusive session |
|-------------------|--------------------------------------------|
| Formula bins | `/opt/homebrew/bin/<name>` → Cellar |
| Cask apps | `$HOME/Applications/<App>.app` (not system `/Applications`) |
| `brew --prefix` | `/opt/homebrew` |
| Service plists / `brew services` | Default-prefix Homebrew behavior |
| Residual checks after uninstall | Cellar/link gone under mounted prefix; cask path under `$HOME/Applications` |

Catalog/helper `verifyPaths` for Lume journeys should use `/opt/homebrew/...` for formulae and `$HOME/Applications/...` for casks. Local opt-in lifecycle runs may use the developer host’s existing Homebrew but must document non-isolation.

### Tier A — High leverage (do first)

Ship these before treating hooks/service automation as production-safe.

#### A1. Service lifecycle personas (Lume-first, 3 stacks minimum)

**Status: e2e-tap scope implemented (PR3).** `tests/e2e-tap/service.e2e-tap.test.ts` covers generation with `--service`, stanza inspection, direct launch + HTTP probe, and `brew services` start/stop round-trip for the `fake-service` fixture (binary-release). Lume full lifecycle (upgrade-while-running, no LaunchAgent residue) remains blocked by PR0b (T0.5 sparsebundle prefix).

Service runtime validation affects user-level launchd and Homebrew service state. It is **Lume-first**; e2e-tap covers only generation and stanza inspection.

| ID | Stack | Suggested real or fixture app | Tier | Assertions |
|----|-------|-------------------------------|------|------------|
| A1a | npm-package | maildev or fixture HTTP server | e2e-tap + Lume | see split below |
| A1b | pip-package | lightweight webui or fixture | e2e-tap + Lume | same |
| A1c | go-package or binary-release | wakapi / godns or fixture | e2e-tap + Lume | same |

**e2e-tap scope (deterministic, no `brew services`):**

- Generate **with** `--service` + command (new helper: `generateFormulaWithService`).
- Install from tap.
- Assert generated Ruby contains correct `service do` block, `run` args, `keep_alive`, log paths.
- Optionally directly launch the fixture executable (not via `brew services`) and HTTP-probe it, then kill the process. This validates the service command without touching launchd.

**Lume user journey scope (full `brew services` lifecycle):**

- `brew services start` → HTTP readiness probe (retry with timeout) → `brew services status` → upgrade-while-running → `brew services stop` → uninstall → assert no LaunchAgent remains (`launchctl list`, agent path absent).
- `brew services list` shows none after uninstall.

**Implementation requirements:**

- Do **not** pass `--no-service` for these tests.
- **Dynamically allocated ports**: each test records its port in a registry; no fixed ports (collisions with prior test residue cause false failures).
- **Unique formula/tap names per test run**: avoid collision with residue from prior runs (the e2e-tap `tapCounter` pattern in `tests/e2e-tap/helpers/tap.ts` is a starting point).
- Prefer controllable fixtures in e2e-tap for determinism; keep 1–2 real-catalog service smokes in Lume nightly.

**Files (expected):**

- `tests/e2e-tap/fixtures/` — service-capable fake apps that bind `127.0.0.1:$PORT` and return 200 on `/`.
- `tests/e2e-tap/service.e2e-tap.test.ts` (new) — stanza inspection + direct-launch smoke.
- `tests/e2e-lume/service-lifecycle.lume.test.ts` (new, gated) — full `brew services` lifecycle.
- `tests/e2e/catalog.json` — optional `serviceCommand` + `verifyHttp` fields for real apps.
- Extend `catalog.e2e.test.ts` / helpers to honor those fields.

#### A2. Uninstall residual checks (all e2e paths)

**Status: Implemented (PR1).** Helper: `tests/helpers/uninstall-residuals.ts`. Wired into e2e catalog + e2e-tap github-binary + e2e-tap service. 11 unit tests in `tests/unit/uninstall-residuals.test.ts`.

**Manifest semantics decision: Manifests persist** (allbrew is system of record). `deleteManifest` is currently dead code — plain `brew uninstall` has no call path that deletes a manifest. The residual helper asserts the manifest still exists after uninstall and does NOT assert `manifestGone`. Deletion will be handled by `allbrew remove`/doctor/OOB detection in Tier C / `allbrew-hooks-uninstall-detection.md`.

**Prerequisite — manifest semantics decision (required before implementation):**

A product decision must be made and documented **before** writing the residual helper. Today, generation and updates save manifests (`lib/manifest.ts` exposes `saveManifest` and `deleteManifest`), but plain `brew uninstall` has no call path that deletes a manifest. The residual helper must not assert behavior the product cannot perform.

| Decision | Helper behavior |
|----------|-----------------|
| **Manifests persist** (allbrew is system of record) ✅ chosen | Assert manifest still exists after `brew uninstall`; document that `allbrew remove`/`doctor` (Tier C) will handle deletion. Do not assert `manifestGone`. |
| **Manifests deleted on uninstall** | Implement an allbrew-owned uninstall/removal path (or out-of-band detection per `allbrew-hooks-uninstall-detection.md`) **first**. Only then assert `manifestGone`. Do not assert `manifestGone` after plain `brew uninstall`. |

The helper should assert only facts that are already valid product behavior.

After every successful uninstall in e2e and e2e-tap:

| Check | Formula | Cask |
|-------|---------|------|
| Not in `brew list` | yes | yes |
| Bin not resolving to Cellar (or gone) | yes | n/a |
| App path absent | n/a | yes |
| Manifest deleted **or** explicit product decision “manifests persist” documented + asserted | yes | yes |

If product choice is “manifests persist until `allbrew remove`,” document that and assert persistence; do not leave behavior accidental.

#### A3. Hooks smoke (Lume) — test actual activation

The hook wrapper is opt-in: it instructs users to source it and alias `brew` (`lib/brew-hooks.ts` `BREW_WRAP_CONTENT`). Testing only that the wrapper file exists is insufficient.

**Prerequisite — resolve the double-`brew update` question: Resolved (bug, fixed in PR2).**

`BREW_WRAP_CONTENT` in `lib/brew-hooks.ts` previously ran `command brew update` again after the wrapper's own `brew update` branch fired. This was a bug — the first `command brew "$@"` already executed `brew update`, making the trailing `command brew update` redundant. Fixed in PR2 (commit `fix(hooks): remove redundant double brew update`). The wrapper now runs `brew update` once, then `brew livecheck ... | allbrew update-formulas`. Unit tests in `tests/unit/brew-hooks.test.ts` assert no duplicate `command brew update` remains.

**Test sequence:**

1. Fresh VM or clean prefix.
2. `allbrew hooks install` → assert wrapper file exists at expected path.
3. Source the generated wrapper in a non-interactive shell.
4. Alias/invoke `brew` through `allbrew_brew` (the wrapper function).
5. Generate + install a managed package (fixture or catalog).
6. Mutate upstream (fixture) or simulate outdated livecheck.
7. Run `brew update` through the aliased wrapper (or invoke wrapper directly if `brew update` is too heavy).
8. Assert update-formulas side effect: formula version bumped, tap commit created, manifest updated, log line present.
9. Assert no unexpected side effects (e.g., double update does not cause duplicate commits if that is the resolved behavior).

#### A4. Zap persona (one cask)

1. Install cask with known `zap trash:` paths.
2. `brew uninstall --zap --cask <name>`.
3. Assert trash paths from generated cask are absent (or were present then removed).

#### A5. Analyzer unit suite

**Status: Implemented (PR2).** 61 tests in `tests/unit/analyzer.test.ts` covering `detectBrewInstall`, `detectInstallMethod`, `detectServiceConfig`, `detectServiceConfigFromFiles`, `detectBuildSystemFromFiles`, `detectBuildSystemFromArchive`. Uses inline README fixture strings (no I/O, no network, no brew calls). Also fixed a bug where `brew install --cask foo` was detected without `isCask=true`.

Fixtures under `tests/fixtures/readme/` (or similar):

| Fixture | Expect |
|---------|--------|
| README with `brew services start foo` | service hint + command |
| README with `npm i -g` only | npm install method |
| README with `brew install foo` | “already Homebrew” path signal |
| Multi-signal conflict | priority documented in test name |

Cover `lib/analyzer.ts` paths currently only exercised indirectly via CLI.

#### A6. Module unit smoke for ops code (split per module)

**Status: Implemented (PR2).** 61 tests across 4 new unit suites:
- `tests/unit/brew-hooks.test.ts` (15 tests): wrapper content assertions, path construction, install/uninstall round-trip with tmpdir prefix. Also asserts the double-`brew update` bug is fixed.
- `tests/unit/launchd-service.test.ts` (15 tests): `plistContent` XML validity + fields, `writeUpdateScript` PATH resolution + log rotation + executable mode + parent dir creation.
- `tests/unit/config.test.ts` (20 tests): 0o600 file perms, 0o700 dir perms, tap path validation, round-trip, GitHub token env fallback.
- `tests/unit/sha256.test.ts` (11 tests): SHA256 correctness, dest write, 404 rejection, 2GB size cap, multi-chunk streams, temp cleanup.

Testability seams added: `installBrewHooks`/`uninstallBrewHooks` optional prefix, `writeUpdateScript` optional allbrewBin/brewPrefix, `plistContent` exported, `_setConfigDirForTesting` for config dir override.

Minimal pure tests (no full brew). Each module has distinct testable surfaces — do not conflate them.

| Module | Test targets |
|--------|-------------|
| `brew-hooks.ts` | Pure wrapper content (`BREW_WRAP_CONTENT` string assertions); `brewWrapPath()` path construction; install writes to expected path; uninstall removes it. Use tmpdir + mocked `getBrewPrefix()` (no real brew call). |
| `launchd-service.ts` | **Update script** (`writeUpdateScript`): assert PATH resolution from `resolveAllbrewPath` + `getBrewPrefix`, log rotation at 10MB (`stat -f%z` branch), executable mode `0o755`, `set -euo pipefail` present. **Plist** (`plistContent`): assert XML validity, Label, ProgramArguments, StartInterval, RunAtLoad. Validate with `plutil -lint` in Lume. Do **not** assert "plist includes log rotation" — rotation lives in the update script, not the plist. |
| `config.ts` | File permissions `0o600` on write; invalid/missing tap path rejected by `set-tap` validation; round-trip read/write of config JSON. |
| `sha256.ts` | 10-minute fetch timeout behavior; 2GB size cap enforcement; temp-file cleanup on success and failure. Use mock/small fixtures, not real downloads. |

---

### Tier B — Fidelity and edge coverage

#### B1. Bin-name matrix

**Status: Implemented.** `tests/unit/bin-name-matrix.test.ts` (16 tests). Added `extractNpmBinName()` to `lib/generators/npm-package.ts` which extracts the bin name from npm package metadata (`bin` field — string or object). Added `--bin-name` CLI option for manual override (needed for pip packages like Orange3 where the bin name `orange-canvas` differs from the package name and pip metadata doesn't expose it in a standard way). All generators now respect `options.binName`. Known mismatches covered: taskbook→tb, toolong→tl, elia-chat→elia (auto-extracted from npm), Orange3→orange-canvas (manual `--bin-name`).

Drive from research notes + catalog:

| Package | Expected bin |
|---------|--------------|
| taskbook | `tb` |
| toolong | `tl` |
| elia-chat | `elia` |
| orange3 | `orange-canvas` |
| (others in master table notes) | … |

Unit or integration: payload / formula links correct bin. E2E: verifyCommand uses real bin.

#### B2. Heavy real packages (one per ecosystem)

| Ecosystem | Purpose |
|-----------|---------|
| pip | multi-resource + optional native wheel |
| npm | optional native addon or postinstall |
| cargo/go | real build or real binary release naming quirks |
| cask | real notarized DMG once on Lume |

Goal: catch packaging failures fixtures hide. Keep count small (slow).

**Status: Implemented.** `tests/e2e/catalog-heavy.json` + `tests/e2e/heavy.e2e.test.ts`. Gated behind `E2E_HEAVY=1` (separate from `E2E=1`). 6 packages: napari/streamlit/mlflow (pip, multi-resource + deep deps), json-server (npm, postinstall), wakapi/ripgrep (Go binary release, real asset naming). Run: `bun run test:e2e-heavy`.

#### B3. Classifier / routing conflict matrix

**Status: Implemented.** `tests/unit/classifier-conflict-matrix.test.ts` (20 tests). Table-driven conflict matrix covering all routing paths + priority resolution + `classifyWithHead` content-type sniffing. Also fixed: `crates.io` URLs now route to `cargo-package` (was `unknown` — added `CRATES_PACKAGE_RE` to `lib/classifier.ts`). The `--type` override is handled in the CLI flow, not the classifier; documented in tests.

Table-driven unit tests:

| Inputs present | Expected strategy |
|----------------|-------------------|
| GitHub releases with darwin assets | binary-release or cask-app-release |
| Package.swift dominant | spm / mint |
| install.sh only | install-script |
| npmjs.com URL | npm-package |
| crates.io URL | **desired:** cargo path (product fix if still unknown) |
| Ambiguous multi-signal | documented winner + `--type` override test |

#### B4. Failure injection

**Status: Implemented.** `tests/unit/failure-injection.test.ts` (12 tests). Covers: push failure (commitAndPushTap throws on unreachable remote — no silent success), missing manifest (update-formulas skips unmanaged), livecheck status error (skip), not-outdated (skip), name filtering, tapPath filtering, push failure collected into `result.errors` (not crashed). Also improved: `lib/cli.ts` now warns on push failure instead of silently swallowing; `lib/update-formulas.ts` collects push errors into `result.errors` instead of crashing. Mid-download abort (temp cleanup) is covered by the existing sha256 unit tests. Concurrent update-formulas lock is documented as not-yet-implemented.

| Case | Expect |
|------|--------|
| Livecheck status error | skip (already e2e-tap) ✅ |
| Push failure | no silent success; clean message ✅ |
| Mid-download abort | temp cleanup ✅ (sha256 unit tests) |
| Concurrent update-formulas | lock or serialized (when implemented) — documented |
| Missing manifest | skip unmanaged (already) ✅ |

#### B5. Polluted PATH persona

**Status: Implemented.** `tests/e2e/polluted-path.e2e.test.ts`. Gated behind `E2E=1`. Creates a dummy same-named binary earlier in PATH, then verifies `command -v <bin>` resolves to the Homebrew Cellar path (not the dummy). Also includes a sanity check that the dummy is reachable when Homebrew is removed from PATH.

E2E with env:

```text
PATH="$HOME/.local/bin:/opt/homebrew/bin:..."
```

Pre-install a dummy same-named binary earlier in PATH; after allbrew install, assert `command -v` resolves to Cellar/Homebrew path (or document intentional behavior).

#### B6. Integration quarantine

**Status: Implemented.** `tests/integration/helpers/quarantine.ts` provides `quarantine()`, `isQuarantined()`, `isLiveSmoke()`, `isPackageQuarantined()`, `QUARANTINED_PACKAGES`, `LIVE_SMOKE_PACKAGES`. `tests/integration/live-smoke.int.test.ts` is a small subset (one package per registry: npm/PyPI/RubyGems/NuGet). `tests/unit/quarantine.test.ts` (9 tests) covers the helper. New npm scripts: `test:int:gate` (excludes quarantined tests), `test:live-smoke` (runs only the live smoke set, allowed to fail separately from CI gate).

- Tag flaky external hosts. ✅
- Prefer hash-pinned URLs or fixture mirrors for structure tests. (existing integration tests use real registries; fixture mirrors are in e2e-tap)
- Keep a small "live smoke" set that is allowed to fail separately from CI gate. ✅

---

### Tier C — Product completeness (as features land)

**Status: Existing CLI commands tested.** `tests/unit/cli-commands.test.ts` (31 tests) covers the config module functions (set-tap, get-tap, set-update-auto-push, set-update-schedule, set-token, set-remote, getGithubToken with env fallback, file permissions 0o600/0o700, round-trip) and CLI subprocess invocations (--help, --version, config show/get-tap, hooks/service --help). The remaining Tier C features (list, remove, doctor, scan, switch, uninstall detection hooks) are not yet implemented and will be tested as they land.

| Feature | Tests required when shipping |
|---------|------------------------------|
| `allbrew list` / `info` | Unit + e2e against manifests + brew list |
| `allbrew remove` | Removes formula/cask/manifest; residual checklist |
| `allbrew doctor` | Detects stale manifests, broken taps, missing hooks |
| `allbrew scan` | Per [`allbrew-scan.md`](./allbrew-scan.md) |
| `allbrew switch` | Per [`allbrew-switch.md`](./allbrew-switch.md) |
| Uninstall detection hooks | Per [`allbrew-hooks-uninstall-detection.md`](./allbrew-hooks-uninstall-detection.md) |
| MAS/Setapp live | Optional Lume + credentials; never block default CI |

---

## 7. Nightly “user journey” suite (Lume)

A fixed, short list that must pass on the Lume harness (local or remote). **Not** the full 49-catalog × all generators.

### 7.1 Proposed journey set (10 max)

| # | Persona | Journey name | Approx time budget |
|---|---------|--------------|--------------------|
| 1 | P1 | CLI binary-release: install → version → uninstall residual | 5m |
| 2 | P2 | npm formula: install → bin → uninstall residual | 5m |
| 3 | P2 | pip formula: install → bin → uninstall residual | 8m |
| 4 | P3 | Service + HTTP (fixture or maildev-class) | 8m |
| 5 | P4 | Cask GUI: install → app path → uninstall | 5m |
| 6 | P4 | Cask zap (one app) | 5m |
| 7 | P6 | e2e-tap update cycle (one registry family) | 10m |
| 8 | P6 | Hooks smoke | 10m |
| 9 | P1/P2 | Upgrade path after update-formulas | 10m |
| 10 | P7 | Classifier/analyzer fixture pack (unit in VM is fine) | 2m |

### 7.2 Runner

- Add a `user-journeys` profile to allbrew’s `test-suite.ts` (run via `bun run vm:test --profile user-journeys` after the harness migration; see [`allbrew-migration.md`](https://github.com/tariqwest/macos-testing-harness/blob/main/.agents/plans/allbrew-migration.md)). The legacy `scripts/e2e-vm-run-tests.sh` will be removed once the harness migration is complete.
- Record results under `tests/e2e-runs/<ts>/` with explicit journey pass/fail section in `readout.txt`.
- Failure of any Tier A journey blocks “hooks/service ready” claim in AGENTS status table.

### 7.2.1 Operational model (required for reliable nightly)

| Requirement | Detail |
|-------------|--------|
| Clean-VM precondition | Reset or fresh clone before nightly run; no assumption of prior state. |
| Exclusive Homebrew prefix | Journeys run under harness `acquireHomebrewPrefix` for the project user (real `/opt/homebrew` sparsebundle). No custom-prefix fallback. |
| Single runner-owned workspace | All journeys operate within one project user/workspace holding the Homebrew lock for the run; no cross-project concurrent `/opt/homebrew` use. |
| Per-journey timeout and cleanup | Each journey has its own timeout; cleanup runs after each journey regardless of pass/fail. |
| Final residue audit | After all journeys: `brew services list`, launch agents, taps, manifests, `$HOME/Applications`, disk usage, Homebrew mount/lock state. Record in readout. |
| Prefix release | Detach `/opt/homebrew` and release lock after the journey suite (`finally`), even on failure. |
| Machine-readable result file | `tests/e2e-runs/<ts>/journeys.json` with per-journey `{name, status, duration, error?}`. Not only human-readable `readout.txt`. |
| Retry policy | Retry only transient network failures (timeout, DNS, 5xx). Never retry product/service failures — those are real signals. |

### 7.3 Harness migration — items now unblocked for implementation

T0.5 is implemented in `macos-testing-harness` (`src/lib/homebrew-prefix.ts` with VM-global lock, per-user APFS sparsebundle at `/opt/homebrew`, acquire/release/reset, stale recovery; profile system in `src/lib/hooks.ts` / `src/cli.ts`; wiring in setup/run/reset/readout; 37 self-tests passing). The allbrew side still needs `test-suite.ts` wiring, a VM acceptance run, and the nightly user-journey profile. The following plan items are **no longer blocked** by harness migration and should proceed:

1. **A1 Lume service personas**
   - Add `user-journeys` profile steps in `test-suite.ts` for at least 3 service stacks (npm/pip/go-binary).
   - Assert full `brew services` lifecycle: start → HTTP readiness probe → status → upgrade-while-running → stop → uninstall → no LaunchAgent remains.
   - Use dynamically allocated ports and unique per-run formula/tap names.
   - Target: `maildev` (npm), `marimo` or `s-tui` (pip), `wakapi` or `godns` (go/binary-release).

2. **A3 Hooks smoke**
   - In a Lume journey: `allbrew hooks install` → source wrapper in a non-interactive shell → alias `brew` to `allbrew_brew` → run `brew update` → assert `update-formulas` side effect (tap commit or manifest recordedVersion change).
   - Verify the wrapper no longer has the double-`brew update` bug.

3. **A4 Zap persona**
   - One Lume journey for a cask with zap stanzas (e.g. `bartender` Setapp or a GitHub cask with `zap trash:`).
   - Install → `brew uninstall --zap` → assert app path, preferences, and residual files removed.

4. **Tier A residual checks on Lume**
   - Reuse `tests/helpers/uninstall-residuals.ts` in Lume journeys to assert: `brew list` absent, bin/Cellar gone, app path absent, manifest persists.
   - Add cask `$HOME/Applications` vs system `/Applications` assertion.

5. **Nightly operational model**
   - Implement `bun run vm:test --profile user-journeys` (≤10 journeys).
   - Generate `tests/e2e-runs/<ts>/journeys.json` per harness contract.
   - Extend harness `readout` with `brew services list`, launch agents, taps, manifests, `$HOME/Applications`, disk usage, Homebrew mount/lock state.
   - Enforce clean-VM precondition (reset or fresh clone before nightly).
   - Document retry policy: transient network only.

### 7.4 What remains optional

- Full `E2E=1` catalog (49) — weekly or on-demand.
- Full e2e-tap (39) — on generator/updater PRs + weekly.
- MAS/Setapp live — manual/scheduled with secrets.

---

## 8. Research catalog linkage

### 8.1 Status tracking (recommended)

Add optional columns to the workflow (not necessarily the 24-col master table) via a companion checklist file or skill:

| Column | Values |
|--------|--------|
| `unit` | blank / pass / n/a |
| `int` | blank / pass / flaky / n/a |
| `e2e` | blank / pass / skip / n/a |
| `service_e2e` | blank / pass / n/a |
| `persona` | P1–P8 ids |

Or maintain `tests/e2e/personas.json` mapping persona → catalog entries / fixture apps → verify steps.

### 8.2 Promote research notes to tickets

Examples already in master table that should become persona tests:

- flower: “needs a broker → service-block test”
- bin ≠ package name rows
- IconChamp-class privileged helper (manual / Lume only)
- WebUI apps (mlflow, streamlit, smashing, geminabox) — candidate P3 set

Use `/add-test-case` skill when promoting an app into executable suites; require persona + verify steps, not only generator.

---

## 9. Fixture and harness extensions

### 9.1 Service-capable fixtures (e2e-tap)

Minimal fake apps that:

1. Install a bin which binds `127.0.0.1:$PORT` and returns 200 on `/`.
2. Print version on `--version`.
3. Support version mutation for update cycle.

Place under `tests/e2e-tap/fixtures/artifacts.ts` (or dedicated server handlers).

### 9.2 Catalog schema extensions (`catalog.json`)

Optional fields:

```json
{
  "serviceCommand": "maildev",
  "verifyHttp": { "url": "http://127.0.0.1:$PORT", "expectStatus": 200 },
  "verifyPaths": ["/opt/homebrew/bin/maildev"],
  "verifyAppPaths": ["$HOME/Applications/Example.app"],
  "uninstallAsserts": { "manifestGone": true, "binGone": true },
  "zap": true
}
```

On Lume, formula `verifyPaths` assume the exclusive default prefix session (`/opt/homebrew`). Cask app paths use `$HOME/Applications` when `HOMEBREW_CASK_OPTS=--appdir=$HOME/Applications` is set by the harness.

### 9.3 Helper APIs

| Helper | Role |
|--------|------|
| `generateWithService(ctx, app, cmd)` | Opposite of forced `--no-service` |
| `assertUninstallResiduals(ctx, app)` | Shared residual checklist |
| `waitForHttp(url, opts)` | Retrying probe |
| `brewServices(ctx, action, name)` | start/stop/list |

### 9.4 Lume readout extensions

Add to harness `readout` (via allbrew `test-suite.ts` `readoutSteps`; legacy `e2e-vm-readout.sh` will be removed per [`allbrew-migration.md`](https://github.com/tariqwest/macos-testing-harness/blob/main/.agents/plans/allbrew-migration.md)):

- `brew services list`
- LaunchAgents mentioning allbrew/managed formulas
- Manifest count + names
- Journey summary JSON
- Homebrew exclusive-session state: lock holder, whether `/opt/homebrew` is mounted, sparsebundle path, `brew --prefix`
- `$HOME/Applications` listing for the project user

---

## 10. Priority order and dependencies

```text
T0 state isolation/recovery
  (config snapshot + exclusive /opt/homebrew sparsebundle) ─┐
                                                             ▼
A5 analyzer unit ─────────────────────────────┐
A6 hooks/launchd/config/sha256 unit ──────────┤
A2 residual uninstall checks (post-decision) ─┼─► A1 service e2e-tap + Lume personas
A1 fixtures for HTTP service ─────────────────┤
                                              ├─► A3 hooks Lume activation smoke
                                              └─► A4 zap persona
                                                      │
                                                      ▼
                                              B1–B6 fidelity
                                                      │
                                                      ▼
                                              C features as shipped
```

**Tier 0 is a hard prerequisite.** Do not start Tier A work that mutates host or Lume Homebrew state until config snapshot/restore **and** the exclusive default-prefix strategy (T0.5 / harness §2.5) are reliable.

**Do not** claim hooks/service install are production-ready until **A1 + A2 + A3** pass on Lume.

Security items in [`fable-app-review-2026-07-11.md`](./fable-app-review-2026-07-11.md) should gain adversarial unit tests in parallel (rubyEscape, archive traversal, config perms)—orthogonal but required before unattended automation.

---

## 11. Acceptance criteria

### 11.0 Tier 0 done when

- [x] `~/.config/allbrew/` (config + manifests) is snapshotted and restored across e2e/e2e-tap runs, including the "directory did not exist" case.
- [x] Test-created disposable taps, installed packages, service agents, and fixture processes are removed even after failed/interrupted tests.
- [x] `scripts/test-local-cleanup.sh --dry-run|--restore|--force` exists and works for manual recovery.
- [x] Destructive lifecycle tests (services, zap, hooks) are Lume-first; local execution requires explicit opt-in.
- [x] Lume Homebrew uses exclusive real `/opt/homebrew` via per-user sparsebundle + mutex (T0.5); no FUSE spoof; no primary custom-prefix E2E path. *(PR0b implemented in `macos-testing-harness`; VM acceptance pending.)*
- [x] Acquire/release/reset of the prefix is documented and verified (detach + lock release on failure; sparsebundle deleted on project reset). *(Unit tests pass; VM acceptance pending.)*
- [ ] Cask installs in Lume target `$HOME/Applications`; system `/Applications` stays clean across runs. *(Requires VM acceptance run.)*

### 11.1 Tier A done when

- [x] Manifest semantics decision documented (persist vs delete); residual helper asserts only valid product behavior.
- [ ] At least 3 service personas (npm, pip, go/binary) pass: e2e-tap covers stanza + direct-launch; Lume covers full `brew services` lifecycle + HTTP + residual uninstall. **Unblocked by harness T0.5; implement via `test-suite.ts` `user-journeys` profile.**
- [ ] Service tests use dynamically allocated ports and unique per-run formula/tap names. **Unblocked; part of A1 Lume implementation.**
- [x] Shared residual uninstall helper used by e2e + e2e-tap.
- [x] Analyzer has a dedicated unit suite with README fixtures.
- [ ] Hooks smoke passes on Lume: wrapper is sourced, `brew` is invoked through `allbrew_brew`, update-formulas side effect is asserted. Double-`brew update` question resolved. **Unblocked by harness T0.5; implement as a Lume journey.**
- [ ] One zap persona passes. **Unblocked by harness T0.5; implement as a Lume journey.**
- [x] Ops modules have split unit coverage: `brew-hooks` (wrapper content/path), `launchd-service` (update script + plist separately, `plutil -lint` in Lume), `config` (perms/validation), `sha256` (limits/cleanup).
- [x] AGENTS.md testing section updated to reflect service/lifecycle coverage (residual checks, live-smoke, heavy E2E, polluted PATH, new npm scripts, unit-test counts).

### 11.2 Tier B done when

- [x] Bin-name matrix covers research-known mismatches used in e2e catalog.
- [x] One heavy real package per major ecosystem in optional e2e list.
- [x] Classifier conflict matrix exists; crates.io UX decided (fix or document).
- [x] Failure injection covers push/download/concurrent (as features exist).
- [x] Integration flaky hosts quarantined or mirrored.

### 11.3 Nightly done when

- [ ] `bun run vm:test --profile user-journeys` (harness migration; see [`allbrew-migration.md`](https://github.com/tariqwest/macos-testing-harness/blob/main/.agents/plans/allbrew-migration.md)) runs ≤10 journeys. Legacy `scripts/e2e-vm-run-tests.sh` removed.
- [ ] Run record includes journey pass/fail.
- [ ] `journeys.json` machine-readable result file written per run.
- [ ] Clean-VM precondition enforced (reset or fresh clone before nightly).
- [ ] Journeys hold exclusive `/opt/homebrew` for the project user; readout records prefix/mount/lock state.
- [ ] Final residue audit (services, launch agents, taps, manifests, `$HOME/Applications`, disk) recorded in readout.
- [ ] Retry policy limited to transient network failures; product/service failures never retried.
- [ ] Documented cadence (nightly on remote Lume host).

---

## 12. Mapping: evaluation findings → work items

| Evaluation finding | Work item IDs |
|--------------------|---------------|
| Host state mutation without reliable restore | T0, A2 |
| Multi-user VM vs bottle-required `/opt/homebrew` | T0.5, harness migration §2.5 |
| `--no-service` everywhere | A1, catalog schema, helpers |
| No brew services / HTTP | A1, A1 fixtures |
| Uninstall only exit 0 | A2 (post manifest-semantics decision) |
| Hooks/launchd untested | A3, A6 |
| GUI shallow / zap never run | A4, B optional Gatekeeper |
| Analyzer untested | A5, B3 |
| Global tool / PATH / bin mismatch | B1, B5, B2 |
| Research ≫ executable | §8 personas.json / status |
| Synthetic fidelity | B2, A1 real smokes |
| Default CI unit-only | §7 nightly journeys |
| Missing module unit tests | A6 |
| MAS/Setapp limits | Tier C + docs |
| Concurrent update / lock | B4 + product work |
| scan/switch/OOB uninstall | Tier C + feature plans |

---

## 13. Out-of-scope reminders (carry forward)

From e2e-tap plan — still valid unless explicitly expanded:

- Real GitHub remote for tap push (bare repo remains default).
- Full Cua GUI automation for every cask.
- Linux formula install.
- Live MAS/Setapp without credentials.

Also out of scope unless product direction changes:

- Concurrent bottle-correct Homebrew for multiple project users on one VM.
- macFUSE/FSKit (or bindfs) spoofing of `/opt/homebrew`.
- Primary reliance on `$HOME/.homebrew` / other custom prefixes for Lume lifecycle or bottle pours.

This lifecycle plan **does** expand scope for services, residuals, hooks, zap, analyzer, and **exclusive default-prefix Lume Homebrew**—because those are product-critical for the “global solution” claim.

---

## 14. Suggested first PR sequence

1. **PR0 — Local/Lume state snapshot, restoration, and interrupted-run recovery** (Tier 0.1–0.4)  
   Hard prerequisite for config/manifest isolation. Without this, every subsequent lifecycle test signal is unreliable.

2. **PR0b — Exclusive `/opt/homebrew` sparsebundle + mutex in Lume harness** (Tier 0.5; harness migration §2.5) — **implemented**  
   Required before bottle-faithful Lume journeys, services, hooks, and residual PATH/Cellar asserts. Lands primarily in `macos-testing-harness`, then allbrew `test-suite` wiring. Implemented: `src/lib/homebrew-prefix.ts` (acquire/release/reset with lock, sparsebundle create/attach/detach, ensure brew, stale recovery); profile system in `src/lib/hooks.ts` + `src/cli.ts` (`--profile`, `--no-default`); wiring in setup/run/reset/readout; config fixes (`.env` precedence, default `test-suite.ts`, project name from basename, user-local default PATH); 37 tests passing; `.env.example`, `README.md`, `PLAN.md` updated.

3. **PR1 — Shared uninstall residual helper** (A2, post-decision)  
   Asserts only facts that are already valid product behavior. Requires manifest semantics decision first.

4. **PR2 — Analyzer, hooks, launchd, config, and SHA256 unit seams/tests** (A5 + A6)  
   Offline, fast, unblocks correct service auto-detection and ops module confidence.

5. **PR3 — Service-capable fixture + service-stanza tests in e2e-tap** (A1 e2e-tap scope)  
   Deterministic: stanza inspection + direct-launch smoke. No `brew services`.

6. **PR4 — Lume service lifecycle journeys** (A1 Lume scope)  
   Requires PR0b. Full `brew services` start/status/stop + HTTP + upgrade + uninstall residual under exclusive `/opt/homebrew`. One controllable service, then expand to npm/pip/go-or-binary.

7. **PR5 — Hook activation + update lifecycle smoke in Lume** (A3)  
   Requires PR0b and double-`brew update` question resolved first. Tests actual wrapper sourcing and `allbrew_brew` invocation.

8. **PR6 — Zap persona + catalog schema support** (A4 + catalog schema)

9. **PR7 — `--user-journeys` runner, reset, and structured reporting** (§7)  
   Includes `journeys.json`, clean-VM precondition, exclusive-prefix acquire/release, residue audit, retry policy.

10. **Later — B1–B6, Tier C** as capacity allows.

---

## 15. Document history

| Date | Change |
|------|--------|
| 2026-07-21 | Initial plan from full-suite evaluation (user-lifecycle lens: CLI, GUI, services, global tools, day-2 ops). |
| 2026-07-21 | Refined after assessment: added Tier 0 isolation prerequisite, Lume-first services, manifest semantics decision gate, hooks activation test, A6 testability split, nightly operational model, revised PR sequence. |
| 2026-07-21 | Homebrew multi-user isolation: reject macFUSE/FSKit and primary `$HOME/.homebrew`; adopt exclusive `/opt/homebrew` sparsebundle + mutex (T0.5), cask appdir under `$HOME/Applications`, PR0b, nightly/readout/acceptance updates; link harness migration plan. |
| 2026-07-21 | Tier 0 (PR0) implemented in allbrew repo: test-cleanup-registry (fixture PID + service agent tracking, orphan kill/stop/purge), wired into e2e-tap server/teardown + e2e catalog afterAll + local runner; `scripts/test-local-cleanup.sh --force` extended to kill orphaned fixtures + stop services + purge registries; `tests/helpers/lifecycle-gate.ts` + `tests/e2e-lume/` scaffold for Lume-first destructive tests (`ALLBREW_LIFECYCLE_LOCAL=1` / `ALLBREW_LUME=1`); 15 unit tests for the registry. T0.5 (PR0b) remains pending in macos-testing-harness. |
| 2026-07-21 | PR0b (T0.5) implemented in `macos-testing-harness`: `src/lib/homebrew-prefix.ts` (acquire/release/reset with VM-global lock, per-user APFS sparsebundle create/attach/detach at `/opt/homebrew`, ensure default-prefix brew, stale lock/mount recovery, injectable shell runner for tests); profile system (`src/lib/hooks.ts` resolveSteps/profilesNeedHomebrew, `src/cli.ts` `--profile`/`--no-default`, `test-suite.example.ts`); wiring in setup (sparsebundle provisioning + private workspace staging), run (acquire/release around Homebrew-requiring profiles), reset (detach + delete sparsebundle + stale lock cleanup), readout (prefix state section); config fixes (process env overrides `.env`, default `test-suite.ts`, project name from host dir basename, user-local default PATH, Homebrew prefix config fields); 37 tests passing; `.env.example`, `README.md`, `PLAN.md` updated. VM acceptance run pending. |
| 2026-07-21 | Updated stale script references: §7.2 runner and §11.3 nightly criteria now point to `bun run vm:test --profile user-journeys` (harness migration) instead of `scripts/e2e-vm-run-tests.sh`; §9.4 readout extensions now reference harness `readout` via `test-suite.ts` `readoutSteps` instead of legacy `e2e-vm-readout.sh`. Aligned with [`allbrew-migration.md`](https://github.com/tariqwest/macos-testing-harness/blob/main/.agents/plans/allbrew-migration.md) which removes those scripts. |
| 2026-07-21 | Tier A–C implemented in allbrew repo: A1 (e2e-tap service stanza + direct launch), A2 (uninstall residual helper + manifest persistence), A5 (analyzer unit suite), A6 (brew-hooks/launchd-service/config/sha256 unit suites); B1 (bin-name matrix + `extractNpmBinName()` + `--bin-name` CLI option), B2 (heavy real packages E2E list), B3 (classifier conflict matrix + crates.io → cargo-package), B4 (failure injection + improved push-failure handling), B5 (polluted PATH E2E test), B6 (integration quarantine + live-smoke subset); Tier C (existing CLI command tests). Updated §1.1 baseline (849 unit tests, E2E heavy/polluted PATH), §3.4 unit coverage, structural omissions table, and added §7.3 listing items now unblocked by harness T0.5. Unit tests: 849 passing. |
