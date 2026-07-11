# `allbrew hooks` uninstall detection — Plan

> **Goal:** Detect when allbrew-tracked apps are removed outside of Homebrew/allbrew (manual deletion, MAS/Setapp uninstall, drag-to-Trash) and automatically clean up the corresponding stale formulas, casks, and manifests.

---

## 1. Problem statement

A user can uninstall a tracked app in many ways that allbrew never sees:

- Drag an `.app` to the Trash.
- `rm -rf /Applications/SomeApp.app` from the terminal.
- Use `mas uninstall <id>` or uninstall via the Setapp app.
- Delete a language-manager binary.

After the app is gone, the user's tap still contains the `.rb` file, the manifest JSON still exists, and `allbrew update-formulas` will try to regenerate a package that no longer has an installed source. The uninstall-detection hook removes these stale files so the tap accurately reflects the system.

---

## 2. Scope

### Phase 1: `.app` bundles via macOS Folder Actions

Watch the folders that contain macOS application bundles:

| Folder | Contents |
|--------|----------|
| `/Applications` | System-wide apps |
| `~/Applications` | User-specific apps |
| `/Applications/Setapp` | Setapp-managed apps |
| `~/Applications/Setapp` | User Setapp apps |

The detection runs when an item is **removed** from one of these folders.

### Phase 2 / future work

- Language-manager binaries in `~/.cargo/bin`, `~/go/bin`, `~/.npm/bin`, etc.
- Periodic reconciliation (`allbrew hooks scan-uninstalls` or a scheduled `allbrew service` task) as a fallback for deletions that Folder Actions miss (e.g. `rm -rf` from Terminal).

---

## 3. Design principles

- **Manifests are the source of truth.** Only allbrew-tracked manifests are cleaned up.
- **Never uninstall a live app.** The hook only cleans up files; it never removes a running/installed app.
- **Do not touch Homebrew-managed packages that are not tracked by allbrew.** If there is no allbrew manifest, the hook does nothing.
- **Run async.** The Folder Action script must not block the Finder.
- **Batch and commit.** Collect all removals from a single event and commit them in one tap-git commit.

---

## 4. macOS Folder Actions approach

Use the native **Folder Actions** infrastructure (AppleScript / JavaScript for Automation) to attach a watcher script to each relevant folder.

### 4.1 Folder Action script

- **Language:** JavaScript for Automation (JXA), compiled to `.scpt` via `osacompile -l JavaScript`.
- **Location:** `~/Library/Scripts/Folder Action Scripts/allbrew-uninstall-detection.scpt`
- **Handler:** `on removing folder items from this_folder after losing these_items`
- **Behavior:**
  1. Convert each lost item to a POSIX path.
  2. Call the allbrew CLI in the background with the removed path(s).
  3. Resolve the allbrew binary path dynamically (see §4.3) — do **not** hardcode `/usr/local/bin/allbrew`.
  4. Wrap the shell invocation in a `try/catch` so Finder is never blocked by a missing or failing binary.
  5. Pass all paths from a single event as a single invocation to allow atomic deduplication inside the CLI.

```applescript
on removing folder items from this_folder after losing these_items
  try
    set allbrewCli to do shell script "cat ~/.config/allbrew/binary-path 2>/dev/null || which allbrew 2>/dev/null || echo ''"
    if allbrewCli is "" then return
    set pathArgs to ""
    repeat with anItem in these_items
      set itemPath to POSIX path of (anItem as alias)
      set pathArgs to pathArgs & " --path " & quoted form of itemPath
    end repeat
    do shell script allbrewCli & " hooks uninstall-detect" & pathArgs & " >>/tmp/allbrew-uninstall-detect.log 2>&1 &"
  end try
end removing folder items from
```

(The final implementation will use JXA for easier JSON/path handling, but the AppleScript version above shows the event model.)

### 4.3 Binary path discovery

