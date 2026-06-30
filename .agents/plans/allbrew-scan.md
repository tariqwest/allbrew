# `allbrew scan` — Plan

> **Goal:** Scan the user's macOS system for already-installed apps that are **not** managed by Homebrew,
> then retroactively generate formula/cask `.rb` files for each one so they are tracked in the user's tap.
> No reinstall occurs — the existing installation is adopted in-place.

---

## 1. Problem statement

When a user first sets up allbrew they already have apps installed through many routes (direct DMG, MAS, Setapp,
`pip install`, `cargo install`, `npm -g`, `gem install`, `go install`, etc.). `allbrew scan` discovers those
apps, creates the appropriate Homebrew formula or cask file, writes a `PackageManifest`, and commits the batch
to the tap — so `allbrew update-formulas` can keep them current from day one, without forcing a reinstall.

---

## 2. Scope of detection

`allbrew scan` targets **five discovery passes**, run concurrently:

| Pass | Source | Resulting generator |
|------|--------|---------------------|
| **apps** | `/Applications` + `~/Applications` `.app` bundles | `cask-app`, `cask-app-mas`, `cask-app-setapp` |
| **pip** | `pip list --format=json` (all detected Python envs) | `pip-package` |
| **npm** | `npm list -g --depth=0 --json` | `npm-package` |
| **cargo** | `~/.cargo/bin/` executables cross-referenced with `~/.cargo/.crates2.json` | `cargo-package` |
| **go** | `~/go/bin/` executables | `go-package` |

Additional passes (gem, dotnet, mint, spm) are detected if the toolchain is present but are lower priority and can
be deferred to a follow-up.

### What is already managed (skip list)

Before surfacing a candidate, check:

1. `brew list --formula` / `brew list --cask` — already Homebrew-managed → skip entirely.
2. `listManifests()` — already tracked by allbrew → skip.
3. User-provided `--skip <name,...>` flag.

---

## 3. UX flow

```
allbrew scan [--dry-run] [--yes] [--skip <names>] [--tap <path>] [--no-commit]
```

```
🔍  Scanning system for unmanaged apps...

  /Applications pass ........... 47 apps found, 12 already managed by Homebrew, 3 already tracked
  pip pass ...................... 8 packages found, 2 already managed
  npm pass ...................... 4 packages found, 0 already managed
  cargo pass .................... 6 executables found
  go pass ....................... 2 executables found

  52 candidates to review

? Select apps to adopt into your tap:  (Press <space> to select, <a> to toggle all)
  ◉  1Password (MAS)             → cask-app-mas   [id: 1333542190]
  ◉  Raycast (DMG/unknown)       → cask-app        [/Applications/Raycast.app]
  ◯  Xcode (MAS)                 → cask-app-mas   [id: 497799835]   (large — confirm separately)
  ◉  requests (pip)              → pip-package
  ◉  ripgrep (cargo)             → cargo-package
  ...

  [A]dopt selected  [S]kip  [Q]uit
```

After confirmation:

```
  Adopting 38 packages...

  ✔  1password          → Casks/1password.rb          (manifest saved)
  ✔  raycast            → Casks/raycast.rb             (manifest saved)
  ✔  requests           → Formula/python-requests.rb   (manifest saved)
  ✔  ripgrep            → Formula/ripgrep.rb           (manifest saved)
  ✗  obsidian           → could not determine source URL — skipped (use allbrew <url> manually)
  …

  38 adopted, 3 skipped, 1 failed
  Committed to tap: "allbrew scan: adopt 38 packages (2026-06-30)"
```

`--yes` / `-y` skips the interactive checkbox and adopts all non-skipped candidates automatically.
`--dry-run` prints the candidate table without writing anything.
`--no-commit` writes `.rb` files and manifests but skips `tap-git` commit/push.

The interactive selection uses `@inquirer/prompts` `checkbox` followed by a `confirm` prompt; single-key accelerators (e.g., `[A]dopt`) are not implemented.

---

## 4. Architecture

### 4.1 Call graph

```
runScan(opts)
  ├── collectCandidates(opts)          → ScanCandidate[]
  │     ├── scanApplications()         → ScanCandidate[]
  │     ├── scanPip()                  → ScanCandidate[]
  │     ├── scanNpm()                  → ScanCandidate[]
  │     ├── scanCargo()                → ScanCandidate[]
  │     └── scanGo()                   → ScanCandidate[]
  ├── filterAlreadyManaged(candidates) → ScanCandidate[]  (brew list + listManifests)
  ├── promptUserSelection(candidates)  → ScanCandidate[]  (checkbox; skipped with --yes)
  └── adoptCandidates(selected, opts)  → ScanResult
        ├── adoptOne(candidate, opts)  → AdoptResult      (generate .rb + saveManifest, no brew install)
        └── tap-git commit (unless --no-commit)
```

