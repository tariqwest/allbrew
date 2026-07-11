# Fable App Review — 2026-07-11

> Full-codebase review of allbrew (v0.0.1 alpha) covering security, architecture, edge cases / failure modes, and opportunities for user-facing features. Findings cite `file:line` references and were verified against the code on `main` as of this date.

---

## 1. Executive summary

The architecture is fundamentally sound: generators collect typed payloads, templates render Ruby, manifests enable headless regeneration, and layering is clean (no generator emits Ruby directly; no template reaches back into generators; no circular imports). The three-tier test suite plus template parity checks is a genuine strength.

The most important gaps are:

1. **Security:** insufficient Ruby string escaping (formula injection), archive extraction without path-traversal protection, execution of README-derived commands, plaintext token with default file permissions.
2. **Type safety:** `strict: false` in tsconfig (contradicting AGENTS.md, which claims strict mode), ~96 uses of `any` in generators, and untyped `manifest.source` making `package-updater.ts` fragile.
3. **Operational robustness:** no locking for concurrent `update-formulas` runs, no temp-dir cleanup, unbounded launchd log growth, silent corruption handling for config/manifests.
4. **Correctness bug:** three formula templates hardcode `license "MIT"` regardless of the actual project license.

---

## 2. Security issues

### 2.1 High severity

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| S1 | **Insufficient Ruby escaping → formula injection** | `lib/utils.ts:66-70` | `rubyEscape` only escapes `\` and `"`. It does not escape Ruby interpolation (`#{...}`) or newlines. A malicious upstream description/name containing `#{...}` or embedded quotes+newlines could inject Ruby that Homebrew evaluates at `brew install` time. Fix: also escape `#` (or at least `#{`), `\n`, `\r`. Add unit tests with adversarial inputs. |
| S2 | **Archive extraction path traversal (zip-slip)** | `lib/archive-inspector.ts:31-49` | `unzip -o` and `tar xzf` are invoked without protection against entries like `../../...`. A malicious archive can write outside the temp dir. Fix: validate archive listing before extraction (`tar -tf` / `zipinfo -1` and reject absolute paths or `..` components), or extract with a library that enforces containment. Modern bsdtar refuses `..` by default but this must not be assumed — macOS ships different tar/unzip versions. |
| S3 | **Execution of README-derived commands** | `lib/cli.ts:600-605` | When a README advertises `brew install foo`, allbrew offers to run it and, on confirmation, splits on `&&` and whitespace and executes each segment via `execFileAsync`. Mitigating factors: user confirms, and no shell is invoked (metacharacters are not interpreted). But each `&&`-split segment is a real command execution — a README saying `brew install foo && rm -rf ~/` would run `rm -rf ~/`. Fix: only execute segments whose argv[0] is `brew` (allowlist), and display the exact segments to be run before confirmation. |

### 2.2 Medium severity

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| S4 | **GitHub token stored world-readable** | `lib/config.ts:32-35` | `config.json` (contains `githubToken`) is written with default umask. Fix: `writeFile(..., { mode: 0o600 })` and `chmod` the config dir. |
| S5 | **No HTTPS enforcement on downloads** | `lib/sha256.ts:13-16`, `lib/classifier.ts:75-79` | HTTP URLs are fetched and hashed without warning; a MITM'd first download poisons the recorded SHA256. Fix: warn loudly (or refuse without a flag) for non-HTTPS URLs. |
| S6 | **SSRF via arbitrary URL fetch** | `lib/sha256.ts`, `lib/classifier.ts:70-102` | The CLI fetches any user-supplied URL, including internal/link-local addresses. Low practical risk for a local CLI, but worth blocking obvious metadata endpoints (169.254.169.254) and warning on private-range IPs. |
| S7 | **Service command extraction from README** | `lib/analyzer.ts:227-232` | Service commands regex-extracted from READMEs flow into generated `service do` blocks without validation. Combined with S1, a malicious README influences generated Ruby. Fix: sanitize/escape service commands the same as other payload strings, and show detected service commands to the user before writing. |
| S8 | **Tap path unvalidated** | `lib/config.ts:42-47`, `bin/allbrew.ts` `set-tap` | `set-tap` resolves but does not validate the path. A mistaken `set-tap /usr/local` would make allbrew write and `git add` there. Fix: require the path to exist, be a directory, and (warn if not) be a git repo; refuse obvious system paths. |

