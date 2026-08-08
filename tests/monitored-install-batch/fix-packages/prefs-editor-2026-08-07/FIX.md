# FIX: prefs-editor (https://formulae.brew.sh/cask/prefs-editor)

## Failure class
**generate_fail** (wrong generator / Case C miss) → **brew_fail**

On allbrew **0.0.24** (VM bottle):

1. Classifies `https://formulae.brew.sh/cask/prefs-editor` as **`unknown`** (no `HOMEBREW_CASK_RE` in bottle).
2. Page-discover scores direct ZIP + Homebrew/homebrew-cask blob; picks **archive** ZIP.
3. Archive inspector nests **`Autoupdate.app`** instead of **`Prefs Editor.app`**.
4. Core cask name collision renames tap cask to **`prefs-editor-tap`**.
5. `brew install --cask` fails: `App source '.../Autoupdate.app' is not there.`

## Case C
Official cask already exists: `brew install --cask prefs-editor` (token `prefs-editor`, version 1.4.2, `Prefs Editor.app`, auto_updates). Prefer **homebrew-cask** mirror path — never invent a duplicate with wrong nested `.app`.

## Root cause
`homebrew-cask` classifier + generator exist on **main** but **not released**. Bottle 0.0.24 predates that feature.

Secondary product gap (archive path): nested helper app `Autoupdate.app` preferred over main `Prefs Editor.app` — only hit when Case C is missed.

## Expected
- **agent_service_expectation:** `false` (GUI `.app` cask)
- **generator:** `homebrew-cask`
- **package/app:** `prefs-editor` / `Prefs Editor.app`
- **not:** cask-app with `Autoupdate.app` / `prefs-editor-tap`

## Fix (batch mode — fix-package only, no release)
Already on HEAD:

1. **`lib/classifier.ts`**: `HOMEBREW_CASK_RE` → `{ type: 'homebrew-cask', name }`
2. **`lib/generators/homebrew-cask.ts`**: fetch official cask Ruby from homebrew/cask API + raw source
3. Wire through CLI, manifest, package-updater

Artifacts:
- `cask-prefs-editor-fixed.rb` — HEAD local generate (official cask body)
- `cask-prefs-editor-broken.rb` — bottle 0.0.24 VM output (`Autoupdate.app`)

## Validation
```bash
bun -e 'import { classify } from "./lib/classifier.ts"; console.log(classify("https://formulae.brew.sh/cask/prefs-editor"))'
# → { type: "homebrew-cask", name: "prefs-editor", ... }

CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://formulae.brew.sh/cask/prefs-editor" --name prefs-editor --tap "$(mktemp -d)" --verbose
# Classified as: homebrew-cask
# Generated: .../Casks/prefs-editor.rb  (app "Prefs Editor.app")
```

## VM (allbrew 0.0.24 bottle)
Fails as above until release/upgrade past homebrew-cask generators. Host brew install intentionally not used as success path.

## Related
Same Case C class as `devonthink-formulae-2026-08-07/`, `carbon-copy-cloner-2026-08-07/`.