### 4.2 Types (`lib/scan.ts`)

```typescript
import type { GeneratorName } from "../manifest.ts";

export type ScanOrigin =
  | "mas"        // _MASReceipt present in bundle
  | "setapp"     // Setapp support dir or ~/Applications/Setapp path
  | "app-dmg"    // .app in /Applications, source unknown
  | "pip"
  | "npm"
  | "cargo"
  | "go";

export type ScanCandidate = {
  name: string;           // human-readable display name
  token: string;          // toFormulaName / toCaskToken result
  origin: ScanOrigin;
  kind: "formula" | "cask";
  generator: GeneratorName;
  hint: string;           // MAS app ID, pip package name, crate name, go module path, etc.
  version: string;        // currently installed version
  appPath?: string;       // for .app bundles
};

export type AdoptResult = {
  name: string;
  status: "ok" | "skipped" | "failed";
  filePath?: string;
  error?: string;
};

export type ScanResult = {
  adopted: AdoptResult[];
  skipped: AdoptResult[];
  failed: AdoptResult[];
};
```

### 4.3 Detection logic per pass

#### Pass A — `.app` bundles in `/Applications` and `~/Applications`

```typescript
async function scanApplications(): Promise<ScanCandidate[]>
```

For each `.app` bundle:

1. Read `Contents/Info.plist` via `plutil -convert json -o - <path>`.
2. Extract `CFBundleName`, `CFBundleShortVersionString`, `CFBundleIdentifier`.
3. **MAS detection:** `Contents/_MASReceipt/receipt` exists → `origin: "mas"`. Resolve the App Store numeric
   ID from `mdls -name kMDItemAppStoreAdamID <path>` and parse the value after `=` (e.g.,
   `kMDItemAppStoreAdamID = 1333542190`).
4. **Setapp detection:** Bundle path contains `/Setapp/` or
   `~/Library/Application Support/Setapp/<AppName>` directory exists → `origin: "setapp"`.
5. Otherwise → `origin: "app-dmg"`.

Generator mapping:

| origin | generator |
|--------|-----------|
| `mas` | `cask-app-mas` |
| `setapp` | `cask-app-setapp` |
| `app-dmg` | `cask-app` |

#### Pass B — pip packages

```typescript
async function scanPip(): Promise<ScanCandidate[]>
```

Run `pip list --format=json` (and `pip3 list --format=json` if a different executable). Parse JSON array of
`{name, version}`. Each entry → `generator: "pip-package"`, `hint: package_name`.

#### Pass C — npm global packages

```typescript
async function scanNpm(): Promise<ScanCandidate[]>
```

Run `npm list -g --depth=0 --json`. Parse `dependencies` object. Exclude `npm` itself.
Each → `generator: "npm-package"`, `hint: package_name`.

#### Pass D — Cargo installed binaries

```typescript
async function scanCargo(): Promise<ScanCandidate[]>
```

1. List executables in `~/.cargo/bin/`.
2. Parse `~/.cargo/.crates2.json` to resolve each binary → crate name + version.
3. If `.crates2.json` is absent, fall back to binary name as the crate name.
4. Each → `generator: "cargo-package"`, `hint: crate_name`.

#### Pass E — Go installed binaries

```typescript
async function scanGo(): Promise<ScanCandidate[]>
```

1. List executables in `~/go/bin/`.
2. Run `go version -m <binary>` for each to extract the embedded module path + version.
3. Skip any binary that produces no module info (CGO, pre-1.18 tool).
4. Each → `generator: "go-package"`, `hint: module_path`.

### 4.4 Already-managed filter

```typescript
async function filterAlreadyManaged(candidates: ScanCandidate[]): Promise<ScanCandidate[]>
```

1. `execFileAsync("brew", ["list", "--formula"])` → set of formula names.
2. `execFileAsync("brew", ["list", "--cask"])` → set of cask tokens.
3. `listManifests()` → set of allbrew-tracked names.
4. Filter out candidates whose `token` appears in any of these sets (lowercased, normalized).

### 4.5 `adoptOne(candidate, opts)` — the adoption contract

**Key invariant:** `adoptOne` never calls `brew install`. It may call registry APIs and `downloadAndHash` to build a valid, installable formula/cask, but it does not modify the installed application.

