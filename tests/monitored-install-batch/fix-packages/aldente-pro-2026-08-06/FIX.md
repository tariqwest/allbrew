# FIX: aldente-pro (https://apphousekitchen.com)

## Failure class
**generate_fail / brew_fail** — multi-product vendor homepage classified `unknown`; page-discover auto-picked **Leftovers Mac App Store** over same-site **AlDente.pkg**, generating a wrong MAS cask (`mas install 6746164364`) that fails with `Protocol "macappstore" not supported`.

## Root cause
1. AppHouseKitchen homepage is multi-product (AlDente + Leftovers + Snack Bar). Assignment is AlDente Pro (macOS battery charge-limiter GUI).
2. Scoring: MAS got `90 + trusted-host 15 = 105`; same-site `AlDente.pkg` scored as generic archive `70 + same-site 12 = 82` (`.pkg` not treated as mac installer; no name-hint ranking).
3. Non-interactive discovery auto-resolved to Leftovers MAS → wrong product for `--name aldente-pro`.
4. Official Homebrew cask `aldente` already exists (versioned DMG + Sparkle livecheck); allbrew did not offer core path from bare homepage (no `brew install` string on page).

## Agent judgment
| Field | Expected |
|-------|----------|
| generator | `cask-app` (direct DMG/PKG) |
| app | `AlDente.app` |
| service | **false** (GUI menubar; helper is privileged install inside app, not formula service) |
| package | AlDente / aldente-pro |

## Fix (batch mode — fix-package only, no release)
`lib/page-discover.ts`:
- Score `.pkg` as mac installer (base 100 + mac-hint); `guessKind` → `cask-dmg`
- `rankCandidatesForPage` / `nameHintTokens`: demote storefronts when direct installers exist; boost path tokens matching `--name`
- `DiscoverOptions.preferredName`

`lib/classifier.ts`:
- `.pkg` → `cask-dmg`; HEAD `application/vnd.apple.installer`

`lib/cli.ts`:
- Pass `preferredName` from `opts.name` / package / appName into discovery

Tests: `rankCandidatesForPage / mac pkg vs MAS` in `page-discover.test.ts` (19 pass).

## Validation
```bash
bun test tests/unit/page-discover.test.ts   # 19 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://apphousekitchen.com" --name aldente-pro --tap "$(mktemp -d)" --verbose
# resolves: cask-dmg → https://apphousekitchen.com/aldente/AlDente.pkg
```

VM: first attempt failed `env_fail` (Homebrew lock held on local-1). Bottle without fix still picks MAS.

## Residual risk
- Generated pkg cask uses placeholder `uninstall pkgutil: "com.example.aldente-pro"` (generator gap vs real `com.apphousekitchen.aldente-pro`).
- Versionless unversioned `AlDente.pkg` URL vs core cask versioned `AlDente#{version}.dmg` + Sparkle.
- Prefer documenting/core cask `brew install --cask aldente` when healthy upstream exists.
- Helper launchctl present in app; not a formula `service` block.
