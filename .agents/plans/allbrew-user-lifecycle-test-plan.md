# allbrew User Lifecycle Test Plan

> **Goal:** Close the gap between “allbrew emits valid Homebrew Ruby” and “a macOS user can trust allbrew as their global solution for installing, updating, tracking, and uninstalling CLIs, GUI apps, and long-running service apps (including tools they would otherwise install via `npm -g`, `uv tool`, `pipx`, `cargo install`, etc.).”
>
> **Status:** Plan only. Implementation not started. Derived from a full-suite evaluation (unit / integration / E2E catalog / E2E-tap / Lume VM) against real-world user personas.
>
> **Related plans:**
> - [`allbrew-tap-update-e2e.md`](./allbrew-tap-update-e2e.md) — fixture server + generate → tap install → livecheck update cycle (**implemented**)
> - [`allbrew-e2e-lume-vm.md`](./allbrew-e2e-lume-vm.md) — isolated macOS VM harness
> - [`allbrew-test-cases.md`](./allbrew-test-cases.md) — research master table (~200 apps)
> - [`allbrew-hooks-uninstall-detection.md`](./allbrew-hooks-uninstall-detection.md) — OOB uninstall (feature + future tests)
> - [`allbrew-scan.md`](./allbrew-scan.md) / [`allbrew-switch.md`](./allbrew-switch.md) — planned features
> - [`fable-app-review-2026-07-11.md`](./fable-app-review-2026-07-11.md) — security hardening items that need adversarial tests

---

## 1. Problem statement

### 1.1 What the suite proves today

| Tier | Gate | Strength |
|------|------|----------|
| Unit (~600) | always | Generators, templates, classifier, service *string* builders, some updater paths |
| Integration | live network | Registry/API fetch → payload → Ruby shape (`assertValidFormula`) |
| E2E catalog (~49) | `E2E=1` | Generate → `brew install` from **file path** → `--version` / `open -a` → uninstall |
| E2E-tap (~39) | `E2E_TAP=1` | Generate → git push → `brew install <name>` → livecheck → `update-formulas` → upgrade |
| Templates | always | Byte-for-byte Ruby parity |
| Lume VM | manual | Isolated macOS + timestamped run records |

**Strategy in one line:** strong *compiler* tests for “URL → valid Homebrew Ruby”; incomplete *product* tests for “this Mac’s apps stay installed, updated, running, and removable.”

### 1.2 What real users need proven

A power-user Mac treats allbrew as the system of record for:

1. **CLI / terminal tools** (replacements for `npm -g`, `uv tool install`, `cargo install`, raw tarballs).
2. **GUI apps** (DMG/ZIP/PKG, GitHub releases, MAS, Setapp).
3. **Long-running services** (daemons with optional web UIs: maildev, wakapi, godns, verdaccio, marimo-class tools).
4. **Day-2 ops** — auto-update via hooks/launchd, clean uninstall, no stale manifests/formulas.

The suite almost never asserts (2)–(4) beyond “binary prints a version” or “Ruby contains `service do`.”

### 1.3 Structural omissions (summary)

| # | Omission | Evidence |
|---|----------|----------|
| 1 | **Services disabled in E2E** | `tests/e2e/catalog.e2e.test.ts` and `tests/e2e-tap/helpers/setup.ts` always pass `--no-service` |
| 2 | **No `brew services` runtime** | Unit tests only check Ruby text (`tests/unit/service.test.ts`) |
| 3 | **No HTTP / web UI probes** | Catalog servers (maildev, wakapi, godns) only run `--version` / `-h` |
| 4 | **Uninstall is cleanup, not a product assertion** | Exit code only; no PATH/Cellar/manifest/`/Applications` residual checks |
| 5 | **Hooks + launchd untested** | No unit files for `lib/brew-hooks.ts`, `lib/launchd-service.ts` |
| 6 | **GUI shallow** | `open -a` only; no Gatekeeper, zap execution, helpers, multi-app DMGs |
| 7 | **MAS / Setapp** | Generation/integration only; e2e-tap explicitly out of scope |
| 8 | **Research catalog ≫ executable depth** | ~200 research apps vs 49 e2e; no status columns linking rows → pass/fail |
| 9 | **Core modules without unit suites** | `analyzer`, `archive-inspector`, `config`, `setup`, `github`, `sha256`, `tap-git` (partial) |
| 10 | **Synthetic fixtures too clean** | Fake bins are shell scripts; miss native deps, Electron, notarization |
| 11 | **Default CI path is unit-only** | User-facing truth lives behind optional gates |

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
- Service: string builder only.
- Classifier: many URL shapes; crates.io still `unknown` while cargo generator exists.
- Missing unit coverage for orchestration modules listed in §1.3.

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
| **User intent** | App in `/Applications`, opens, updates via brew, zap removes leftovers |
| **Must prove** | App path exists; launch does not immediately crash; uninstall removes app; `--zap` hits trash paths |
| **Today** | `open -a` smoke; zap strings only |
| **Add** | Path asserts; zap persona; optional quarantine/xattr note for real DMGs |

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