| generator | what adoptOne does |
|-----------|-------------------|
| `cask-app-mas` | Reconstructs `https://apps.apple.com/app/id<hint>` URL, calls `collectCaskAppMasPayload` (iTunes API). Writes cask. |
| `cask-app-setapp` | Calls `collectCaskAppSetappPayload` with a synthetic `https://setapp.com/apps/<slug>` URL. If that fetch fails, builds a minimal stub cask. |
| `cask-app` | Calls `buildAdoptedCaskAppPayload(candidate)` (see §4.6) — no download, placeholder URL, `sha256 :no_check`. Writes a non-installable tracking cask. |
| `pip-package` | Calls `collectPipPackagePayload(hint, repoInfo, opts)` — PyPI provides URL and SHA256. Writes formula. |
| `npm-package` | Calls `collectNpmPackagePayload(hint, repoInfo, opts)` — npm registry provides tarball URL; `hashUrl` computes SHA256. Writes formula. |
| `cargo-package` | Resolves the crate via crates.io API, fetches the source tarball URL and SHA256, resolves the GitHub `repoInfo` if a repository URL is available, and calls `collectCargoPackagePayload(repoInfo, release, opts)`. Writes formula. |
| `go-package` | Uses the Go module path from `go version -m` to derive the GitHub `repoInfo` and latest `release`, then calls `collectGoPackagePayload(repoInfo, release, opts)`. Writes formula. |

After each success: `saveManifest(buildManifest(...))` with `source.adoptedByScan: true`.

### 4.6 `buildAdoptedCaskAppPayload` — local `.app` adoption without a download

```typescript
// lib/scan-adopt.ts
export async function buildAdoptedCaskAppPayload(candidate: ScanCandidate): Promise<CaskAppPayload>
```

Builds a `CaskAppPayload` from `Info.plist` data already collected during detection:

- `sha256`: `:no_check` (requires extending the `cask-app` template or adding a dedicated
  `adopted-cask-app` template that emits `sha256 :no_check`).
- `url`: a placeholder URL such as `https://example.com/unknown` (syntactically valid but not
  downloadable), optionally prefixed in the rendered Ruby with a comment `# URL unknown — adopted by allbrew scan`.
- `version`: from `CFBundleShortVersionString`.
- `appOrPkgBlock`: `  app "<AppName>.app"` from the bundle.
- `livecheckBlock`: empty — livecheck cannot resolve without a real URL; `update-formulas` must skip
  adopted stubs until the URL is replaced.

The generated cask is intentionally not `brew install`-able. Its purpose is tracking only; the user can
replace it later with a real cask by running `allbrew <actual-download-url>`.

---

## 5. New files

| File | Role |
|------|------|
| `lib/scan.ts` | `runScan`, `collectCandidates`, `filterAlreadyManaged`, `promptUserSelection`, `adoptCandidates`, shared types |
| `lib/scan-detect.ts` | Five detection passes: `scanApplications`, `scanPip`, `scanNpm`, `scanCargo`, `scanGo` |
| `lib/scan-adopt.ts` | `adoptOne` dispatch table, `buildAdoptedCaskAppPayload` |

---

## 6. `bin/allbrew.ts` registration

```typescript
import { runScan } from "../lib/scan.ts";

program
  .command("scan")
  .description(
    "Scan for already-installed non-Homebrew apps and adopt them into your tap (no reinstall)"
  )
  .option("-y, --yes", "Adopt all candidates without interactive confirmation")
  .option("--dry-run", "Print candidates without writing any files")
  .option("--no-commit", "Write files but skip tap git commit/push")
  .option("--skip <names>", "Comma-separated formula/cask names to skip")
  .option("--tap <path>", "Override the tap repository path for this run")
  .action(async (opts) => {
    const tapPath = await resolveTapPath(opts.tap);
    const skipSet = new Set(
      (opts.skip ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    );
    await runScan({ ...opts, tapPath, skipSet });
  });
```

---

## 7. Manifest shape for adopted packages

Standard `PackageManifest` from `lib/manifest.ts` with `source.adoptedByScan: true` added.

```json
{
  "name": "raycast",
  "kind": "cask",
  "generator": "cask-app",
  "tapPath": "/Users/tariqwest/homebrew-mytapp",
  "source": {
    "url": "https://example.com/unknown",
    "appName": "Raycast",
    "adoptedByScan": true
  },
  "options": {},
  "recordedVersion": "1.75.2",
  "recordedAt": "2026-06-30T13:00:00.000Z"
}
```

Because `buildManifest` builds `source` from a fixed generator switch, `scan` must pass
`sourceOverrides: { adoptedByScan: true }` (or construct the manifest directly) so the flag is stored under
`source` rather than under `options`.

`adoptedByScan: true` signals to future tooling (e.g. `allbrew hooks` uninstall detection) that this package
was not originally installed by allbrew/Homebrew.

---

## 8. Tests

