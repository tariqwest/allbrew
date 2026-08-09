# Failure playbook

Map install logs to likely code locations and durable fixes.

## Investigation order

1. **Capture** — full verbose log from Homebrew `allbrew`.
2. **Classify stage** — classify URL → detect install method → service decision → collect payload → write formula → `brew update`/`brew install` → runtime binary.
3. **Compare service expectation** — agent Phase 0.5 vs formula `service do` / log hints.
4. **Reproduce offline** when possible with unit tests; use live registries only in integration tests.
5. **Fix earliest wrong layer** so every generator benefits.
6. **Lock with tests** that fail before the fix and pass after.

## Stage signatures

### Classifier / routing

| Symptom | Likely files | Fix direction |
|---------|--------------|---------------|
| Wrong strategy (cask vs formula, script vs archive) | `lib/classifier.ts` | Tighten URL/path heuristics; add unit cases for the URL shape |
| GitHub monorepo package not found at root | `lib/cli.ts`, `lib/github.ts`, `lib/analyzer.ts` | Prefer registry name from README/package.json over repo name |

### Analyzer (README install detection)

| Symptom | Likely files | Fix direction |
|---------|--------------|---------------|
| `npm registry lookup failed for pkg@latest: 404` | `lib/analyzer.ts` (`detectInstallMethod`, `cleanNpmPackageSpec`) | Strip dist-tags/versions from npm/pnpm/yarn/bun/npx specs; keep scopes (`@scope/pkg`) |
| pip package includes extras/version ops | `lib/analyzer.ts` (`cleanPipPackageSpec`) | Strip extras `[…]`, `@pin`, and PEP 440 operators |
| `npx foo` chosen over better `npm i -g foo` | `lib/analyzer.ts` | Prefer explicit global install lines when both exist |

**Canonical case — GitNexus (2026-07-30):**

- URL: `https://github.com/abhigyanpatwari/GitNexus`
- README advertised `npm install -g gitnexus@latest` / `npx gitnexus@latest`
- Analyzer returned package `gitnexus@latest`
- Generator fetched `https://registry.npmjs.org/gitnexus%40latest` → 404
- Fix: `cleanNpmPackageSpec()` + unit tests for `@latest`, version tags, and scoped packages
- Release: allbrew `0.0.7` → `0.0.8`
- Service note: primary UX is CLI + stdio MCP; optional `serve` is a bridge. Agent expectation is typically **no** brew service unless docs clearly position a supervised daemon as the default.

### Service detection mismatches (`service_mismatch`)

Monitored installs **must not** pass `--service` / `--no-service`. allbrew auto-detects; the agent independently judges whether a long-running supervised process exists and errors on disagreement.

| Symptom | Likely files | Fix direction |
|---------|--------------|---------------|
| Service block with nonsense command (`This starts the server on \``) | `lib/analyzer.ts` (`detectServiceConfig`, local web helpers), `lib/generators/service.ts`, `lib/cli.ts` prompts | Extract real argv only; reject prose/STATUS lines; never use markdown sentence fragments as `run` |
| Service stanza present for one-shot CLI / stdio MCP | `lib/analyzer.ts` (`SERVICE_HINT_RE`, `detectLocalWebService`) | Narrow hints; ignore editor MCP “server” wording; require blocking supervised command |
| Missing service for real daemon (`brew services start`, launchd plist, blocking `foo server`) | same + `detectServiceConfigFromFiles` | Raise confidence when brew-services/launchd/plist evidence exists; preserve `keep_alive` when appropriate |
| Correct boolean but wrong binary/args | `preferPackageCommand`, service option merge in CLI | Prefer package bin + documented subcommand over nearby prose |

When fixing service detection, add unit fixtures under `tests/unit/analyzer.test.ts` (and generator service tests if the Ruby block shape is wrong).

### Generators / registry fetch

| Symptom | Likely files | Fix direction |
|---------|--------------|---------------|
| npm/pypi/crates/go registry 404 on cleaned name | `lib/generators/*-package.ts` | Confirm package name; allow `--package` override; handle monorepo publish names |
| SHA256 / download fails on redirect | `lib/sha256.ts` | Follow redirects manually; normalize uppercase `HTTPS://` Location schemes |
| Wrong tarball/version chosen | generator + livecheck helpers | Use `dist-tags.latest` / registry JSON carefully; avoid prerelease unless requested |
| License/homepage garbage in Ruby | generator + `lib/utils.ts` (`rubyEscape`, `guessLicenseIdentifier`) | Escape `#` and interpolation; map SPDX better |

### Templates / Ruby output

| Symptom | Likely files | Fix direction |
|---------|--------------|---------------|
| Invalid Ruby / brew audit failures | `lib/templates/**`, `lib/template-renderer.ts` | Fix template payload fields; extend `bun run test:templates` fixtures |
| Missing `bin` symlink | npm/pip/cargo templates + bin-name extraction | Use `extractNpmBinName` (and peers); honor `--bin-name` |
| Bad `service do` Ruby | service template helpers | Ensure `run` is an argv array / shell-safe command, not free prose |

### brew install / runtime

| Symptom | Likely files | Fix direction |
|---------|--------------|---------------|
| `brew install` compile/native addon failure | formula deps, postinstall env | Add `depends_on` for toolchains when required; document optional env skips; still prefer upstream prebuilds |
| Binary not on PATH after install | install stanza | Ensure `bin.install` / `bin.install_symlink libexec.glob("bin/*")` |
| Cask app missing / quarantine | cask templates, zap/uninstall | Fix app artifact name; note unsigned apps may need user approval |
| Auto `brew update` cannot see formula | tap git remote / `lib/tap-git.ts` | Ensure formula committed/pushed when autoPush enabled; local `brew tap` path correct |

## Prompt hangs

allbrew still prompts for description/service when flags are omitted.

Always pass for monitored runs:

```bash
--name <slug> --verbose
# plus when known:
--package <registry-name> --desc "..." --bin-name <bin> --app-name "Foo.app"
```

Do **not** pass `--service` / `--no-service` to bypass detector bugs.

If a prompt still appears, kill the hung process and re-run with `--type <generator>` plus name/desc/package overrides rather than answering interactively in automation. If the hang is specifically the service confirmation prompt, treat weak detection as a product issue to fix after capture—not as a reason to force flags on the success path.

## What belongs in add-test-case vs product fix

- **add-test-case**: catalog row, unit/integration fixtures, e2e catalog entry documenting the app and generator.
- **product fix**: analyzer/generator/template/sha256/service-detection changes that make *any* similar URL succeed without hand flags when reasonable.
- Prefer both on failure: test case captures the app; product fix removes the class of bug.

## Quick file map

```
lib/classifier.ts          URL → strategy
lib/analyzer.ts            README install + service detection
lib/cli.ts                 orchestration, prompts, brew install
lib/generators/*.ts        registry fetch + payload
lib/generators/service.ts  service block construction
lib/sha256.ts              downloads + checksums
lib/templates/**           Ruby rendering
lib/tap-git.ts             tap commit/push
scripts/release.ts         version bump, GitHub release, homebrew-tap formula
tests/unit/**              offline regressions
tests/integration/**       live registry checks
tests/e2e/catalog.json     install catalog
```
