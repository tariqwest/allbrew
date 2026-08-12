# allbrew Agent Skills — Proposal

> **Goal:** Define a set of agent skills grounded in the allbrew project that help an agent understand the project, its capabilities, architecture, and how to troubleshoot and fix the sorts of issues and edge cases inherent to allbrew. These skills pick up where the test suite leaves off, helping a user in the wild doctor and fix issues not yet imagined.
>
> **Status:** Proposal. No skills implemented yet.
>
> **Related plans:**
> - [`fable-app-review-2026-07-11.md`](./fable-app-review-2026-07-11.md) — security (S1-S8), architecture (A1-A8), edge cases (F1-F22), feature opportunities
> - [`allbrew-hooks-uninstall-detection.md`](./allbrew-hooks-uninstall-detection.md) — OOB uninstall detection (folder actions, manifest matching)
> - [`allbrew-scan.md`](./allbrew-scan.md) — adopt already-installed apps into the tap
> - [`allbrew-switch.md`](./allbrew-switch.md) — migrate manually installed apps to official Homebrew
> - [`allbrew-user-lifecycle-test-plan.md`](./allbrew-user-lifecycle-test-plan.md) — user-lifecycle test gaps (services, uninstall residuals, hooks, personas)
> - [`allbrew-test-cases.md`](./allbrew-test-cases.md) — ~230-app research master table across all 17 generators

---

## Overview

12 skills organized into three tiers: **understand**, **diagnose**, **fix**.

```
User reports an issue
        │
        ▼
  allbrew-orientation  ──►  allbrew-generators-reference
        │
        ▼
  allbrew-doctor  ──►  allbrew-reconcile
        │   routes to a specialist:
        ▼
  ┌────────────┬──────────────┬──────────────┬───────────────┬──────────────┐
  fix-update  fix-generation fix-cask-dmg  fix-cask-mas   fix-cask-setapp
                                │
                          fix-service  fix-automation  fix-security
```

- **orientation** + **generators-reference** = understand (read-only foundation).
- **doctor** + **reconcile** = diagnose (broad scanner + consistency investigator).
- **fix-*** = repair (one per failure domain: update pipeline, generation, three cask sub-domains, services, automation, security).

Every documented issue in the fable review maps to at least one skill, and each skill is grounded in specific files and plans rather than generic advice.

---

## Tier 1 — Understand (foundation)

An agent must grasp the architecture before it can diagnose or fix anything. These two skills are the on-ramp every other skill assumes.

### 1. `allbrew-orientation`

**Trigger:** Agent needs to understand allbrew's architecture, generation flow, file layout, or where a piece of logic lives. Use first when working on any allbrew task.