The installed allbrew binary can live in many places (`/usr/local/bin`, `/opt/homebrew/bin`, a bun global bin, etc.). At `allbrew hooks install` time:

1. Record `process.execPath` (the running binary's absolute path) to `~/.config/allbrew/binary-path`.
2. The JXA script reads this file first; falls back to `which allbrew`; aborts silently if neither resolves.
3. `allbrew hooks uninstall` deletes `~/.config/allbrew/binary-path`.

This removes the hardcoded `/usr/local/bin/allbrew` assumption.

### 4.2 Attaching / detaching

`allbrew hooks install` will:

1. Write `process.execPath` to `~/.config/allbrew/binary-path` (see §4.3).
2. Compile the JXA script to `~/Library/Scripts/Folder Action Scripts/allbrew-uninstall-detection.scpt`.
3. For each watched folder, create a Folder Action via `osascript` and attach the script.

`allbrew hooks uninstall` will:

1. Remove the Folder Action attachments.
2. Delete the compiled `.scpt` file.
3. Delete `~/.config/allbrew/binary-path`.

### 4.4 Security hardening

Before executing the binary path read from disk, the JXA script verifies it is an absolute path beginning with `/` and is not world-writable. A path that fails validation is ignored and the script exits silently. This prevents a compromised `binary-path` file from causing arbitrary code execution under Finder's privileges.

---

## 5. CLI integration

### 5.1 New internal command

```
allbrew hooks uninstall-detect --path <path> [--path <path> ...]
```

This command is called by the Folder Action script. It is intentionally not a user-facing workflow command.

### 5.2 Update existing hook commands

- `allbrew hooks install` now installs both the brew-update wrapper and the uninstall-detection Folder Actions.
- `allbrew hooks uninstall` now removes both.

Update descriptions in `bin/allbrew.ts`:

```typescript
hooksCmd
  .command("install")
  .description("Install brew update wrapper and uninstall-detection folder actions")
  ...

hooksCmd
  .command("uninstall")
  .description("Remove brew update wrapper and uninstall-detection folder actions")
  ...
```

---

## 6. Core logic: `runUninstallDetect`

```
runUninstallDetect({ paths: string[] })
  ├── deduplicatePaths(paths)                 → deduplicate in case Folder Action fires multiple times for the same event
  ├── loadAllManifests()                      → PackageManifest[]
  ├── findManifestsForPaths(paths)            → Map<manifest, removedPath>
  ├── verifyAppIsGone(manifests)             → remove false positives (app moved to watched/system folder; OS update)
  ├── removeStaleFiles(manifests)             → delete .rb file and manifest JSON
  ├── optionallySyncBrewState(manifests)      → run brew uninstall if still recorded
  └── commitCleanup(manifests, tapPath)       → tap-git commit
```

`runUninstallDetect` must complete or time-out within a bounded duration (default 30 s). Backgrounded shell invocations from the JXA script are fire-and-forget; if the process is killed externally or times out, the next Folder Action event or a manual `allbrew hooks scan-uninstalls` will catch any missed removals.

### 6.1 Matching a removed path to a manifest

For cask manifests, match by `source.appPath` (stored at generation time) as the primary key. Fall back to deriving the path from `source.appName` + the watched folder that triggered the event only when `appPath` is absent (legacy manifests).

For example, a removed path `/Applications/Raycast.app` maps to:

- `manifest.kind === "cask"`
- `manifest.source.appPath === "/Applications/Raycast.app"`, or
- `manifest.source.appName === "Raycast"` and the trigger folder is `/Applications`.

**MAS and Setapp generators** currently store neither `appPath` nor `appName` in their source objects (`cask-app-mas` stores only `appStoreUrl`; `cask-app-setapp` stores only `setappUrl` and `appName`). Both generators must be updated to also store `appPath` at generation time so uninstall detection can match them. For `cask-app-mas`, derive `appPath` by resolving the app name returned by the MAS API against `/Applications`. For `cask-app-setapp`, derive it from the `appName` field against `/Applications/Setapp` (default) **and** record any non-default install path if Setapp is configured to install elsewhere.

**Note:** The MAS app name returned by the API may differ from the bundle name on disk. Consider also storing `bundleId` in the manifest source, which is a more stable anchor for verifying the bundle later.

### 6.2 Manifest source change

`buildManifest` must store `source.appPath` and `source.appName` for all cask generators:

| Generator | `source.appPath` | `source.appName` |
|---|---|---|
| `cask-app` | Derived from `app.install` stanza or `appName` + `/Applications` | existing `appName` |
| `cask-app-release` | Same derivation | existing `appName` |
| `cask-app-mas` | Resolved at generation time from MAS app name + `/Applications` | App name from MAS API |
| `cask-app-setapp` | Resolved at generation time from `appName` + Setapp install dir | existing `appName` |

**Setapp custom install path:** `setapp-bootstrap.ts` already knows the Setapp install directory. Pass it through to the manifest source so `appPath` is accurate when Setapp is installed to a non-default location.

### 6.3 Cleanup actions

For each matched manifest:

1. Resolve the `.rb` file path:
   - `Formula/<manifest.name>.rb` for formulas
   - `Casks/<manifest.name>.rb` for casks
2. Delete the `.rb` file from the tap.
3. Delete the manifest JSON from `~/.config/allbrew/packages/<name>.json`.
4. If `brew list` still reports the package as installed, run `brew uninstall --cask <token>` or `brew uninstall <formula>` to keep Homebrew's state in sync.
5. Collect all deletions and commit once:

   ```
   allbrew hooks: remove stale <name1>, <name2> after uninstall
   ```

---

## 7. New files

| File | Role |
|------|------|
| `lib/hooks-uninstall-detect.ts` | `runUninstallDetect`, `findManifestsForPaths`, `removeStaleFiles`, `commitCleanup` |
| `lib/folder-actions.ts` | Generate JXA script, compile with `osacompile`, attach/detach Folder Actions; write/delete `~/.config/allbrew/binary-path` |
| `lib/brew-hooks.ts` (updated) | `installBrewHooks` and `uninstallBrewHooks` now also call `folder-actions.ts` |
| `bin/allbrew.ts` (updated) | Add `allbrew hooks uninstall-detect` command; update `install`/`uninstall` descriptions |
| `lib/build-manifest.ts` (updated) | Store `source.appPath` and `source.appName` for all four cask generators |

---

## 8. Tests

### Unit tests (`tests/unit/hooks-uninstall-detect.test.ts`)

- `findManifestsForPaths` matches a removed `/Applications/Raycast.app` to a manifest with `source.appPath`.
- `findManifestsForPaths` matches by `source.appName` when `appPath` is missing (legacy manifest).
- `findManifestsForPaths` matches a `cask-app-mas` manifest using `source.appPath` derived from the MAS app name.
- `findManifestsForPaths` matches a `cask-app-setapp` manifest using `source.appPath` derived from a non-default Setapp install directory.
- `findManifestsForPaths` ignores a removed app that is not tracked.
- `deduplicatePaths` collapses duplicate paths from repeated Folder Action events.
- `verifyAppIsGone` removes false positives when the app was moved to another watched folder.
- `verifyAppIsGone` skips cleanup when the app is found at a system path (e.g., moved during an OS update rather than deleted by the user).
- `removeStaleFiles` does not clean up a partially-removed bundle where the `.app` directory still exists but `Contents/MacOS` is missing — it should treat partial bundles as still present.
- `removeStaleFiles` deletes the correct `.rb` file and manifest JSON.
- `commitCleanup` calls `tap-git` with a single batch message.
- `runUninstallDetect` runs `brew uninstall` only when the package is still recorded as installed.

### Integration tests (`tests/integration/hooks-uninstall-detect.test.ts`)

- Compile a temporary JXA script and attach it to a temp folder.
- Remove a fake `.app` from the temp folder.
- Verify the script triggers the `uninstall-detect` flow (mocked) and the stale `.rb`/manifest are removed.

---

## 9. Edge cases and decisions

| Situation | Decision |
|-----------|----------|
| Manual deletion of `.app` in `/Applications` | Folder Action fires, allbrew cleans up the cask and manifest. |
| `brew uninstall --cask` | The app is removed, so the Folder Action also fires. If Homebrew no longer lists the cask, just delete the cask file and manifest. If Homebrew still lists it, run `brew uninstall` first. |
| App moved to another watched folder | Treat as removal in the source folder. `verifyAppIsGone` checks all watched folders; if found elsewhere, update `manifest.source.appPath` instead of deleting. |
| App moved to an unwatched folder (e.g., `/tmp`) | Folder Action treats it as deleted. `verifyAppIsGone` will confirm it is gone and clean up. The user can re-scan if they want to track it again. |
| App moved by an OS update or system process | `verifyAppIsGone` checks for the bundle at common system paths (`/System/Applications`, `/System/Library`). If found there, skip cleanup and log a warning rather than deleting the manifest. |
| Removal via Terminal `rm` | Folder Actions rely on Finder events; this may not trigger. Document the limitation; fallback is manual `allbrew hooks scan-uninstalls` or periodic `allbrew service`. |
| Partial app removal (`.app` dir exists but `Contents/MacOS` is absent) | Treat the bundle as still present. `verifyAppIsGone` checks for `<path>/Contents/MacOS` as a proxy for a valid bundle. Do not clean up. |
| Multiple manifests for the same app | Use `manifest.name` (token) and `appPath` to disambiguate. |
| Duplicate Folder Action events for the same removal | `deduplicatePaths` collapses duplicates before any manifest lookup, so each removal is processed at most once per invocation. |
| Setapp installed to a non-default location | `source.appPath` recorded at generation time reflects the actual path. No watched-folder assumptions needed at detection time. |
| allbrew binary not found or moved | JXA script falls back to `which allbrew`; if neither resolves, the event is silently skipped. The next `allbrew hooks install` re-records the binary path. |
| User deletes the app but wants to keep the formula | Not supported. Re-running `allbrew <url>` will recreate it. |
| Folder Actions are disabled by the user | `allbrew hooks install` will fail to attach. Show a warning and suggest using `allbrew service` as a fallback. |
| Uninstall detection triggered while allbrew is running | The CLI runs in a separate process, so it is safe. |
| Folder Action fails to attach or is partially attached | Report per-folder success/failure; warn the user and suggest `allbrew service` as fallback. Running `allbrew hooks install` again should be idempotent and not create duplicate attachments. |
| Formula manifest matched during `.app` path cleanup | `findManifestsForPaths` should only match cask manifests when the removed item is an `.app` bundle. Formula cleanup in Phase 2 will use binary-path matching, not `appPath`. |
| `brew uninstall` ordering | Run `brew uninstall --cask <token>` / `brew uninstall <formula>` **before** deleting the `.rb` file. Deleting the file first can leave Homebrew in a confused state where the package is still listed but its formula is missing. |

---

## 10. Open questions / notes

1. **Resolved — `brew uninstall` ordering:** Run `brew uninstall` first, then delete the `.rb` file and manifest.
2. Should `allbrew hooks install` be split into subcommands (`install-update-hooks` / `install-uninstall-detection`) so users can opt into only one?
3. Should Phase 2 add Folder Actions for language-manager bin directories, or is a periodic `scan-uninstalls` command a better approach?
4. **New consideration:** For MAS/Setapp manifests, should we also record `bundleId` in `source`? The bundle ID is a stronger anchor than display name when deriving or verifying `appPath`.
