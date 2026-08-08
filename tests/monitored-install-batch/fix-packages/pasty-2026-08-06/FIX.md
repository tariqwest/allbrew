# FIX: pasty (https://pasty.dev)

## Failure class
**brew_fail** — generated cask omitted `version`, so Homebrew crashed with:
`undefined method 'latest?' for nil` in `Cask::Upgrade.outdated_casks`.

## Root cause
Page-discover correctly resolves the homepage download to
`https://github.com/JordanH22/pasty/releases/latest/download/Pasty.dmg`.
`collectCaskAppPayload` only extracted versions from URL path digits; `/latest/`
has none → empty `versionLine` → invalid cask.

## Expected
- Generator: `cask-app` (homepage → static discover → cask-dmg)
- App: `Pasty.app` (native Swift clipboard manager GUI)
- **service: false** (cask / menu-bar app, not brew services)
- `version` must always be present (`"x.y.z"` or `:latest`)

## Fix (batch mode — fix-package only, no release)
`lib/generators/cask-app.ts`:
1. `resolveCaskVersion()` — option → URL path → GitHub latest release tag API
2. Fallback `version :latest` when still unknown (never omit stanza)
3. Strip `.app` from cask `name` display field

Unit tests updated: empty `versionLine` expectations → `:latest`; added Pasty case.

## Validation
```bash
bun test tests/unit/generators/cask-app.test.ts   # 64 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://pasty.dev" --name pasty --tap "$(mktemp -d)" --verbose
# cask contains: version "3.7.3" (from GitHub latest tag v3.7.3)
# host brew install --cask succeeded with local source (then uninstalled)
```

## VM (allbrew 0.0.24 bottle)
Still fails until fix is released/upgraded in VM: same nil version path.