### Tier A — High leverage (do first)

Ship these before treating hooks/service automation as production-safe.

#### A1. Service e2e personas (3 stacks minimum)

| ID | Stack | Suggested real or fixture app | Assertions |
|----|-------|-------------------------------|------------|
| A1a | npm-package | maildev or fixture HTTP server | generate **with** `--service` + command → install → `brew services start` → `curl` HTTP 200 → stop → uninstall → no LaunchAgent for formula |
| A1b | pip-package | lightweight webui or fixture | same |
| A1c | go-package or binary-release | wakapi / godns or fixture | same |

**Implementation notes:**

- Do **not** pass `--no-service` for these tests (new helper: `generateFormulaWithService`).
- Prefer controllable fixtures in e2e-tap for determinism; keep 1–2 real-catalog service smokes in E2E/Lume.
- HTTP probe: wait/retry with timeout; assert port from service command.
- Residual: `brew services list` shows none; `launchctl list` / agent path absent.

**Files (expected):**

- `tests/e2e-tap/fixtures/` — optional service-capable fake apps that listen on a port.
- `tests/e2e-tap/service.e2e-tap.test.ts` (new) or persona section in cross-cutting.
- `tests/e2e/catalog.json` — optional `serviceCommand` + `verifyHttp` fields for real apps.
- Extend `catalog.e2e.test.ts` / helpers to honor those fields.

#### A2. Uninstall residual checks (all e2e paths)

After every successful uninstall in e2e and e2e-tap:

| Check | Formula | Cask |
|-------|---------|------|
| Not in `brew list` | yes | yes |
| Bin not resolving to Cellar (or gone) | yes | n/a |
| App path absent | n/a | yes |
| Manifest deleted **or** explicit product decision “manifests persist” documented + asserted | yes | yes |

If product choice is “manifests persist until `allbrew remove`,” document that and assert persistence; do not leave behavior accidental.

#### A3. Hooks smoke (Lume)

1. Fresh VM or clean prefix.
2. `allbrew hooks install`.
3. Generate + install managed package (fixture or catalog).
4. Mutate upstream (fixture) or simulate outdated livecheck.
5. Run `brew update` (or invoke wrapper directly if brew update is too heavy).
6. Assert update-formulas side effect (formula version / commit / log line).

#### A4. Zap persona (one cask)

1. Install cask with known `zap trash:` paths.
2. `brew uninstall --zap --cask <name>`.
3. Assert trash paths from generated cask are absent (or were present then removed).

#### A5. Analyzer unit suite

Fixtures under `tests/fixtures/readme/` (or similar):

| Fixture | Expect |
|---------|--------|
| README with `brew services start foo` | service hint + command |
| README with `npm i -g` only | npm install method |
| README with `brew install foo` | “already Homebrew” path signal |
| Multi-signal conflict | priority documented in test name |

Cover `lib/analyzer.ts` paths currently only exercised indirectly via CLI.

#### A6. Module unit smoke for ops code

Minimal pure tests (no full brew):

- `brew-hooks.ts` — install writes expected wrapper path; uninstall removes it (tmpdir mocks).
- `launchd-service.ts` — plist contents include absolute paths / log rotate policy.
- `config.ts` — permissions 0o600; invalid tap path rejected.
- `sha256.ts` — size/time limit behavior with mock/small fixtures.

---

### Tier B — Fidelity and edge coverage

#### B1. Bin-name matrix

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

#### B3. Classifier / routing conflict matrix

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

| Case | Expect |
|------|--------|
| Livecheck status error | skip (already e2e-tap) |
| Push failure | no silent success; clean message |
| Mid-download abort | temp cleanup |
| Concurrent update-formulas | lock or serialized (when implemented) |
| Missing manifest | skip unmanaged (already) |

#### B5. Polluted PATH persona

E2E with env:

```text
PATH="$HOME/.local/bin:/opt/homebrew/bin:..."
```

Pre-install a dummy same-named binary earlier in PATH; after allbrew install, assert `command -v` resolves to Cellar/Homebrew path (or document intentional behavior).

#### B6. Integration quarantine

- Tag flaky external hosts.
- Prefer hash-pinned URLs or fixture mirrors for structure tests.
- Keep a small “live smoke” set that is allowed to fail separately from CI gate.

---

### Tier C — Product completeness (as features land)

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

