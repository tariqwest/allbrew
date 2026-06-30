# `allbrew switch` — Plan

> **Goal:** Scan the user's macOS system for already-installed apps (via MAS, Setapp, direct DMG, pip, npm, etc.) that are **not** managed by Homebrew, but **are** available in the official Homebrew core taps or casks. Offer the user an interactive prompt to "switch" these apps to the Homebrew-managed version.

This feature complements the [`allbrew scan`](./allbrew-scan.md) command. While `scan` adopts apps into the user's personal allbrew tap *without* reinstalling, `switch` replaces the existing installation with the official Homebrew version.

---

## 1. Problem statement

Users often install applications manually (dragging to `/Applications`), via the Mac App Store, or through language package managers (`npm install -g`, `pip install`). Later, they discover Homebrew and want to consolidate their package management. Finding out which of their manually installed apps are available on Homebrew and switching them over is a tedious manual process of `brew search` and `rm -rf`. 

`allbrew switch` automates this discovery and migration path.

---

## 2. Scope of detection

`allbrew switch` reuses the core detection passes defined in the `allbrew scan` architecture (`lib/scan-detect.ts`).

| Pass | Source | Switch Target |
|------|--------|---------------|
| **apps** | `/Applications`, `~/Applications`, `/Applications/Setapp`, `~/Applications/Setapp` (`.app` bundles) | Homebrew Casks |
| **pip** | `pip list --format=json` | Homebrew Formulas |
| **npm** | `npm list -g --json` | Homebrew Formulas |
| **cargo** | `~/.cargo/bin/` | Homebrew Formulas |
| **go** | `~/go/bin/` | Homebrew Formulas |
| **gem** | `gem list --local` | Homebrew Formulas |
| **dotnet** | `dotnet tool list -g` | Homebrew Formulas |
| **mint** | `mint list` | Homebrew Formulas |
| **spm** | `~/.swiftpm/bin/` | Homebrew Formulas |
| **binaries** | `/usr/local/bin/`, `/opt/local/bin/`, `~/.local/bin/` (non-symlink, not inside Homebrew prefix, not a known version-manager shim) | Homebrew Formulas |

### What is skipped

1. Apps already managed by Homebrew (`brew list --formula`, `brew list --cask`).
2. Apps currently tracked by allbrew in the user's tap (`listManifests()`).
3. Candidates where no match is found in the official Homebrew registry.

---

## 3. Matching Logic

To determine if an unmanaged app is available in Homebrew, `allbrew` will cross-reference the local candidate names against the Homebrew API.

