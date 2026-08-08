# FIX: visdom (https://github.com/fossasia/visdom)

## Case
PyPI visualization server (`pip install visdom`, console script `visdom`, listens on :8097).
README uses shell-prompt docs (`> pip install visdom`) and later documents optional `pip install plotly`.

## Agent judgment
- generator: **pip-package** / packageName: **visdom**
- service: **true** (`visdom` / Tornado server on :8097; README recommends screen/tmux)
- bin: **visdom**

## Failure (allbrew 0.0.24)
1. `PIP_INSTALL_RE` only allowed `$` as shell prompt → `> pip install visdom` did **not** match.
2. Later prose `` `pip install plotly` `` matched first → formula packaged **plotly** under name `visdom`.
3. `detectInstallMethod` took the first pip hit and ignored `preferredPackageName` (repo/`--name`), unlike npm's `pickPreferredNpmPackage`.

## Fixes (batch mode — no release)
1. **Shell prompts** — install-command regexes accept `$`, `#`, `%`, `>` before the tool.
2. **`pickPreferredPipPackage`** — collect all pip/pipx/uv/uvx candidates; when preferred name is set, require a match (do not fall back to optional deps like plotly); return local `pip install -e .` as python build when appropriate.
3. **Unit tests** for visdom-style prompt + preferred-vs-plotly.

## Validation
- Unit: new visdom/plotly cases in `tests/unit/analyzer.test.ts` pass with local fix.
- Local generate (temp tap + `CI=1 ALLBREW_NONINTERACTIVE=1`): `Detected install method: pip (visdom)`, formula url `visdom-0.2.4.tar.gz`, `service do; run opt_bin/"visdom"`.
- VM install with guest bottle 0.0.24: expected **generate wrong package (plotly)** until parent reconciles + release.

## Residual risk
- Formula may still lack vendored PyPI resources if generator skips deps for this sdist path; VM brew install may need network/resource expansion.
- `visdom --version` may start the server rather than print a version (brew `test do` fragility).
- homepage metadata on PyPI still points at facebookresearch/visdom (upstream packaging); fossasia is the active GitHub org.
