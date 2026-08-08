# FIX: krokiet (github.com/qarmin/czkawka — mac_ prefix assets)

## URL
https://github.com/qarmin/czkawka (slug: krokiet)

## Failure class
`generate_fail` — binary-release selected for release assets, but `matchAssetToArch` / bare-binary detection only recognized `macos`/`darwin`/`osx`, not the `mac_` platform prefix used by czkawka releases (`mac_krokiet_arm64`). Linux assets matched, so generation threw "No macOS binary assets found".

## Expected
- Generator: `binary-release`, name `krokiet`, bin `krokiet`
- Assets: `mac_krokiet_arm64` / `linux_krokiet_*` (prefer formula-name match over czkawka_cli/gui matrix)
- `service: false` (desktop GUI)

## Fixes (batch — no release)
1. **lib/utils.ts** `archPatterns`: match `(?:^|[^a-z])mac[-_].*arm64` (and intel/universal variants); bare strip includes `mac` token.
2. **lib/generators/binary-release.ts**: score assets by formula name + prefer default builds over heif/skia/all_backends variants; binName strip includes `mac`.
3. **tests/unit/utils.test.ts**: czkawka/krokiet `mac_*` fixtures.

## Validation
```bash
bun test tests/unit/utils.test.ts
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://github.com/qarmin/czkawka" --name krokiet --tap "$(mktemp -d)/t" --verbose
# → Formula with mac_krokiet_arm64 url
```

## Residual
- Guest brew allbrew lacks this fix until reconcile/release; VM install may still generate_fail on stock bottle.
- Homebrew core already ships `czkawka` (includes krokiet via cargo source).
- GUI may not print version for `test do`; bare binary install uses Dir[] rename.
- Monorepo has many frontend binaries; formula-name scoring is required.