*Reference logic from Cork:* [Get Adoptable Packages.swift](https://github.com/buresdv/Cork/blob/7c3418bdfc31b30aaabbbc839dd4c65c4276d354/Modules/Packages/PackagesModels/Logic/App%20Adoption/Get%20Adoptable%20Packages.swift)

### Strategy

1. **Fetch Homebrew API Data (Fastest):**
   Download the JSON datasets for formulas and casks from `https://formulae.brew.sh/api/formula.json` and `https://formulae.brew.sh/api/cask.json`. Cache them at `~/.config/allbrew/brew-api-cache.json` with a TTL of 6 hours to ensure fast lookups.
2. **Normalize and Compare:**
   - For `.app` bundles: Strip `.app`, lowercase, remove spaces/dashes. Compare against cask `token` and `name` array.
   - For pip/npm/cargo/go packages: Compare the candidate name against formula `name` and `aliases`.
3. **Fuzzy Matching / Heuristics:**
   If exact matches fail, apply light heuristics (e.g., matching the `CFBundleIdentifier` domain to the cask homepage, or checking `brew search <name>` programmatically as a fallback).

---

## 4. UX flow

```
allbrew switch [--dry-run] [--yes]
```

`allbrew switch` presents a keyboard-navigable TUI list of every locally installed app that has a matching
Homebrew formula or cask. The user selects which items to switch using the arrow keys and `<space>`; `<enter>`
confirms the selection. The list is rendered with `@inquirer/prompts` `checkbox` (the same prompt library used
throughout the CLI), not a `--skip` flag that requires the user to type names upfront.

```
🔍  Scanning system for unmanaged apps...
    (Found 47 apps, 8 pip packages, 4 npm packages)

🔎  Cross-referencing with official Homebrew repositories...

  We found 4 locally installed apps that are available in Homebrew!

? Select apps to switch to the Homebrew-managed version (↑/↓ to navigate, space to toggle, enter to confirm):
  (All matches are selected by default.)

  LOCAL INSTALLATION                      HOMEBREW MATCH
  ------------------                      --------------
◉ Raycast (1.74.0)                        raycast (1.75.2)
  Location: /Applications/Raycast.app     Desc: Control your tools with a few keystrokes
  Origin: Direct Download                 Type: Cask

◉ ripgrep (13.0.0)                        ripgrep (14.1.0)
  Location: ~/.cargo/bin/rg               Desc: Search tool like grep and The Silver Searcher
  Origin: cargo                           Type: Formula

◯ 1Password (8.10.30)                     1password (8.10.34)
  Location: /Applications/1Password.app   Desc: Password manager that keeps all passwords secure
  Origin: Mac App Store (id: 1333542190)  Type: Cask
```

`--yes` / `-y` skips the TUI and switches all matched apps automatically.
`--dry-run` prints the matched table without making any changes.

After confirmation:

```
  Switching 2 packages to Homebrew...

  [1/2] Switching Raycast...
  ✔  Trashed local app at /Applications/Raycast.app
  ✔  Ran: brew install --cask raycast

  [2/2] Switching ripgrep...
  ✔  Removed local binary at ~/.cargo/bin/rg
  ✔  Ran: brew install ripgrep

  🎉  Successfully switched 2 apps to Homebrew management!
```

---

## 5. Architecture

### 5.1 New file: `lib/switch.ts`

Orchestrates the discovery, matching, and execution of the switch operation.

```
runSwitch(opts)
  ├── collectCandidates(opts)           → ScanCandidate[] (From lib/scan-detect.ts)
  ├── filterAlreadyManaged(candidates)  → ScanCandidate[]
  ├── matchWithHomebrew(candidates)     → SwitchPair[]    (Fetches API, uses cache, performs matching)
  ├── promptUserSelection(pairs)        → SwitchPair[]    (TUI checkbox list, default all checked)
  └── executeSwitch(selected, opts)
        └── switchOne(pair)
              ├── Backup/record original path
              ├── Uninstall/Trash local copy (MAS via `mas`, Setapp via `setapp-cli`)
              ├── Run `brew install [pair.brewMatch.token]`
              └── Restore from backup on failure
```

### 5.2 Types

```typescript
export type HomebrewMatch = {
  token: string;       // the brew formula/cask name
  type: "formula" | "cask";
  version: string;
  desc: string;
};

export type SwitchPair = {
  local: ScanCandidate;
  brewMatch: HomebrewMatch;
};
```

### 5.3 Execution: `switchOne(pair)`

Unlike `scan`, which is non-destructive, `switch` **must** remove the local installation before running `brew install`, otherwise Homebrew might complain about symlink conflicts or existing `.app` bundles in `/Applications`.

For every selected pair, `switchOne` records the original path(s) before removal so it can attempt to restore the local copy if the subsequent `brew install` fails.

- **MAS `.app` bundles:** Run `mas uninstall <id>` if the `mas` CLI is installed; otherwise prompt the user to uninstall manually via Launchpad/App Store and skip the switch.
- **Setapp `.app` bundles:** Run `setapp-cli remove "<AppName>"` if `setapp-cli` is installed; otherwise prompt the user to uninstall via the Setapp app and skip the switch.
- **Direct-download `.app` bundles:** Move the bundle to the Trash using `osascript` or a `trash` CLI helper, rather than `rm -rf`.
- **cargo binaries:** Prefer `cargo uninstall <crate>`. If Cargo is not available, move the binary to Trash.
- **go binaries:** `rm` the binary from `~/go/bin/` (Go does not have a global uninstall command).
- **npm packages:** `npm uninstall -g <name>`.
- **pip packages:** `pip uninstall -y <name>`.
- **gem packages:** `gem uninstall <name>`.
- **dotnet tools:** `dotnet tool uninstall -g <name>`.
- **mint packages:** `mint uninstall <name>`.
- **spm packages:** `rm` the binary from `~/.swiftpm/bin/`.
- **standalone binaries:** Move the binary to Trash using `osascript` or a `trash` CLI helper; do not `rm` if it can be avoided.

Once removed, execute `brew install <match.token>` or `brew install --cask <match.token>`. If the install fails, attempt to restore the local copy from the Trash/backup and log the failure clearly.

---

## 6. Registration in `bin/allbrew.ts`

```typescript
import { runSwitch } from "../lib/switch.ts";

program
  .command("switch")
  .description("Find manually installed apps that exist in Homebrew and switch them to Homebrew management")
  .option("-y, --yes", "Switch all matched apps without interactive confirmation")
  .option("--dry-run", "Print matched apps without making any changes")
  .action(async (opts) => {
    await runSwitch(opts);
  });
```

---

## 7. Tests

### Unit tests (`tests/unit/switch.test.ts`)

- `matchWithHomebrew`: Mock the Homebrew API JSON responses. Verify that normalized local names correctly map to `cask.token` or `formula.name`. Verify aliases are checked and the cache is written to `~/.config/allbrew/brew-api-cache.json`.
- `filterAlreadyManaged`: Verify that Homebrew-managed binaries inside `/usr/local/bin` or `/opt/homebrew/bin` are excluded from the generic `binaries` pass.
- `promptUserSelection`: Mock the `@inquirer/prompts` `checkbox` TUI. Verify that arrow-key navigation and space-toggle produce the expected `SwitchPair[]`, and that the default state has all matches checked.
- `executeSwitch` (dry run mode): Verify that MAS apps use `mas uninstall`, Setapp apps use `setapp-cli remove`, direct `.app` bundles are trashed, and the correct `brew install`/`brew install --cask` commands are formulated.
- `restoreOnFailure`: Verify that when `brew install` fails, the removed local file/app is restored from Trash/backup and the failure is logged.

### Integration tests (`tests/integration/switch.test.ts`)

- Test fetching from `formulae.brew.sh/api/cask.json`.
- Provide a known dummy file in a mock `/Applications` directory, mock the match, and ensure the uninstallation/trashing logic executes safely in a sandbox.

---

## 8. Edge cases and decisions

| Situation | Decision |
|-----------|----------|
| **MAS Apps** | Full switch is attempted. If the `mas` CLI is installed, run `mas uninstall <id>` before `brew install --cask <token>`. If `mas` is not installed, prompt the user to uninstall manually via Launchpad/App Store and skip the switch. |
| **Setapp Apps** | Full switch is attempted. If `setapp-cli` is installed, run `setapp-cli remove "<AppName>"` before `brew install --cask <token>`. Otherwise, prompt the user to uninstall via the Setapp app and skip the switch. |
| **Data Loss Risk** | `brew install --cask` usually doesn't overwrite `~/Library/Application Support/` data, so app settings should persist. Warn users before switching that the operation removes the local copy. |
| **Name Collisions** | A local `node` binary might match the `node` formula, but perhaps the user installed it via `nvm`. The generic `binaries` pass must skip symlinks and files inside the Homebrew prefix (`$(brew --prefix)/bin`) and known version-manager shims (`nvm`, `pyenv`, `rbenv`, `rustup`). Language-specific passes already target only their own install directories. |
| **Generic binaries pass** | Include `/usr/local/bin`, `/opt/local/bin`, and `~/.local/bin`, but only keep non-symlink executables that are not inside the Homebrew prefix and are not known version-manager shims. |
| **Failed `brew install`** | If `brew install` fails after removing the local copy, attempt to restore the local copy from the Trash/backup. If restoration is impossible, clearly log the failure so the user knows they are missing the app. |
