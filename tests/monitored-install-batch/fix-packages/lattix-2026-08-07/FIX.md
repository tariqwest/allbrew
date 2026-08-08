# FIX: lattix (https://lattix.app)

## Case
Catalog URL for **Lattix** — macOS GUI workspace/resource launcher. Marketing site `https://lattix.app` → `https://www.lattix.app/`. Direct download:

`https://github.com/Abjcodes/Lattix-releases/releases/download/prod/Lattix.dmg`

DMG contains `Lattix.app` (`CFBundleShortVersionString` **2.0.0**, min macOS 14).

## Phase 0.5 judgment
| Field | Value |
|-------|--------|
| inputShape | homepage-url (`lattix.app`) |
| expected.generator | `cask-app` via page-discover → `cask-dmg` |
| expected.app | `Lattix` / `Lattix.app` |
| service | **false** (GUI cask; menubar app, not brew services) |

## Failures observed

### A. Bottle `allbrew` 0.0.24 (VM homeserver `vm-install-one.mjs`)
1. Classified `unknown` → static discovery picks DMG score 150 (correct).
2. Generates `Casks/lattix.rb` **without** a `version` stanza (unversioned `/prod/Lattix.dmg` path; released generator only sets `versionLine` when `extractVersionFromUrl` hits).
3. `brew install --cask` crashes:
   ```
   Error: undefined method 'latest?' for nil
   /opt/homebrew/Library/Homebrew/cask/upgrade.rb:67
   ```
4. **VERIFY_OK=false** EXIT_CODE=1.

### B. Local worktree (`CI=1 ALLBREW_NONINTERACTIVE=1` + temp tap)
1. Same discovery path.
2. Always-emits `version "1.0.0"` (fallback when URL/filename have no semver).
3. Generate OK; host auto-install of cask succeeds (not isolation success). App path `Lattix.app` present.

### C. Local Lume endpoints
`local-1` / `local-2`: SSH unavailable → cannot acquire `/opt/homebrew` sparsebundle (infra).

## Root cause
**Missing cask `version` on unversioned DMG URLs.** Homebrew 4+/6 install path calls `outdated_casks` and invokes `latest?` on a nil version → hard failure. Product bug in released `collectCaskAppPayload` (omit `versionLine` when no URL version).

Secondary quality: fallback `"1.0.0"` is not CFBundleShortVersionString `2.0.0`; livecheck on unversioned GitHub asset URL is weak. Prefer future plist version extraction while mounting for `listDmgAppNames`.

## Fix status (batch mode — Option A fix-package, no release)
| Layer | Action |
|-------|--------|
| Product code | Worktree already: `lib/generators/cask-app.ts` always emits `version` (header / URL / compact filename / **`"1.0.0"`** fallback). Unit tests assert non-empty `versionLine` containing `1.0.0` for unversioned DMGs. |
| Patch artifact | `patches/cask-app-always-version.patch` (worktree vs HEAD at time of run) |
| Catalog URL | Keep `https://lattix.app` (healthy; DMG discoverable) |
| Release | **Not** performed (batch isolation: Option A only) |

## Validation
```bash
# Local generate (expect version line + Lattix.app)
TMP=$(mktemp -d); mkdir -p "$TMP/Casks" "$TMP/Formula"
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://lattix.app" --name lattix --tap "$TMP" --verbose
rg 'version |app ' "$TMP/Casks/lattix.rb"
# → version "1.0.0" ; app "Lattix.app"

# Bottle VM (expect fail until release with always-version)
LUME_REMOTE_ENABLED=true bun tests/monitored-install-batch/vm-install-one.mjs \
  --url "https://lattix.app" --name lattix --endpoint homeserver
# → brew install: undefined method 'latest?' for nil
```

## Residual risk
- Batch row stays red on **bottle** until always-version ships and VM upgraded.
- `version "1.0.0"` may diverge from real `2.0.0` until plist extraction lands.
- Unversioned `prod/Lattix.dmg` livecheck may never find a newer version string in headers.
- Host auto-install still runs after temp-tap generate (isolation: treat host install as pollution; uninstall after debug).
