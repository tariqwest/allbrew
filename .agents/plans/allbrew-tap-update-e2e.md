# allbrew Tap + Update E2E — Plan

> **Goal:** Add a new E2E test tier, gated behind an `E2E_TAP=1` flag, that exercises the full off-machine cycle: **generate → commit + push to a real remote tap → `brew tap` / `brew update` → `brew install <name>` from the registry → verify**. A companion set of tests covers the **livecheck-driven update cycle**: after artificially bumping the upstream "release" of a fake app, `allbrew update-formulas` must regenerate the formula/cask, commit, push, and the new version must install correctly.

Because dependable organic upstream changes are not available on demand, the plan uses **synthetic fixtures**: a small set of fake apps/repos whose release artifacts, registry entries, and download URLs are under our control. Each fixture is paired with a "release mutator" that can publish a new version (new tag, new asset URL, new checksum, new registry version) so the update flow has something concrete to detect and regenerate.

---

## 1. Background & motivation

The existing E2E tier (`tests/e2e/catalog.e2e.test.ts`, gated by `E2E=1`) only covers:

1. `allbrew <url>` → generate `.rb` file into a local tap dir
2. `brew install --formula|--cask <filePath>` (install directly from the file)
3. verify binary runs
4. `brew uninstall`

It never exercises:

- `tap-git.ts` `commitAndPushTap` — committing the generated `.rb` to a git tap and pushing to a remote.
- `brew tap <user>/<repo>` + `brew update` + `brew install <name>` — installing from the tap *as a registry*, not from a file path.
- `update-formulas.ts` + `package-updater.ts` — the livecheck-driven regeneration flow.
- `manifest.ts` persistence and reload across the update cycle.
- The `brew livecheck` → `allbrew update-formulas` → commit → push → `brew upgrade` chain.

These are the off-machine side effects that distinguish allbrew from a one-shot generator, and they are currently untested end-to-end.

---

## 2. Scope

### In scope

- A new test tier `tests/e2e-tap/` gated behind `E2E_TAP=1` (separate from `E2E=1`).
- A **synthetic fixture harness** that creates and serves fake upstream artifacts for each generator family, plus a "release mutator" to bump versions.
- A **real (but disposable) git tap** — a bare remote on local disk (`git init --bare`) plus a working clone — so `commitAndPushTap` and `brew tap`/`brew update`/`brew install <name>` all work without touching GitHub.
- Per-generator-family E2E scenarios covering: initial generate → push → tap install → verify.
- Per-generator-family **update** scenarios covering: mutate upstream release → `brew livecheck` detects new version → `allbrew update-formulas` regenerates → push → `brew upgrade` → verify new version.
- A runner script `scripts/test-e2e-tap.sh` and `package.json` script `test:e2e-tap`.

### Out of scope (for this plan)

- Pushing to a real GitHub remote. The bare-repo-on-disk approach exercises the same `git push` / `brew tap` code paths without network flakiness or token requirements.
- GUI/cask automation (Cua Driver). Cask install verification is CLI-based (`brew list --cask`, `brew info --cask`).
- The `cask-app-mas` and `cask-app-setapp` generators. These depend on the Mac App Store and Setapp infrastructure that cannot be faked locally. They remain covered by integration tests only.
- Cross-platform (Linux) formula install verification. Tests run on macOS only.

---

## 3. Synthetic fixture harness

### 3.1 Design

