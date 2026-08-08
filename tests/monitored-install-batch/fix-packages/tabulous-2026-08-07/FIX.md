# Fix: tabulous requires Qt binding extra; GUI import-time fail

## URL
https://github.com/hanjinliu/tabulous

## Symptom
- Generator: `pip-package` (correct for PyPI table viewer)
- Service: none (correct; interactive Qt GUI, not launchd)
- Local generate + host `brew install` wrote/installed formula `tabulous` 0.5.8
- Binary fails at import: `qtpy.QtBindingsNotFoundError: No Qt bindings could be found`
- README install path is `pip install tabulous[all]` / `tabulous[pyqt5]` / `tabulous[pyqt6]`
- Base `requires_dist` has `qtpy` only — no PyQt/PySide

## Isolation / env
- Required VM path (`vm-install-one` homeserver): sparsebundle attach check failed (`hdiutil attach did not mount at /opt/homebrew` despite attach listing mountpoint)
- local-1/local-2: SSH not available on VMs
- Host install is **not** counted as isolation success; used only as evidence of product verify failure

## Root cause
1. Root extras not activated: `resolveTransitiveDeps(..., activeExtras=[])` skips `extra == "pyqt5"` deps.
2. Console script `tabulous = tabulous.__main__:main` imports Qt stack at startup (same class of GUI as napari).
3. Default formula `test do` `bin --version` cannot pass without bindings; even with bindings may be GUI-heavy.

## Fix (Option A; not released)
In `lib/generators/pip-package.ts` (same pattern as `fix-packages/napari-2026-08-07`):
- `KNOWN_ROOT_EXTRAS.tabulous = ["pyqt5"]` (README primary; pyqt6 alternative)
- Wire `options.extras || KNOWN_ROOT_EXTRAS[pkg]` into `resolveTransitiveDeps` root call
- `KNOWN_PYTHON_IMPORT_VERSION_TEST.tabulous = "tabulous"` + `testDoBody` for import-based test
- Template/`PipPackagePayload` support for `testDoBody` if not already merged from napari package

Also: unit coverage for extras activation + import test body.

## Residual risk
- VM env_fail must be fixed separately before isolation verify can pass
- PyQt5 wheel size increases formula; `pyqt6` optional alternate
- Harness `strictVerifyCmd` still may probe `--version`/`--help` on GUI bins
- Full license text in `license "..."` stanza is a separate warn (guessLicenseIdentifier)

## Validation
- Not re-run on VM (env_fail)
- Host evidence: pre-fix bin fails QtBindingsNotFoundError