### 2.3 Low severity

- **Brew hook script permissions** (`lib/brew-hooks.ts:36-42`): written to `$(brew --prefix)/etc/` without explicit mode; set `0o644` explicitly.
- **Filename derived from URL** (`lib/sha256.ts:69`): mitigated by `join()` normalization; still sanitize to `[a-zA-Z0-9._-]`.
- **Commit messages include unsanitized package names** (`lib/update-formulas.ts:119`): low risk since passed as a single argv element, but sanitize for readability.
- **No secrets in logs/remotes** (verified clean): token is never printed, embedded in remote URLs, or included in errors.

---

## 3. Architecture and code quality

### 3.1 What's working well (keep doing this)

- **Layering is clean.** Generators → payloads (`lib/template-payload.ts`) → renderer (`lib/template-renderer.ts`) → templates. No violations found; no circular imports; no dead code.
- **Shared blocks are centralized** — `lib/generators/service.ts`, `lib/generators/livecheck.ts`, `lib/utils.ts` escaping.
- **Template parity suite** (`scripts/test-templates.ts`) is an excellent guard against output drift.
- **Dependencies are minimal and all used**; nothing risky in `package.json`.
- **`lib/cli.ts` (1,262 lines) is large but decomposed** — `run()` is ~66 lines; handlers are 20–100 lines each. Switch-based routing over 17 generators is acceptable; a registry would be marginal benefit.

### 3.2 Issues

