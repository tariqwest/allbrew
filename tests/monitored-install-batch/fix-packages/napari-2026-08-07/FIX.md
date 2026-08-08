# Fix: napari GUI launcher ignores `--version`; prefer pyqt6 extra

## URL
https://pypi.org/project/napari

## Symptom
- Generator: `pip-package` (correct)
- Service: none (correct; scientific Qt viewer, not launchd)
- `brew install napari` succeeds in Lume VM (~347MB, 103+ resources, slow under load)
- Post-install verify: `BIN_HELP_FAIL` — `napari --version`/`--help`/`-h` all fail
- Formula `test do` asserts `#{bin}/napari --version`, which cannot pass

## Root cause
1. Console script is `napari = napari._main:main`. That entry always imports Qt and builds the viewer; it does not run argparse `--version` from `napari.__main__`.
2. Docs install `napari[all]` / `napari[pyqt6]`. Base requires_dist has no Qt binding (only `qtpy`). Without an extra, the launcher fails on import even harder.
3. Default pip formula test assumes CLI packages honor `--version`.

## Fix (not released; batch Option A)
In `lib/generators/pip-package.ts`:
- `KNOWN_ROOT_EXTRAS.napari = ["pyqt6"]` — activate recommended Qt extra at dep resolution (overridable via `options.extras`)
- `KNOWN_PYTHON_IMPORT_VERSION_TEST.napari = "napari"` — formula test uses:
  `#{libexec}/bin/python -c 'import napari; print(napari.__version__)'`
- Payload field `testDoBody` + template interpolation (replaces hardcoded bin --version)

Also: `lib/template-payload.ts`, `lib/templates/formula/pip-package.ts`, unit tests.

## Residual risk
- Batch `strictVerifyCmd` still probes `$NAME --version|--help|-h`. Even after formula test fix, harness may report `BIN_HELP_FAIL` until it accepts import-based probes or known GUI aliases.
- `napari[all]` is larger than `pyqt6`; we chose `pyqt6` as the minimum binding. Users wanting optional plugins should still use upstream extras.
- First VM attempt timed out (30m) under concurrent brew load; second attempt installed OK in ~45m. Heavy scientific stacks need long install budgets.
- Tap git commit/push failed in VM (noise); formula still written and installed from local tap path.

## Validation
- `bun test tests/unit/generators/pip-package.test.ts` — 62 pass (includes napari maps)
- `bun test tests/unit/templates/render.test.ts --test-name-pattern pip_package` — pass
- Live VM (pre-fix allbrew 0.0.24): install_ok, VERIFY_OK=false (BIN_HELP_FAIL), service match