- Extend `scripts/e2e-vm-run-tests.sh` with `--user-journeys` (or `USER_JOURNEYS=1`).
- Record results under `tests/e2e-runs/<ts>/` with explicit journey pass/fail section in `readout.txt`.
- Failure of any Tier A journey blocks “hooks/service ready” claim in AGENTS status table.

### 7.3 What remains optional

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
  "verifyHttp": { "url": "http://127.0.0.1:1080", "expectStatus": 200 },
  "verifyPaths": ["/opt/homebrew/bin/maildev"],
  "uninstallAsserts": { "manifestGone": true, "binGone": true },
  "zap": true
}
```

### 9.3 Helper APIs

| Helper | Role |
|--------|------|
| `generateWithService(ctx, app, cmd)` | Opposite of forced `--no-service` |
| `assertUninstallResiduals(ctx, app)` | Shared residual checklist |
| `waitForHttp(url, opts)` | Retrying probe |
| `brewServices(ctx, action, name)` | start/stop/list |

### 9.4 Lume readout extensions

Add to `e2e-vm-readout.sh`:

- `brew services list`
- LaunchAgents mentioning allbrew/managed formulas
- Manifest count + names
- Journey summary JSON

---

## 10. Priority order and dependencies

```text
A5 analyzer unit ─────────────────────────────┐
A6 hooks/launchd/config unit ─────────────────┤
A2 residual uninstall checks (easy win) ──────┼─► A1 service e2e personas
A1 fixtures for HTTP service ─────────────────┤
                                              ├─► A3 hooks Lume smoke
                                              └─► A4 zap persona
                                                      │
                                                      ▼
                                              B1–B6 fidelity
                                                      │
                                                      ▼
                                              C features as shipped
```

**Do not** claim hooks/service install are production-ready until **A1 + A2 + A3** pass on Lume.

Security items in [`fable-app-review-2026-07-11.md`](./fable-app-review-2026-07-11.md) should gain adversarial unit tests in parallel (rubyEscape, archive traversal, config perms)—orthogonal but required before unattended automation.

---

## 11. Acceptance criteria

### 11.1 Tier A done when

- [ ] At least 3 service personas (npm, pip, go/binary) pass with `brew services` + HTTP + residual uninstall.
- [ ] Shared residual uninstall helper used by e2e + e2e-tap.
- [ ] Analyzer has a dedicated unit suite with README fixtures.
- [ ] Hooks smoke passes once on Lume (wrapper or full brew update path).
- [ ] One zap persona passes.
- [ ] Ops modules (hooks, launchd, config) have minimal unit coverage.
- [ ] AGENTS.md “What is not done” / testing section updated to reflect service/lifecycle coverage.

### 11.2 Tier B done when

- [ ] Bin-name matrix covers research-known mismatches used in e2e catalog.
- [ ] One heavy real package per major ecosystem in optional e2e list.
- [ ] Classifier conflict matrix exists; crates.io UX decided (fix or document).
- [ ] Failure injection covers push/download/concurrent (as features exist).
- [ ] Integration flaky hosts quarantined or mirrored.

### 11.3 Nightly done when

- [ ] `scripts/e2e-vm-run-tests.sh --user-journeys` (or equivalent) runs ≤10 journeys.
- [ ] Run record includes journey pass/fail.
- [ ] Documented cadence (nightly on remote Lume host).

---

## 12. Mapping: evaluation findings → work items

| Evaluation finding | Work item IDs |
|--------------------|---------------|
| `--no-service` everywhere | A1, catalog schema, helpers |
| No brew services / HTTP | A1, A1 fixtures |
| Uninstall only exit 0 | A2 |
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

This lifecycle plan **does** expand scope for services, residuals, hooks, zap, and analyzer—because those are product-critical for the “global solution” claim.

---

## 14. Suggested first PR sequence

1. **PR1 — Residual uninstall helper + wire into e2e-tap/e2e** (A2)  
   Low risk, immediate signal quality improvement.

2. **PR2 — Analyzer unit suite** (A5)  
   Offline, fast, unblocks correct service auto-detection confidence.

3. **PR3 — Service fixture + e2e-tap service personas** (A1)  
   Core gap close.

4. **PR4 — Catalog schema for service/http + 1–2 real smokes** (A1 real)  
   Optional; can follow PR3.

5. **PR5 — Hooks/launchd unit + Lume hooks smoke** (A6 + A3)  
   Gates automation.

6. **PR6 — Zap persona** (A4)

7. **PR7 — Nightly user-journeys runner + readout** (§7)

8. **Later — B1–B6, Tier C** as capacity allows.

---

## 15. Document history

| Date | Change |
|------|--------|
| 2026-07-21 | Initial plan from full-suite evaluation (user-lifecycle lens: CLI, GUI, services, global tools, day-2 ops). |