| # | Issue | Location | Impact / recommendation |
|---|-------|----------|-------------------------|
| A1 | **`strict: false` in tsconfig — contradicts AGENTS.md** | `tsconfig.json` | AGENTS.md claims "TypeScript strict mode — tsc --noEmit must pass". It passes because strict is off. Either enable strict (preferred, incrementally via `strictNullChecks` first) or correct AGENTS.md. |
| A2 | **~96 `any` usages in generators** | `lib/generators/*.ts` (e.g. `npm-package.ts:17-18`), `lib/template-renderer.ts:29,47` | `repoInfo: any`, `options: any`, and `(p: any)` in the renderer negate the typed-payload design. Define `RepoInfo`, `GeneratorOptions` types and type the renderer dispatch against the payload union. |
| A3 | **Untyped manifest `source`/`options`** | `lib/manifest.ts:31-32`, `lib/package-updater.ts:44-310` | `Record<string, unknown>` forces `String(manifest.source.packageName)`-style coercions in the updater. A manifest missing a field fails at runtime mid-update. Recommend per-generator discriminated-union source types + runtime validation on `loadManifest`. This is the highest-leverage refactor in the codebase. |
| A4 | **Adding a generator requires touching 4 switches** | `package-updater.ts`, `build-manifest.ts`, `manifest.ts`, `cli.ts` | Consider a generator registry object per generator ({ collect, buildSource, updateFromManifest }) so new generators register once. Not urgent at 17 generators, but the planned scan/switch features will add pressure. |
| A5 | **Hardcoded `license "MIT"` in 3 templates** (verified) | `lib/templates/formula/archive-build.ts:9`, `binary-direct.ts:9`, `install-script.ts:9` | Generated formulas claim MIT regardless of the actual license — a correctness (and arguably legal-metadata) bug. Use the conditional `licenseLine` pattern the other templates use, omitting the stanza when unknown. |
| A6 | **Inconsistent error handling in cli.ts** | `lib/cli.ts:91-95` vs `1131-1146` | Some paths `process.exit(1)`, others `spinner.warn` and continue. Define a policy: fatal for generation failures, warn-and-continue for post-generation conveniences (brew update/install). |
| A7 | **Build-system detection duplicated** | `lib/analyzer.ts` (`detectBuildSystemFromFiles`), `lib/generators/archive-build.ts`, `lib/generators/source-build.ts` | Consolidate into one detection module with a single file-marker table. |
| A8 | **No config schema validation or migration story** | `lib/config.ts:23-30` | Malformed config silently resets to `{}` (losing tapPath/token from the user's perspective). Add lightweight validation + a `configVersion` field before the config grows further. |

### 3.3 Test coverage gaps

Generator coverage is excellent (all 17 have unit + integration tests). Core infrastructure is largely untested:

- No unit tests: `github.ts`, `analyzer.ts`, `archive-inspector.ts`, `sha256.ts`, `config.ts`, `manifest.ts`, `tap-git.ts`, `brew-hooks.ts`, `launchd-service.ts`, `setup.ts`, `cli.ts` orchestration.
- Highest value additions: `analyzer.ts` (pure regex logic, trivially testable), `tap-git.ts` (against a temp git repo), `update-formulas.ts` livecheck-JSON parsing edge cases, `rubyEscape` adversarial inputs (pairs with S1).

---

## 4. Edge cases and failure modes

### 4.1 Update pipeline (`update-formulas` / launchd / hooks)

| # | Scenario | Location | Current behavior → recommendation |
|---|----------|----------|-----------------------------------|
| F1 | **Concurrent runs** (launchd fires while a manual run is in progress) | no locking anywhere | Race on manifest writes and git operations. Add a lock file (`~/.config/allbrew/update-formulas.lock`) with stale-lock detection. |
| F2 | **Malformed livecheck JSON** | `lib/update-formulas.ts:145-150` | `JSON.parse` is uncaught → whole run crashes. Wrap, warn, return `[]`. |
| F3 | **Empty / never-closing stdin** | `lib/update-formulas.ts:137-143` | Can hang indefinitely waiting for stdin. Add a timeout when stdin is not a TTY. |
| F4 | **Livecheck name with no manifest** | `lib/update-formulas.ts:62-80` | Silently skipped. Record in `result.skipped` with a reason so users see it. |
| F5 | **Commit succeeds locally, push fails / no remote** | `lib/tap-git.ts:59-71` | Push silently skipped when no remote — user may believe it pushed. Log a dim notice. |
| F6 | **Unbounded launchd log growth** | `lib/launchd-service.ts:17-19`, `scripts/update-managed.sh:4-5` | Log appended forever. Truncate above a size threshold (e.g. 5 MB) at the top of `update-managed.sh`. |
| F7 | **Hardcoded PATH in launchd script** | `lib/launchd-service.ts:30`, `scripts/update-managed.sh:3` | Assumes `/opt/homebrew/bin:/usr/local/bin`. Detect brew prefix + allbrew binary path at install time and embed absolute paths. (Same fix planned for the uninstall-detection JXA script — share the `binary-path` mechanism.) |

### 4.2 Downloads and archives

| # | Scenario | Location | Current behavior → recommendation |
|---|----------|----------|-----------------------------------|
| F8 | **Partial download leaves incomplete file** | `lib/sha256.ts:24-50` | Hash is correctly not returned on error, but a partial `destPath` file remains. Delete on failure. |
| F9 | **No Content-Length verification** | `lib/sha256.ts` | Truncated responses (server closes early without stream error) could hash incomplete bytes. Verify byte count against `Content-Length` when present. |
| F10 | **Huge archives / no disk-space check** | `lib/archive-inspector.ts:9-29` | Multi-GB downloads proceed with no size cap or free-space check. Add a size cap (prompt above e.g. 500 MB) using the `Content-Length` header. |
| F11 | **Temp dirs never cleaned up** | `lib/archive-inspector.ts:9-29` | `mkdtemp` dirs accumulate on every run and error path. Clean up in `finally`; consider sweeping stale `allbrew-*` temp dirs at startup. |
| F12 | **Unsupported archive formats fall through to `tar -xf`** | `lib/archive-inspector.ts:47` | `.7z`/`.rar` produce cryptic tar errors. Detect and fail early with a supported-formats message. |

### 4.3 State and filesystem

| # | Scenario | Location | Current behavior → recommendation |
|---|----------|----------|-----------------------------------|
| F13 | **Corrupted manifest JSON silently dropped** | `lib/manifest.ts:51-60` | `loadManifest` returns `null` on any error → package silently stops being managed. Warn and rename to `<name>.json.corrupted`. |
| F14 | **Corrupted config silently resets** | `lib/config.ts:23-30` | Same pattern; user "loses" their tap path and token without explanation. Warn + back up the corrupted file. |
| F15 | **Tap deleted after setup** | `lib/utils.ts:46-58` | `mkdir recursive` recreates `Formula/` in a non-git directory; commits then silently no-op (`tap-git.ts:40-42`). Check for `.git` and prompt to re-run `allbrew init`. |
| F16 | **Name collision with homebrew-core** | `lib/utils.ts:4-10` | No check. A user-tap `wget` formula shadows/conflicts confusingly with core. Check `brew info --json <name>` before writing; warn and suggest a prefixed name. |
| F17 | **Silent overwrite of existing `.rb`** | `lib/utils.ts:45-59` | Regenerating a name overwrites without confirmation. Prompt in interactive mode (fine to overwrite in `update-formulas`). |

### 4.4 UX / environment

| # | Scenario | Location | Current behavior → recommendation |
|---|----------|----------|-----------------------------------|
| F18 | **Interactive prompts in non-TTY contexts** | `lib/setup.ts`, `lib/cli.ts` | `@inquirer/prompts` throws in launchd/piped contexts. `update-formulas` correctly reads stdin when not a TTY, but any path that can prompt (e.g. `ensureSetup` triggering first-run setup) will crash headless runs. Guard all prompts with `process.stdin.isTTY`. |
| F19 | **GitHub rate limiting without token** | `lib/github.ts:9-12` | 403s surface as generic errors. Detect rate-limit responses and suggest `allbrew config set-token`. |
| F20 | **Registry response shape assumptions** | `lib/generators/npm-package.ts:31-34`, `pip-package.ts:20-25` | Missing `dist-tags`/`urls` fields throw unhelpful errors. Validate and name the missing field in the message. |
| F21 | **Non-semver tags pass through** | `lib/utils.ts:27-29` | `extractVersionFromTag` only strips a leading `v`; `release-1.2.3` or `nightly` become the "version". Warn when the result doesn't look like a version and offer `--version` override. |
| F22 | **Setup partial-failure states** | `lib/setup.ts:406-474` | If the GitHub repo is created but local remote-add fails, an orphaned repo remains; if `brew tap` fails for non-"already tapped" reasons, setup continues with an unusable tap. Order remote creation last; fail hard on tap errors. |

---

## 5. Improvements and low-hanging fruit

### 5.1 Quick wins (small effort, high value)

1. **Fix `rubyEscape`** (S1) — one function + tests. Do this first.
2. **Fix hardcoded `license "MIT"`** (A5) — three template lines + parity fixture updates.
3. **`chmod 0o600` on config.json** (S4) — two lines.
4. **Wrap livecheck `JSON.parse`** (F2) — prevents whole-run crashes in the flagship automation feature.
5. **Log truncation in `update-managed.sh`** (F6) — a few lines of shell.
6. **Delete partial downloads on failure** (F8) and **temp-dir cleanup in `finally`** (F11).
7. **Warn on non-HTTPS URLs** (S5).
8. **Rate-limit detection with "set a token" hint** (F19) — big UX improvement for tokenless users.

### 5.2 Medium-effort structural improvements

1. **Typed manifest sources** (A3) — per-generator source types + validation on load. Unblocks safer `package-updater.ts` and the planned scan/switch/uninstall-detection features, all of which read manifests.
2. **Enable `strict` mode incrementally** (A1/A2) — start with `strictNullChecks`, then type `repoInfo`/`options`.
3. **Update-run lock file** (F1) — required before hooks + launchd + manual runs can safely coexist.
4. **Unit tests for core infra** (§3.3) — `analyzer.ts` and `tap-git.ts` first.
5. **Archive extraction hardening** (S2) — listing validation before extract.

### 5.3 User-facing feature opportunities (low-hanging fruit)

These fall out of existing infrastructure with modest effort:

| Feature | Rationale | Builds on |
|---------|-----------|-----------|
| `allbrew list` | Show all managed packages (name, kind, generator, recorded version, last updated). Users currently have no visibility into what allbrew manages. | `listManifests()` already returns everything needed. |
| `allbrew remove <name>` | Delete the `.rb`, manifest, and optionally `brew uninstall`. Currently there is no clean way to stop managing a package. | `deleteManifest()` exists; add tap file removal + tap-git commit. This is also a prerequisite/shared core for the planned uninstall-detection cleanup. |
| `allbrew info <name>` | Print the manifest + generated Ruby for one package; show livecheck status. | `loadManifest()` + reading the `.rb`. |
| `allbrew regenerate <name>` | Force re-generation from the manifest without a livecheck trigger (useful after template fixes like A5). | `package-updater.ts` already does exactly this — just needs a CLI entry. |
| `allbrew doctor` | Check tap exists + is a git repo, config valid, brew/git present, token valid, launchd agent loaded, hook installed, stale temp dirs, corrupted manifests. | Aggregates checks that already exist piecemeal across `setup.ts`, `brew-hooks.ts`, `launchd-service.ts`. Pairs naturally with F13–F15. |
| `--dry-run` for generation | Print generated Ruby to stdout without writing/installing. Great for trust-building and CI. | Renderer is already a pure function of the payload. |
| `--json` output mode | Machine-readable results for `update-formulas` and (future) `scan`/`switch`. | Result objects already exist. |
| Homebrew-core collision warning | On generation, check whether the name exists in core/cask and warn (F16). | One `brew info --json` call. |
| Shell completions | `commander` supports completion generation; cheap developer-experience win. | Existing CLI definition. |

### 5.4 Alignment with planned features

The planned `allbrew scan`, `allbrew switch`, and hooks uninstall-detection (see sibling plan docs) all depend on:

- **Manifest metadata quality** — typed sources (A3) and the `appPath`/`appName`/`bundleId` additions should land before or with uninstall detection.
- **A shared "remove package" core** — `allbrew remove` (above) and uninstall-detection cleanup should share one implementation (`.rb` + manifest + optional brew uninstall + tap-git commit).
- **Non-TTY safety** (F18) and **locking** (F1) — both scan-adjacent automation paths (Folder Actions, launchd) invoke the CLI headlessly.

Sequencing suggestion: fix S1/S2/A5 + F1/F2 first (they harden the foundation every planned feature sits on), then `allbrew list`/`remove`/`doctor` as fast user-visible wins, then the scan → switch → uninstall-detection sequence per the existing plan docs.

---

## 6. Verified-clean areas (no action needed)

- SHA256 is computed streaming from the same bytes written to disk — no TOCTOU (`lib/sha256.ts:24-50`).
- `execFile` with array args used everywhere except the README-command path (S3) — no shell-string execution.
- Token never logged, never embedded in git remote URLs.
- `writeFormula`/`writeCask` path construction safe given current name sanitization.
- No prototype-pollution-prone JSON merging.
- No circular imports; no dead code; all dependencies in use.