A single Bun script `tests/e2e-tap/fixtures/server.ts` starts a local HTTP server (Bun's built-in `Bun.serve`) that emulates, per fixture app, the upstream endpoints each generator family hits:

| Generator family | Emulated endpoints |
|---|---|
| `npm-package` | `registry.npmjs.org/<pkg>` (full packument + tarball download) |
| `pip-package` | `pypi.org/pypi/<pkg>/json` (+ `/simple/` if needed) + wheel/sdist download |
| `cargo-package` | `crates.io/api/v1/crates/<crate>` + `.crate` tarball download |
| `go-package` | `proxy.golang.org/<mod>/@latest` + `.zip` / `.mod` / `.info` |
| `gem-package` | `rubygems.org/api/v1/gems/<gem>.json` + `.gem` download |
| `dotnet-package` | `api.nuget.org/v3-flatcontainer/<pkg>/index.json` + `.nupkg` download |
| `binary-release` / `source-build` / `spm-package` / `mint-package` / `cask-app-release` | GitHub API: `repos/<owner>/<repo>` + `releases/latest` + asset download URLs |
| `install-script` / `archive-build` / `binary-direct` / `cask-app` | Direct URL download (tarball/zip/dmg/sh) |

Each fixture app is defined by a JSON config in `tests/e2e-tap/fixtures/apps/<name>.json`:

```json
{
  "name": "fake-cli",
  "generator": "binary-release",
  "version": "1.0.0",
  "artifactKind": "tarball",
  "artifactContent": "#!/bin/sh\necho fake-cli 1.0.0\n",
  "archAssets": {
    "darwin-arm64": { "name": "fake-cli-1.0.0-darwin-arm64.tar.gz" },
    "darwin-x86_64": { "name": "fake-cli-1.0.0-darwin-x86_64.tar.gz" }
  },
  "github": { "owner": "fake-org", "repo": "fake-cli", "description": "Fake CLI for E2E", "license": "MIT" }
}
```

### 3.2 Release mutator

A companion script `tests/e2e-tap/fixtures/mutate.ts` rewrites a fixture app's JSON to bump the version and regenerate artifact content/checksums:

```bash
bun run tests/e2e-tap/fixtures/mutate.ts fake-cli 2.0.0
```

This:
1. Updates `version` in the fixture JSON.
2. Regenerates artifact content (e.g. embeds the new version string in the binary/script).
3. Re-tars / re-zips and recomputes SHA256.
4. Writes the new fixture JSON.

The running fixture server reads fixture JSONs fresh on each request (or is sent a SIGHUP to reload), so after mutation the next `brew livecheck` / `allbrew update-formulas` call sees the new version.

### 3.3 Artifact generation

For formula generators that produce a real installable binary, the fixture harness generates a minimal shell-script "binary" inside a tarball/zip that echoes its version. This is enough for `brew install` + `brew test` to pass without a real build toolchain. For cask generators, the harness generates a minimal `.app` bundle inside a DMG (using `hdiutil` on macOS) or ZIP.

### 3.4 GitHub API emulation

For GitHub-release-driven generators, the fixture server emulates:
- `GET /repos/{owner}/{repo}` → repo metadata JSON
- `GET /repos/{owner}/{repo}/releases/latest` → release JSON with `tag_name`, `assets[].browser_download_url` pointing back at the fixture server
- `GET /assets/<name>` → the actual artifact bytes

`GITHUB_TOKEN` is not required since the fixture server doesn't auth-check. The generators call `getRepoInfo` / `getLatestRelease` via Octokit, which will hit `api.github.com` by default. To redirect, the test harness sets `GITHUB_API_URL=http://localhost:<port>` (Octokit respects this) or monkeypatches the base URL. If Octokit doesn't respect `GITHUB_API_URL`, the harness will use Bun's module mocking (`mock.module`) to stub `lib/github.ts` exports to call the fixture server directly.

---

## 4. Disposable git tap

### 4.1 Creation

A helper in `tests/e2e-tap/helpers/tap.ts`:

1. `mkdtemp` a bare repo: `git init --bare <remoteDir>`.
2. `mkdtemp` a working clone: `git clone <remoteDir> <workDir>`.
3. Create `Formula/` and `Casks/` in the working clone.
4. Initial commit + push so `main` exists on the remote.
5. `brew tap <local-tap-name> <file://<remoteDir>>` — taps the bare repo by file URL.

`<local-tap-name>` is a short name like `e2e-tap` so formulas install as `e2e-tap/<formula>`.

### 4.2 allbrew config

The harness writes a temporary `~/.config/allbrew/config.json` (backed up and restored in `afterAll`) pointing `tapPath` at the working clone and `update.autoPush` to `true`. This makes `allbrew <url>` and `allbrew update-formulas` write to the working clone and push to the bare remote.

### 4.3 Teardown

`afterAll`:
- `brew untap <local-tap-name>`
- Restore original `~/.config/allbrew/config.json`
- `rm -rf` both temp dirs
- Delete any manifests created during the run

---

## 5. Test scenarios

### 5.1 Generator family grouping

The 17 generators group into 7 families by upstream source type:

| Family | Generators | Upstream source |
|---|---|---|
| **A. GitHub release (binary)** | `binary-release` | GitHub release assets (tarballs) |
| **B. GitHub release (source)** | `source-build`, `spm-package`, `mint-package` | GitHub release tarball/zipball |
| **C. GitHub release (cask)** | `cask-app-release` | GitHub release `.dmg`/`.zip` |
| **D. Package registry** | `npm-package`, `pip-package`, `cargo-package`, `go-package`, `gem-package`, `dotnet-package` | Registry JSON + tarball/wheel/gem/nupkg |
| **E. Direct URL (formula)** | `install-script`, `archive-build`, `binary-direct` | Direct download URL |
| **F. Direct URL (cask)** | `cask-app` | Direct `.dmg`/`.zip` URL |
| **G. Store-backed cask** | `cask-app-mas`, `cask-app-setapp` | **Out of scope** — cannot fake |

### 5.2 Per-family test matrix

Each family gets two test files:

1. `<family>.generate.e2e-tap.test.ts` — initial generate → push → tap install → verify.
2. `<family>.update.e2e-tap.test.ts` — mutate upstream → livecheck → update-formulas → push → upgrade → verify.

#### Scenario template (generate)

```
1. Start fixture server (beforeAll)
2. Create disposable git tap (beforeAll)
3. allbrew <fixture-url> --name <fake-app> --type <generator> --tap <workDir>
4. Assert .rb file exists in workDir/Formula|Casks/
5. Assert workDir has uncommitted change → allbrew already committed+pushed
6. Assert bare remote has the .rb file at HEAD
7. brew tap <local-tap-name> (if not already tapped)
8. brew install <local-tap-name>/<fake-app>
9. Assert <verify-command> exits 0 and outputs expected version
10. brew uninstall <local-tap-name>/<fake-app>
```

#### Scenario template (update)

```
1. Start fixture server (beforeAll)
2. Create disposable git tap (beforeAll)
3. Generate v1.0.0 (same as generate scenario above)
4. brew install <local-tap-name>/<fake-app>  (install v1)
5. Assert installed version is 1.0.0
6. mutate.ts <fake-app> 2.0.0  (bump fixture upstream)
7. brew livecheck <local-tap-name>/<fake-app> --json
   → assert latest == 2.0.0, outdated == true
8. allbrew update-formulas --names <fake-app>
   → assert result.updated includes <fake-app>
9. Assert workDir .rb file now has version "2.0.0"
10. Assert bare remote HEAD has the updated .rb file
11. brew update  (refresh tap index from remote)
12. brew upgrade <local-tap-name>/<fake-app>
13. Assert <verify-command> outputs 2.0.0
14. brew uninstall <local-tap-name>/<fake-app>
```

### 5.3 Full scenario list

| # | Family | Generator | Test file | What it validates |
|---|---|---|---|---|
| 1 | A | `binary-release` | `github-binary.generate` | Generate + push + tap install of a GitHub release binary formula |
| 2 | A | `binary-release` | `github-binary.update` | Mutate release tag/assets → livecheck → update-formulas → upgrade |
| 3 | B | `source-build` | `github-source.generate` | Generate + push + tap install of a source-build formula (fake build) |
| 4 | B | `source-build` | `github-source.update` | Mutate release → livecheck → update → upgrade |
| 5 | B | `spm-package` | `github-source.generate` | Same, SPM variant |
| 6 | B | `spm-package` | `github-source.update` | Same, SPM variant |
| 7 | B | `mint-package` | `github-source.generate` | Same, Mint variant |
| 8 | B | `mint-package` | `github-source.update` | Same, Mint variant |
| 9 | C | `cask-app-release` | `github-cask.generate` | Generate + push + tap install of a cask from GitHub release DMG |
| 10 | C | `cask-app-release` | `github-cask.update` | Mutate release DMG → livecheck → update → upgrade |
| 11 | D | `npm-package` | `registry.generate` | Generate + push + tap install from fake npm registry |
| 12 | D | `npm-package` | `registry.update` | Bump npm version → livecheck → update → upgrade |
| 13 | D | `pip-package` | `registry.generate` | Same, PyPI |
| 14 | D | `pip-package` | `registry.update` | Same, PyPI |
| 15 | D | `cargo-package` | `registry.generate` | Same, crates.io |
| 16 | D | `cargo-package` | `registry.update` | Same, crates.io |
| 17 | D | `go-package` | `registry.generate` | Same, Go proxy |
| 18 | D | `go-package` | `registry.update` | Same, Go proxy |
| 19 | D | `gem-package` | `registry.generate` | Same, RubyGems |
| 20 | D | `gem-package` | `registry.update` | Same, RubyGems |
| 21 | D | `dotnet-package` | `registry.generate` | Same, NuGet |
| 22 | D | `dotnet-package` | `registry.update` | Same, NuGet |
| 23 | E | `install-script` | `direct-url.generate` | Generate + push + tap install from a direct .sh URL |
| 24 | E | `install-script` | `direct-url.update` | Bump URL version → livecheck (url strategy) → update → upgrade |
| 25 | E | `archive-build` | `direct-url.generate` | Generate + push + tap install from a direct archive URL |
| 26 | E | `archive-build` | `direct-url.update` | Bump archive version → update → upgrade |
| 27 | E | `binary-direct` | `direct-url.generate` | Generate + push + tap install from a direct binary URL |
| 28 | E | `binary-direct` | `direct-url.update` | Bump binary version → update → upgrade |
| 29 | F | `cask-app` | `direct-cask.generate` | Generate + push + tap install from a direct DMG URL |
| 30 | F | `cask-app` | `direct-cask.update` | Bump DMG version → livecheck → update → upgrade |

**30 scenarios total** (15 generate + 15 update), covering 15 of the 17 generators. The 2 store-backed generators (`cask-app-mas`, `cask-app-setapp`) are excluded.

### 5.4 Cross-cutting scenarios

In addition to the per-family matrix, a `cross-cutting.e2e-tap.test.ts` file covers:

| # | Scenario | What it validates |
|---|---|---|
| 31 | **Multi-package update batch** | Seed 3 fake apps (one per family), bump all, run `allbrew update-formulas` once → all 3 updated, single commit, single push |
| 32 | **Dry-run update** | Bump upstream, run `allbrew update-formulas --dry-run` → no commit, no push, result.updated lists the name |
| 33 | **No-op update** | Don't bump upstream, run `allbrew update-formulas` → result.updated is empty, no commit |
| 34 | **Error status skip** | Seed a manifest, inject a livecheck entry with `status: "error"` → update-formulas skips it, no commit |
| 35 | **Manifest persistence** | After generate, manifest JSON exists in `~/.config/allbrew/packages/`. After update, `recordedVersion` and `recordedAt` are updated |
| 36 | **Unmanaged formula skip** | A formula in the tap with no manifest → `update-formulas` skips it even if livecheck says outdated |
| 37 | **Tap filter** | `update-formulas --tap-path <other>` → skips packages whose manifest `tapPath` doesn't match |
| 38 | **Commit message format** | After update, `git log --format=%s -1` matches `chore(allbrew): update <name>` |
| 39 | **Push actually reaches remote** | After update, `git -C <bare-remote> log` has the same commit SHA as the working clone HEAD |

---

## 6. Implementation plan

### 6.1 Files to create

| File | Purpose |
|---|---|
| `tests/e2e-tap/fixtures/server.ts` | Bun.serve HTTP fixture server emulating npm/PyPI/crates/Go/RubyGems/NuGet/GitHub APIs + direct downloads |
| `tests/e2e-tap/fixtures/mutate.ts` | CLI to bump a fixture app's version and regenerate artifacts |
| `tests/e2e-tap/fixtures/apps/*.json` | Per-fixture-app config (one per generator family, ~10 files) |
| `tests/e2e-tap/fixtures/artifacts.ts` | Helpers to build tarballs/zips/DMGs/shell scripts from fixture config |
| `tests/e2e-tap/helpers/tap.ts` | Create/destroy disposable bare git remote + working clone + `brew tap` |
| `tests/e2e-tap/helpers/config.ts` | Backup/restore `~/.config/allbrew/config.json`, write test config |
| `tests/e2e-tap/helpers/run.ts` | `runCommand` wrapper (spawnSync with timeout, env, logging) |
| `tests/e2e-tap/helpers/server.ts` | Start/stop fixture server, get base URL, wait for health |
| `tests/e2e-tap/github-binary.e2e-tap.test.ts` | Scenarios 1–2 |
| `tests/e2e-tap/github-source.e2e-tap.test.ts` | Scenarios 3–8 |
| `tests/e2e-tap/github-cask.e2e-tap.test.ts` | Scenarios 9–10 |
| `tests/e2e-tap/registry.e2e-tap.test.ts` | Scenarios 11–22 |
| `tests/e2e-tap/direct-url.e2e-tap.test.ts` | Scenarios 23–28 |
| `tests/e2e-tap/direct-cask.e2e-tap.test.ts` | Scenarios 29–30 |
| `tests/e2e-tap/cross-cutting.e2e-tap.test.ts` | Scenarios 31–39 |
| `scripts/test-e2e-tap.sh` | Shell runner: starts fixture server, runs vitest with `E2E_TAP=1`, tears down |

### 6.2 Files to modify

| File | Change |
|---|---|
| `package.json` | Add `"test:e2e-tap": "E2E_TAP=1 bun run vitest run --project=e2e-tap"` and a vitest project entry |
| `vitest.config.ts` (or `vitest.config.js`) | Add an `e2e-tap` project targeting `tests/e2e-tap/**/*.e2e-tap.test.ts` with a long timeout (10 min per test) |
| `AGENTS.md` | Document the new `E2E_TAP=1` tier and the `test:e2e-tap` command |
| `.env.example` | Document `E2E_TAP=1` |

### 6.3 GitHub API redirection

The generators call `getRepoInfo` / `getLatestRelease` via Octokit, which hits `api.github.com`. Two options:

1. **Preferred: `GITHUB_API_URL` env var.** Octokit's `rest` client respects `options.baseUrl`. If `lib/github.ts` constructs Octokit with `process.env.GITHUB_API_URL` as the base URL (small change), the fixture server can emulate the GitHub REST API. This is the cleanest path and benefits non-test use cases too (GitHub Enterprise).
2. **Fallback: module mocking.** Use Bun's `mock.module` in the test setup to replace `lib/github.ts` exports with fixture-server-backed stubs. No production code change, but test-only monkeypatching.

The plan recommends option 1 and includes a one-line change to `lib/github.ts` to read `GITHUB_API_URL` if present (defaulting to `https://api.github.com`).

### 6.4 Fixture server endpoint map

```
GET  /api/repos/:owner/:repo                      → repo metadata
GET  /api/repos/:owner/:repo/releases/latest       → latest release JSON
GET  /assets/:owner/:repo/:name                    → artifact bytes
GET  /npm/:pkg                                     → npm packument
GET  /npm/:pkg/-/:pkg-<version>.tgz               → npm tarball
GET  /pypi/:pkg/json                               → PyPI JSON
GET  /pypi/packages/:pkg/<version>/<filename>      → wheel/sdist
GET  /crates/:crate                                → crates.io JSON
GET  /crates/:crate/:version/download              → .crate tarball
GET  /go/:mod/@latest                              → Go module info
GET  /go/:mod/@v/:version.zip                      → Go module zip
GET  /gems/:gem.json                               → RubyGems gem info
GET  /gems/:gem-:version.gem                       → .gem file
GET  /nuget/:pkg/index.json                        → NuGet flat container
GET  /nuget/:pkg/:version/:pkg.:version.nupkg      → .nupkg
GET  /direct/:name                                 → direct download (tarball/zip/dmg/sh)
```

All endpoints read from the fixture JSON files at request time so mutations are immediately visible.

### 6.5 Artifact content strategy

To keep `brew install` + `brew test` passing without real build toolchains:

- **Formula binaries**: a shell script `#!/bin/sh\necho <name> <version>\n` packaged as a tarball (`.tar.gz`) with a `bin/<name>` entry. `brew install` installs it; `brew test` runs `<name> --version` (the formula's `test do` block).
- **Source-build formulas**: a fake `configure` / `Makefile` that just copies the shell script to `$(PREFIX)/bin/<name>`. The fixture tarball includes `configure`, `Makefile`, and `src/<name>.sh`.
- **npm/pip/cargo/go/gem/dotnet**: a minimal real package (npm `package.json` with a `bin` entry; pip `setup.py` with a console script; etc.) packaged as the real registry format. The "binary" is a shell script. This exercises the real `std_npm_args` / `virtualenv` / `std_cargo_args` / etc. install paths.
- **Cask DMGs**: a minimal `.app` bundle containing a shell-script binary, packaged in a DMG via `hdiutil create`. The app's `Info.plist` has the version. `brew install --cask` mounts and copies it.

### 6.6 Vitest configuration

The `e2e-tap` project in `vitest.config`:

```ts
{
  test: {
    projects: [
      // ...existing projects...
      {
        extends: true,
        test: {
          name: "e2e-tap",
          include: ["tests/e2e-tap/**/*.e2e-tap.test.ts"],
          testTimeout: 600_000,       // 10 min per test
          hookTimeout: 120_000,       // 2 min for beforeAll/afterAll
          teardownTimeout: 60_000,
          // Don't run in parallel — all tests share the fixture server and tap
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
}
```

All tests run in a single fork because they share the fixture server port and the `brew tap` state. The fixture server is started in `beforeAll` of the first test file (or by the shell runner before vitest) and stopped in `afterAll` of the last (or by the runner after vitest).

---

## 7. Verification

### 7.1 How to run

```bash
# Start fixture server + run all E2E tap tests
bun run test:e2e-tap

# Or via the shell runner (handles server lifecycle)
scripts/test-e2e-tap.sh

# Run a single family
E2E_TAP=1 bun run vitest run --project=e2e-tap tests/e2e-tap/github-binary.e2e-tap.test.ts

# Run only update scenarios
E2E_TAP=1 bun run vitest run --project=e2e-tap -t "update"
```

### 7.2 What each test asserts

- **Generate scenarios**: `.rb` file written, committed, pushed to bare remote, `brew install <tap>/<name>` succeeds, verify command outputs expected version, `brew uninstall` succeeds.
- **Update scenarios**: after mutation, `brew livecheck` reports new version as outdated, `allbrew update-formulas` returns the name in `updated`, `.rb` file has new version + new SHA256, new commit pushed to remote, `brew update` + `brew upgrade` installs new version, verify command outputs new version.
- **Cross-cutting**: batch updates, dry-run, no-op, error skip, manifest persistence, unmanaged skip, tap filter, commit message format, remote sync.

### 7.3 Pre-merge checklist

- [ ] `bun run check` passes (no type errors)
- [ ] `bun run test` passes (existing unit tests unaffected)
- [ ] `E2E_TAP=1 bun run test:e2e-tap` passes all 39 scenarios on a clean macOS with Homebrew
- [ ] No changes to `~/.config/allbrew/config.json` persist after the run (backup/restore verified)
- [ ] No leftover `brew tap` entries after the run (`brew untap` verified)
- [ ] No leftover manifests in `~/.config/allbrew/packages/` after the run
- [ ] Fixture server is killed on exit (even on SIGINT/SIGTERM)

---

## 8. Risks & considerations

| Risk | Mitigation |
|---|---|
| **Octokit may not respect `GITHUB_API_URL`** | Fall back to `mock.module` to stub `lib/github.ts`. The one-line production change is preferred but not blocking. |
| **`brew tap` from a `file://` URL may behave differently than `https://`** | `brew tap` supports `file://` URLs natively. If `brew update` doesn't fetch from the bare remote correctly, switch to a local SSH-based remote or a lightweight HTTP git server. |
| **Cask DMG creation requires `hdiutil` and may be slow** | Cache DMGs per version in a temp dir; only recreate on mutation. |
| **Real package-manager install paths (npm/pip/cargo) need real toolchains** | The VM setup script already installs Node, Python, Rust, Go, Ruby, dotnet. Tests should `skipIf` if the toolchain is missing. |
| **Tests are slow (10 min timeout each, 39 scenarios)** | Run only in CI or on demand. The `E2E_TAP=1` gate ensures they don't run in the default `bun run test` or `bun run test:all`. |
| **Fixture server port conflicts** | Use port 0 (OS-assigned) and pass the actual port to tests via an env var or a shared temp file. |
| **`brew livecheck` may not work for all livecheck strategies with fake URLs** | The fixture server returns the right JSON shapes. For `:github_latest` strategy, the emulated GitHub releases endpoint returns the new tag. For URL-regex strategies, the direct download URL embeds the version. |
| **Concurrent test runs could collide on `brew tap` state** | `singleFork: true` in vitest config ensures serial execution. The shell runner also uses a unique tap name per run (PID-suffixed). |
| **`allbrew` CLI may not be on PATH** | Tests use `bun run bin/allbrew.ts` as fallback, same as the existing E2E tier. |

---

## 9. Implementation order

1. **Fixture server + artifact builders** (`server.ts`, `artifacts.ts`, `apps/*.json`) — can be developed and tested standalone with `curl`.
2. **Disposable tap helper** (`tap.ts`, `config.ts`) — can be tested standalone with a manual `allbrew` invocation.
3. **GitHub API redirection** (one-line change to `lib/github.ts` or `mock.module` fallback).
4. **One generate scenario** (`github-binary.e2e-tap.test.ts`) — proves the harness end-to-end.
5. **One update scenario** (add to `github-binary.e2e-tap.test.ts`) — proves the livecheck → update → upgrade chain.
6. **Remaining generate + update scenarios** — mechanical replication per family.
7. **Cross-cutting scenarios** — build on the per-family harness.
8. **Shell runner + package.json + vitest config** — wire up `test:e2e-tap`.
9. **AGENTS.md + .env.example** — document the new tier.
10. **Full run + pre-merge checklist** — verify on a clean VM.