### Unit tests — `tests/unit/scan.test.ts`

- `collectCandidates` with mocked `execFileAsync` + mocked `fs` — produces correct `ScanCandidate[]` with `token` populated.
- `filterAlreadyManaged` maps `listManifests()` to names and removes brew-list and manifest-list names correctly.
- `buildAdoptedCaskAppPayload` builds a valid `CaskAppPayload` with `sha256 :no_check` and a placeholder URL.
- MAS detection: `_MASReceipt/receipt` present → `origin: "mas"`, and AdamID is parsed from `mdls` output.
- Setapp detection: path under `/Setapp/` → `origin: "setapp"`.
- `adoptOne` for `pip-package` calls `collectPipPackagePayload` (PyPI mocked).
- `adoptOne` for `npm-package` calls `collectNpmPackagePayload` and `hashUrl` (npm registry mocked).
- `adoptOne` for `cargo-package` resolves crates.io metadata and calls `collectCargoPackagePayload` (or skips if no release/source tarball is found).
- `adoptOne` for `go-package` parses `go version -m` and calls `collectGoPackagePayload` (or skips if no release is found).
- `adoptOne` for `cask-app-mas` calls `collectCaskAppMasPayload` (iTunes mocked).
- `adoptOne` for `cask-app` writes a `sha256 :no_check` stub with a placeholder URL and does not call `downloadAndHash`.
- `buildManifest` (or the scan manifest builder) includes `source.adoptedByScan: true`.

### Integration tests — `tests/integration/scan.test.ts`

- Live `npm list -g` parse on the CI machine (assert it returns an array).
- Live `pip list` parse (assert it returns an array).
- MAS lookup for a known stable app (e.g. Xcode or 1Password).

---

## 9. Edge cases and decisions

| Situation | Decision |
|-----------|----------|
| App in `/Applications` is also in `brew list --cask` | Caught by `filterAlreadyManaged` — skipped. |
| Direct drag-and-drop DMG app with no traceable URL | Adopted as `cask-app` with `sha256 :no_check` and a placeholder URL. User replaces the stub later with `allbrew <real-url>`. `update-formulas` skips these stubs until the URL is real. |
| Same pip package in system + venv | Deduplicate by name, keep highest version. |
| `pip` / `npm` / `go` / `cargo` not on PATH | Silent fail — skip that pass, emit dim "pass unavailable" note. |
| Go binary has no embedded module path | Skip that binary — can't reconstruct the module URL. |
| Cargo crate has no source tarball or GitHub repo | Skip that candidate. |
| `--yes` + `--skip` both provided | `skipSet` filter runs before adoption, so skips are respected even in non-interactive mode. |
| `.rb` file already exists in tap with same name | In interactive mode: prompt to overwrite. In `--yes` mode: overwrite silently. |
| Setapp fetch fails during adoption | Fall back to a minimal stub cask with `adoptedByScan: true` in source and a `# TODO: add url` comment. |
| MAS `mdls` returns -1 or null for Adam ID | Fall back to iTunes search by bundle ID: `https://itunes.apple.com/lookup?bundleId=<id>`. |
| `buildManifest` source fields | Scan passes `sourceOverrides: { adoptedByScan: true }` so the flag is stored under `source`, not `options`. |

---

## 10. Open questions / resolved decisions

1. **Cargo GitHub resolution (resolved):** Call the crates.io API per crate to get the source tarball URL and
   SHA256, and resolve the GitHub `repoInfo` if a repository URL is present. If the crate has no source tarball
   or repository, skip the candidate. A minimal `no_checksum` formula is not viable because Homebrew formulas
   require a stable `url` + `sha256`.

2. **`no_checksum` vs placeholder string (resolved):** Adopted `cask-app` stubs use `sha256 :no_check` and a
   placeholder URL (e.g., `https://example.com/unknown`) so the Ruby is syntactically valid. The cask is not
   installable until the user replaces the URL.

3. **Setapp detection reliability (open):** The `~/Library/Application Support/Setapp/<AppName>` heuristic can have
   false positives if a non-Setapp app coincidentally creates that directory. Prefer `setapp list --json` if
   the Setapp CLI is available, falling back to the directory heuristic. Verify `setapp-cli` actually exposes this
   command before implementation.

4. **Interactive library (resolved):** Use `@inquirer/prompts` `checkbox` followed by `confirm`. Single-key
   accelerators are not implemented.

5. **Commit granularity (open):** A single batch commit (`"allbrew scan: adopt N packages (YYYY-MM-DD)"`) is planned.
   Should each adopted package be its own commit instead, to match the style of `allbrew <url>` which commits
   per-package? A batch commit is more practical at scale; per-package commits are more auditable.