**What it does:** Orients the agent to the end-to-end generation flow (`classifier.ts` → `github.ts`/`analyzer.ts`/`archive-inspector.ts` → `generators/*.ts` → `template-renderer.ts` → `utils.writeFormula/writeCask` → `build-manifest.ts`), the 17-generator catalog at a glance, the manifest/config/tap state model (`~/.config/allbrew/config.json`, `~/.config/allbrew/packages/*.json`, the tap repo's `Formula/`+`Casks/`), the update pipeline (`update-formulas` ← `brew livecheck` ← manifests), and the automation layer (`brew-hooks.ts`, `launchd-service.ts`). Points the agent at `AGENTS.md`, the `.agents/plans/` index, and the `lib/` module map.

**Grounding:** `AGENTS.md` (Architecture, Project structure, Current status), `lib/` directory layout, the generation-flow mermaid diagram.

**Why it's separate:** The codebase is large (`cli.ts` alone is 1,262 lines, 17 generators, 20+ lib modules). A dedicated orientation skill prevents an agent from flailing across files on every task.

---

### 2. `allbrew-generators-reference`

**Trigger:** Agent needs to pick the right generator, understand a specific generator's edge cases, or debug why a URL routed to the wrong output.

**What it does:** Deep reference for all 17 generators — when each applies, the classifier strategy that routes to it, its livecheck strategy, its template payload shape, and its known per-generator edge cases. Covers the catalog table from `add-test-case` plus the hard-won edge cases already discovered in past sessions:
- Versioned architecture suffixes in DMG filenames (the HarnessKit `HarnessKit_1.6.5_aarch64.dmg` → `HarnessKit.app` bug in `cask-app-release.ts`).
- No-darwin binaries (the ugm case: goreleaser targets linux/freebsd only → must use `go-package` source build, not `binary-release`).
- Bin-name mismatches, monorepo layouts (cua-driver in `libs/cua-driver`), arm64-only releases, install scripts that write outside Cellar.
- Registry-backed vs direct-URL preference rules (`cask-app` vs `cask-app-release`).
- The `license "MIT"` hardcoding bug (A5) in `archive-build.ts`, `binary-direct.ts`, `install-script.ts`.

**Grounding:** `lib/generators/*.ts`, `lib/classifier.ts`, `lib/templates/`, `.agents/plans/allbrew-test-cases.md` (the ~230-app research master table), the `add-test-case` skill, past session breadcrumbs (HarnessKit, ugm, cua-driver, hermes-desktop).

**Why it's separate:** Generator selection is the single most common decision in allbrew, and the edge cases are numerous and generator-specific. Folding this into orientation would bloat it; the `add-test-case` skill is about *adding* coverage, not *diagnosing* routing failures.

---

## Tier 2 — Diagnose (front doors for "something's wrong")

These skills figure out *what's broken* before a fix skill repairs it. `doctor` is the broad scanner; `reconcile` is the state-consistency investigator.

### 3. `allbrew-doctor`

**Trigger:** User reports "allbrew is broken," "something's wrong with my setup," or runs (the planned) `allbrew doctor`. Also use proactively before/after automation setup.

**What it does:** Runs a comprehensive health check and reports each finding with a severity and a pointer to the relevant fix skill. Checks, grounded in the documented failure modes:
- **Config:** `config.json` parseable? (F14 — corrupted config silently resets to `{}`), file permissions world-readable? (S4 — token leak), `tapPath` set and exists?, `githubToken` present + valid (probe API)? (F19)
- **Tap:** tap path is a git repo? (F15 — tap deleted after setup → `mkdir` recreates non-git dir, commits silently no-op), `Formula/`+`Casks/` present, remote configured? (F5 — push silently skipped)
- **Toolchain:** `brew`, `git`, `mas` (for MAS casks), `setapp-cli` (for Setapp casks) on PATH?
- **Manifests:** every manifest parseable? (F13 — corrupted manifest silently dropped → package stops being managed), every manifest's `.rb` present in tap?, every tap `.rb` has a manifest?
- **Automation:** launchd agent loaded + running? `allbrew service` schedule set?, brew update hook installed? (F6, F7), folder actions attached? (uninstall-detection plan), `binary-path` file valid? (hooks plan §4.3)
- **Hygiene:** stale `allbrew-*` temp dirs? (F11), partial downloads left behind? (F8), launchd logs oversized? (F6), lock file stale? (F1)
- **Conflicts:** any manifest name collides with homebrew-core? (F16)

**Grounding:** The planned `allbrew doctor` feature (fable review §5.3), F13-F17, F22, S4, S8, F1, F6, F7, F11, `lib/config.ts`, `lib/manifest.ts`, `lib/tap-git.ts`, `lib/launchd-service.ts`, `lib/brew-hooks.ts`.

**Why it's separate:** This is the aggregation layer the fable review explicitly recommends ("Aggregates checks that already exist piecemeal"). It's the front door that routes into the fix skills.

---

### 4. `allbrew-reconcile`

**Trigger:** User suspects stale state ("I deleted an app but allbrew still tracks it"), wants to see what allbrew manages vs what's installed, or is preparing for `scan`/`switch`/uninstall-detection.

**What it does:** Reconciles four sources of truth and surfaces every inconsistency:
- **Manifests ↔ Homebrew:** which manifests have no corresponding `brew list` entry (uninstalled OOB or never installed)? which `brew list` packages have no manifest (installed outside allbrew)?
- **Manifests ↔ tap `.rb`:** which manifests have no `.rb` (dangling)? which `.rb` have no manifest (orphaned, e.g. hand-added or manifest deleted)?
- **Manifests ↔ filesystem:** for cask manifests, is `source.appPath` still on disk? (OOB uninstall detection — the hooks plan). For formula manifests, is the bin still in Cellar/PATH?
- **Tap ↔ homebrew-core:** name collisions that shadow core packages (F16).

Reports a categorized table (stale / dangling / orphaned / shadowed / unmanaged) and recommends actions: clean up stale (→ `fix-automation`/`fix-cask-*`), adopt unmanaged (→ future `scan`), switch to core (→ future `switch`).

**Grounding:** `allbrew-hooks-uninstall-detection.md` (the matching logic in §6.1 — `source.appPath`/`appName`/`bundleId`), `allbrew-scan.md` (the "already managed" filter), `allbrew-switch.md` (Homebrew API matching), F13, F15, F16, `lib/manifest.ts`, `lib/build-manifest.ts`.

**Why it's separate from doctor:** Doctor checks *health* (is each component functional?); reconcile checks *consistency* (do the sources of truth agree?). They overlap but have different outputs — doctor says "your config is corrupted," reconcile says "you have 3 stale manifests for deleted apps." Reconcile is also the investigation backbone for the three planned features (scan/switch/uninstall-detection), so it deserves to be first-class.

---

## Tier 3 — Fix (per failure domain)

Each fix skill is a diagnostic + repair workflow for one failure domain. They are the specialists that `doctor` and `reconcile` route into.

### 5. `allbrew-fix-update`

**Trigger:** `allbrew update-formulas` crashes, hangs, skips packages silently, doesn't push, or runs concurrently with itself.

**What it does:** Diagnoses and repairs the update pipeline:
- **Malformed livecheck JSON** (F2 — `JSON.parse` uncaught → whole run crashes): wrap, warn, return `[]`.
- **Hung stdin** (F3 — empty/never-closing stdin in non-TTY): add timeout when stdin isn't a TTY.
- **Silently skipped names** (F4 — livecheck name with no manifest): record in `result.skipped` with a reason.
- **Silent push failures** (F5 — commit succeeds, push fails/no remote): log a dim notice; verify remote.
- **Concurrent runs** (F1 — no locking, launchd + manual race): add `~/.config/allbrew/update-formulas.lock` with stale-lock detection.
- **Rate limiting** (F19 — GitHub 403s surface as generic errors): detect rate-limit responses, suggest `allbrew config set-token`.
- **Malformed manifest source** (A3, F13 — untyped `Record<string,unknown>` → `String(manifest.source.packageName)` coercions fail mid-update): validate on load, name the missing field.
- **Registry shape changes** (F20 — npm `dist-tags`/PyPI `urls` missing → unhelpful errors): validate and name the missing field.

**Grounding:** `lib/update-formulas.ts`, `lib/package-updater.ts`, `lib/tap-git.ts`, `lib/github.ts`, F1-F5, F13, F19, F20, A3.

---

### 6. `allbrew-fix-generation`

**Trigger:** `allbrew <url>` produces the wrong formula/cask, generation fails, `brew install` of the generated file fails, or the generated Ruby looks wrong.

**What it does:** Diagnoses and repairs URL → formula/cask generation end-to-end:
- **Classifier mis-routing** (wrong strategy for the URL shape): trace `classifier.ts` decision.
- **Wrong generator chosen** (e.g. `binary-release` when there are no darwin assets): cross-reference with `generators-reference`.
- **Registry response shape** (F20): validate npm/PyPI/crates.io/Go/RubyGems/NuGet fields, name what's missing.
- **Non-semver tags** (F21 — `release-1.2.3` or `nightly` become the "version"): warn, offer `--version` override.
- **Unsupported archives** (F12 — `.7z`/`.rar` → cryptic tar errors): fail early with a supported-formats message.
- **Huge archives / no disk-space check** (F10): cap via `Content-Length`, prompt above 500 MB.
- **Partial downloads** (F8 — incomplete file remains): delete on failure; verify byte count vs `Content-Length` (F9).
- **Name collisions with homebrew-core** (F16): check `brew info --json <name>` before writing, suggest prefixed name.
- **Silent overwrite of existing `.rb`** (F17): prompt in interactive mode.
- **Setup partial-failure** (F22 — orphaned GitHub repo, unusable tap): order remote creation last, fail hard on tap errors.
- **Template output validation:** license stanza correctness (A5 — hardcoded `license "MIT"`), livecheck block, `depends_on "tariqwest/tap/allbrew"` injection (controlled by `ALLBREW_FORMULA_DEPENDENCY`), `service do` block shape. Render via the pure renderer and audit before writing.

**Grounding:** `lib/classifier.ts`, `lib/generators/*.ts`, `lib/analyzer.ts`, `lib/archive-inspector.ts`, `lib/sha256.ts`, `lib/setup.ts`, `lib/utils.ts`, `lib/template-renderer.ts`, `lib/templates/`, S1 (output side), F8-F12, F16-F17, F20-F22, A5.

---

### 7. `allbrew-fix-cask-dmg`

**Trigger:** A DMG/ZIP cask installs the wrong app, the wrong arch, fails Gatekeeper, leaves residuals on uninstall, or the `app`/`zap` stanzas are wrong.

**What it does:** Diagnoses and repairs DMG/ZIP cask issues (the `cask-app` and `cask-app-release` generators):
- **App-name detection from DMG filenames:** versioned architecture suffixes (the HarnessKit `HarnessKit_1.6.5_aarch64.dmg` → `HarnessKit.app` regression), multi-app DMGs, Electron apps with helper bundles, Avalonia apps.
- **Arch asset selection:** arm64 vs x64 vs universal, choosing the right release asset, `on_arm`/`on_intel` blocks.
- **`zap` stanza correctness:** helpers, prefs, caches, application support dirs — verify against actual app bundle contents.
- **Gatekeeper/notarization:** unsigned apps, `xattr -cr` needed, quarantine attribute handling.
- **Uninstall residuals:** after `brew uninstall --cask`, verify app + helpers + prefs gone (the Tier A `assertUninstallResiduals` gap — currently only checks app path absent + manifest persists).

**Grounding:** `lib/generators/cask-app.ts`, `lib/generators/cask-app-release.ts`, `lib/templates/cask/`, `tests/helpers/uninstall-residuals.ts`, the HarnessKit session bug, the user-lifecycle plan §1.3 (GUI shallow, uninstall is cleanup not product assertion).

---

### 8. `allbrew-fix-cask-mas`

**Trigger:** A Mac App Store cask fails to install, the wrong app is resolved, or the user only has an app name (not a full URL).

**What it does:** Diagnoses and repairs MAS cask issues (the `cask-app-mas` generator):
- **URL requirements:** full App Store URL with `/id{number}` is required; app-name/id lookup is planned but not implemented (README known rough edge).
- **`mas` CLI presence + sign-in state:** `mas` installed? signed in to the right Apple ID?
- **App name vs bundle name mismatch:** the MAS API name may differ from the on-disk bundle name (hooks plan §6.1 note) — store `bundleId` as the stable anchor.
- **OOB uninstall:** app removed via Launchpad/App Store/MAS `mas uninstall` → manifest goes stale (→ `reconcile` + `fix-automation` folder actions).

**Grounding:** `lib/generators/cask-app-mas.ts`, `lib/setapp-bootstrap.ts` (parallel pattern), README known rough edges, `allbrew-hooks-uninstall-detection.md` §6.1, user-lifecycle plan §1.3 (MAS out of e2e-tap scope).

---

### 9. `allbrew-fix-cask-setapp`

**Trigger:** A Setapp cask fails to bootstrap, installs to the wrong path, or breaks after a Setapp subscription change.

**What it does:** Diagnoses and repairs Setapp cask issues (the `cask-app-setapp` generator):
- **Bootstrap:** `setapp-cli` + Setapp auto-install on first Setapp cask (`setapp-bootstrap.ts`); diagnose bootstrap failures.
- **Install path detection:** default `/Applications/Setapp` vs user-configured custom path (hooks plan §6.1 — must record non-default install path in manifest source).
- **`appName` field + `setappUrl`:** currently stores only these; needs `appPath` for uninstall detection.
- **Subscription state:** app unavailable after subscription lapse; OOB uninstall via Setapp app.

**Grounding:** `lib/generators/cask-app-setapp.ts`, `lib/setapp-bootstrap.ts`, `setapp-generator.md` plan, `allbrew-hooks-uninstall-detection.md` §6.1, user-lifecycle plan §1.3 (Setapp out of e2e-tap scope).

---

### 10. `allbrew-fix-service`

**Trigger:** `brew services start <name>` doesn't work, the service won't stay alive, the web UI doesn't respond, or the `service do` block is wrong.

**What it does:** Diagnoses and repairs `brew services` runtime issues (the gap the user-lifecycle plan calls out — services are disabled in E2E and only string-checked in unit tests):
- **Service block generation:** `run` command correctness, `keep_alive`, `environment`, `run_type`/`sockets` — verify against the actual daemon behavior.
- **Service command extraction from README** (S7 — regex-extracted commands flow into `service do` without validation): sanitize/escape, show detected commands before writing.
- **Launchd plist correctness:** the generated plist loads? `launchctl` reports it? logs location?
- **Service not starting/stopping:** `brew services` round-trip, process actually running, port bound?
- **HTTP/web UI probes:** for server-ish apps (maildev, wakapi, godns, verdaccio, marimo-class tools), probe the endpoint — the catalog currently only runs `--version`.

**Grounding:** `lib/generators/service.ts`, `lib/launchd-service.ts`, `lib/analyzer.ts` (service hints), `tests/unit/service.test.ts` (string-only), `tests/e2e-tap/service.e2e-tap.test.ts`, user-lifecycle plan §1.3 (services disabled in E2E, no HTTP probes), S7.

---

### 11. `allbrew-fix-automation`

**Trigger:** `allbrew hooks install` broke `brew update`, the launchd agent isn't firing, logs are growing unbounded, folder actions aren't detecting uninstalls, or a headless run crashed on a prompt.

**What it does:** Diagnoses and repairs the automation layer (hooks + launchd service agent):
- **Brew update hook:** wrapper at `$(brew --prefix)/etc/allbrew-brew-wrap` installed + executable + running `update-formulas` after `brew update`?
- **Folder actions / uninstall detection:** scripts attached to `/Applications`, `~/Applications`, `/Applications/Setapp`, `~/Applications/Setapp`? `binary-path` file valid + absolute + not world-writable (hooks plan §4.4)? JXA compiled?
- **Launchd service agent:** loaded? running on schedule? `update-managed.sh` executable?
- **Hardcoded PATH** (F7 — assumes `/opt/homebrew/bin:/usr/local/bin`): detect brew prefix + allbrew binary path at install time, embed absolute paths.
- **Unbounded log growth** (F6 — launchd logs appended forever): truncate above 5 MB at top of `update-managed.sh`.
- **Stale lock files** (F1): detect and clear stale `update-formulas.lock`.
- **Non-TTY prompt crashes** (F18 — `@inquirer/prompts` throws in launchd/piped contexts): guard all prompts with `process.stdin.isTTY`.

**Grounding:** `lib/brew-hooks.ts`, `lib/launchd-service.ts`, `scripts/update-managed.sh`, `allbrew-hooks-uninstall-detection.md` (folder actions, binary-path, JXA), F1, F6, F7, F18.

---

### 12. `allbrew-fix-security`

**Trigger:** User suspects a generated formula is unsafe, an upstream README looks malicious, a token may be exposed, or hardening the codebase against the fable-review S-items.

**What it does:** Diagnoses and hardens the security issues cataloged in the fable review. Works in two modes — **audit a specific generated `.rb`** and **harden the codebase**:
- **Ruby string escaping / formula injection** (S1 — `rubyEscape` only escapes `\` and `"`, not `#{...}` or newlines): audit generated Ruby for interpolation, fix `lib/utils.ts:66-70`, add adversarial tests.
- **Archive extraction path traversal** (S2 — zip-slip, `unzip -o`/`tar xzf` without containment): validate archive listing before extract.
- **README-derived command execution** (S3 — `&&`-split segments executed via `execFileAsync`): allowlist `brew` as argv[0], show segments before confirmation.
- **Token file permissions** (S4 — `config.json` world-readable): `chmod 0o600`, chmod the config dir.
- **HTTPS enforcement** (S5 — HTTP URLs fetched/hashed without warning): warn loudly or refuse without a flag.
- **SSRF / private-IP blocking** (S6): block metadata endpoints (169.254.169.254), warn on private-range IPs.
- **Service command sanitization** (S7 — same root as `fix-service`, but here the security angle): sanitize README-extracted service commands.
- **Tap path validation** (S8 — `set-tap /usr/local` would write + `git add` there): require path exists, is a directory, warn if not a git repo, refuse obvious system paths.

**Grounding:** `lib/utils.ts`, `lib/archive-inspector.ts`, `lib/cli.ts`, `lib/config.ts`, `lib/sha256.ts`, `lib/classifier.ts`, `lib/analyzer.ts`, fable review §2 (S1-S8), the contribution-priorities order in `AGENTS.md` (security hardening is priority #1).

---

## Coverage check against documented issues

| Documented issue | Skill(s) that cover it |
|---|---|
| S1-S8 (security) | `fix-security` (+ `fix-service` for S7) |
| A3 (untyped manifests) | `fix-update`, `reconcile` |
| A5 (hardcoded MIT license) | `fix-generation`, `generators-reference` |
| F1 (concurrent runs) | `fix-update`, `fix-automation` |
| F2-F5 (update pipeline) | `fix-update` |
| F6-F7 (launchd logs/PATH) | `fix-automation` |
| F8-F12 (downloads/archives) | `fix-generation` |
| F13-F15 (state/filesystem) | `doctor`, `reconcile` |
| F16-F17 (name collisions/overwrite) | `fix-generation`, `doctor` |
| F18 (non-TTY prompts) | `fix-automation` |
| F19 (rate limiting) | `fix-update`, `doctor` |
| F20-F22 (registry/tags/setup) | `fix-generation` |
| Uninstall residuals gap | `fix-cask-dmg`, `reconcile` |
| Services untested at runtime | `fix-service` |
| MAS/Setapp out of e2e-tap | `fix-cask-mas`, `fix-cask-setapp` |
| OOB uninstall detection | `reconcile`, `fix-automation` |
| scan/switch (planned) | `reconcile` (shared backbone) |
| Generator edge cases (HarnessKit, ugm, cua) | `generators-reference` |

Every documented issue maps to at least one skill, and each skill is grounded in specific files and plans rather than generic advice.
