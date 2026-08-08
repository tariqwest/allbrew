# Fix: pnpm standalone installer (`https://get.pnpm.io/install.sh`)

## Failure class
`brew_fail` (bad generator selection) + **Case C** (prefer homebrew/core)

## Symptom
`allbrew https://get.pnpm.io/install.sh` classifies as `bash-script` and emits an `install-script` formula (`pnpm-tap` after core collision):

- `url` is the installer shell script itself, `version "0.0.1"`
- `install` runs `bash install.sh` with `PREFIX`/`HOME` env overrides
- Official installer ignores Homebrew prefix and runs `pnpm setup --force` into user dirs (`~/.local` / PNPM_HOME)
- `bin.install Dir[buildpath/"bin/*"]` finds nothing → empty Cellar bin / test fails

## Root cause
1. `.sh` path always wins as `bash-script` before any registry-aware routing.
2. The get.pnpm.io installer is a **user-home** standalone binary installer (downloads GitHub release SEA, runs `pnpm setup`), not a PREFIX-respecting package script.
3. Official docs document **Homebrew** (`brew install pnpm`), npm, Corepack, winget, etc. Core formula is healthy (npm-based bottle, high analytics).

## Fix (batch mode — fix-package only, no release)
In `lib/classifier.ts`:
1. Add `KNOWN_NPM_INSTALLER_HOSTS` map: `get.pnpm.io` → package `pnpm`.
2. Before script-extension classification, return `{ type: 'npm-package', packageName: 'pnpm', via: 'known-installer-host' }`.

Unit test covers the host mapping.

## Validation (local worktree)
```bash
bun test tests/unit/classifier.test.ts  # 27 pass including get.pnpm.io
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://get.pnpm.io/install.sh" --name pnpm --tap "$(mktemp -d)" --verbose
# → Classified as: npm-package
# → Formula name collides with homebrew/core; uses pnpm-tap
# → Generates npm_package formula (depends_on node, std_npm_args, no service)
```

Host `brew install pnpm-tap` may fail `brew link` if core `pnpm` is already linked (binary name collision) — expected on developer machines that already have core pnpm.

## Service expectation
`service: false` — pnpm is a package-manager CLI (install/add/run), not a long-running daemon. Match: no `service do` block.

## Case C note
`homebrew/core` has healthy bottled `pnpm` 11.x. Official docs list `brew install pnpm`. Prefer core for users; allbrew-generated `pnpm-tap` is a valid alternate npm packaging when a tap-owned formula is still desired.

## Residual risk
- Until released, VM still runs install-script path on allbrew 0.0.24.
- Core name collision → `pnpm-tap` confuses users who expect `pnpm`.
- Linking fails if core `pnpm` already installed (conflicts on `pnpm`/`pnpx` bins).
