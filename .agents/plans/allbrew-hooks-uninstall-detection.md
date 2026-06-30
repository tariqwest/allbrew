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
- Periodic reconciliation (`allbrew hooks scan-uninstalls`) as a fallback for deletions that Folder Actions miss.

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
  3. Use the absolute path to the allbrew binary recorded at install time so Finder's minimal `PATH` is not a problem.

```applescript
on removing folder items from this_folder after losing these_items
  tell application "Finder"
    set allbrewCli to "/usr/local/bin/allbrew" -- recorded at install time
    repeat with anItem in these_items
      set itemPath to POSIX path of (anItem as alias)
      do shell script allbrewCli & " hooks uninstall-detect --path " & quoted form of itemPath & " >/dev/null 2>&1 &"
    end repeat
  end tell
end removing folder items from
```

(The final implementation will use JXA for easier JSON/path handling, but the AppleScript version above shows the event model.)

### 4.2 Attaching / detaching

`allbrew hooks install` will:

1. Compile the JXA script to `~/Library/Scripts/Folder Action Scripts/allbrew-uninstall-detection.scpt`.
2. For each watched folder, create a Folder Action via `osascript` and attach the script.

`allbrew hooks uninstall` will:

1. Remove the Folder Action attachments.
2. Delete the compiled `.scpt` file.

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
  ├── loadAllManifests()                      → PackageManifest[]
  ├── findManifestsForPaths(paths)            → Map<manifest, removedPath>
  ├── verifyAppIsGone(manifests)             → remove any false positives (e.g., app moved to another watched folder)
  ├── removeStaleFiles(manifests)             → delete .rb file and manifest JSON
  ├── optionallySyncBrewState(manifests)      → run brew uninstall if still recorded
  └── commitCleanup(manifests, tapPath)       → tap-git commit
```

### 6.1 Matching a removed path to a manifest

For cask manifests, match by `source.appPath` (stored at generation time) or by deriving the path from `source.appName` + the watched folder that triggered the event.

For example, a removed path `/Applications/Raycast.app` maps to:

- `manifest.kind === "cask"`
- `manifest.source.appPath === "/Applications/Raycast.app"`, or
- `manifest.source.appName === "Raycast"` and the trigger folder is `/Applications`.

### 6.2 Manifest source change

`buildManifest` must store `source.appPath` for all cask generators:

- `cask-app`
- `cask-app-release`
- `cask-app-mas`
- `cask-app-setapp`

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
| `lib/folder-actions.ts` | Generate JXA script, compile with `osacompile`, attach/detach Folder Actions |
| `lib/brew-hooks.ts` (updated) | `installBrewHooks` and `uninstallBrewHooks` now also call `folder-actions.ts` |
| `bin/allbrew.ts` (updated) | Add `allbrew hooks uninstall-detect` command; update `install`/`uninstall` descriptions |
| `lib/build-manifest.ts` (updated) | Store `source.appPath` for cask generators |

---

## 8. Tests

### Unit tests (`tests/unit/hooks-uninstall-detect.test.ts`)

- `findManifestsForPaths` matches a removed `/Applications/Raycast.app` to a manifest with `source.appPath`.
- `findManifestsForPaths` matches by `source.appName` when `appPath` is missing.
- `findManifestsForPaths` ignores a removed app that is not tracked.
- `verifyAppIsGone` removes false positives when the app was moved to another watched folder.
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
| Removal via Terminal `rm` | Folder Actions rely on Finder events; this may not trigger. Document the limitation; fallback is manual `allbrew hooks scan-uninstalls` or periodic `allbrew service`. |
| Multiple manifests for the same app | Use `manifest.name` (token) and `appPath` to disambiguate. |
| User deletes the app but wants to keep the formula | Not supported. Re-running `allbrew <url>` will recreate it. |
| Folder Actions are disabled by the user | `allbrew hooks install` will fail to attach. Show a warning and suggest using `allbrew service` as a fallback. |
| Uninstall detection triggered while allbrew is running | The CLI runs in a separate process, so it is safe. |

---

## 10. Open questions

1. Should we run `brew uninstall` before deleting the cask file, or only delete the file and let the user run `brew uninstall` manually?
2. Should `allbrew hooks install` be split into subcommands (`install-update-hooks` / `install-uninstall-detection`) so users can opt into only one?
3. Should Phase 2 add Folder Actions for language-manager bin directories, or is a periodic `scan-uninstalls` command a better approach?
