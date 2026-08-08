# Fix: PyPI BleachBit / Windows-only wheels selected on macOS

## URL
https://pypi.org/project/BleachBit

## Symptom
- Classified correctly as `pip-package`
- Service: none (correct; GUI/system cleaner, not launchd)
- Formula generated with `resource "msys2-env"` → `py3-none-win_amd64.whl`
- `brew install bleachbit` fails in Lume VM after fetch (Windows wheel unusable on macOS)

## Root cause
1. PyPI `bleachbit` is an **unofficial Windows packaging** (`Requires-Dist: msys2-env`, `winshell`; docs: `bleachbit.exe`).
2. `msys2-env` publishes **only** `*-win_amd64.whl` (no sdist).
3. `selectBestDistribution()` scored win wheels incompatible, then **fell back to `candidates[0]`**, embedding the Windows wheel as a formula resource.
4. Transitive resolution accepted that dist instead of failing generation.

## Fix (Option A; not released)
In `lib/generators/pip-package.ts`:
1. Remove last-resort `candidates[0]` fallback so platform-incompatible wheels are never selected.
2. When a dependency has published artifacts but **none** are host-compatible, throw:
   `No host-compatible distribution for required dependency "…" (package may be Windows-only…)`.
   Empty `urls` (mocks / incomplete registry rows) still skip rather than hard-fail.

Unit test: Windows-only wheel list → `selectBestDistribution` returns `null`.

## Residual risk
- Package remains unusable on macOS by design; after the fix, generate fails early with a clear error instead of a broken formula.
- Official BleachBit for macOS is a separate desktop/cask path, not this PyPI project.
- Not released; batch reconcile must merge patches.

## Validation
- `bun test tests/unit/generators/pip-package.test.ts` — 61 pass
- Live `collectPipPackagePayload("bleachbit")` throws host-compatible error for `msys2-env`
- VM pre-fix (allbrew 0.0.24): EXIT_CODE=1, VERIFY_OK=false, endpoint=homeserver
