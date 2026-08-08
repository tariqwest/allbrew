# Fix: Orange3 pip console-script is `orange-canvas`, not `orange3`

## URL
https://pypi.org/project/Orange3

## Symptom
- Generator: `pip-package` (correct)
- `brew install orange3` succeeds in Lume VM
- Service: none (correct; Orange Canvas is a desktop GUI, not launchd)
- Post-install verify fails: `BIN_MISSING` because batch `strictVerify` probes binary `orange3`
- Formula `test do` asserts `#{bin}/orange3 --version`, but the installed console script is **`orange-canvas`**

## Root cause
`collectPipPackagePayload` sets `testBinName` from `options.binName`, then `KNOWN_BIN_NAMES[normalizePackageName(packageName)]`, else formula `name`.

PyPI package **Orange3** installs console script **`orange-canvas`** (and `python -m Orange.canvas`). There was no alias in `KNOWN_BIN_NAMES`, so test + verification assume `orange3`.

## Fix
Add to `KNOWN_BIN_NAMES` in `lib/generators/pip-package.ts`:

```ts
orange3: "orange-canvas",
```

Unit test asserts map entry for `orange3` and `normalizePackageName("Orange3")`.

## Residual risk
- Batch `strictVerifyCmd` still probes `command -v $NAME` (`orange3`). After this fix, formula tests use `orange-canvas`, but harness verify remains package-token-centric until it accepts known bin aliases or discovers linked scripts under `bin/`.
- Orange3 is a heavy scientific/Qt stack; install time/size is large; GUI cannot fully smoke-test headless.
- Prefer durable follow-up: derive console_scripts from wheel METADATA instead of only a static map.

## Validation
- `bun test tests/unit/generators/pip-package.test.ts --test-name-pattern "orange3|shell-gpt binary"`
- Live: `collectPipPackagePayload("Orange3")` → `testBinName === "orange-canvas"`, empty service block
- VM: install_ok, VERIFY_OK=false (BIN_MISSING) before fix; re-verify after release would still need harness bin awareness for full green
