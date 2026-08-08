# Fix: Poetry official installer URL (`https://install.python-poetry.org`)

## Failure class
`generate_fail`

## Symptom
`allbrew https://install.python-poetry.org` classifies as `unknown`. Non-interactive page discovery finds `https://pypi.org/pypi/poetry/json` but leaves it `unknown` (score 25), then throws:

```
Unable to automatically handle URL (non-interactive): https://install.python-poetry.org
```

## Root cause
1. The official Poetry installer is a **Python** script (`#!/usr/bin/env python3`, `Content-Disposition: install-poetry.py`), not a `.sh` bash script. `classify` / `classifyWithHead` only recognize shellscript content-types and `.sh`/`.bash` paths.
2. Extensionless installer hosts (e.g. `install.python-poetry.org`) fall through to `unknown`.
3. PyPI JSON API URLs (`pypi.org/pypi/<name>/json`) were not classified as `pip-package` (only `/project/<name>` was).

Running the raw installer as an `install-script` formula would also be wrong: it installs into `~/Library/Application Support/pypoetry` and ignores Homebrew `PREFIX`. The correct product path is a **pip-package** formula for PyPI `poetry` (or prefer homebrew/core `poetry` when healthy).

## Fix (batch mode — fix-package only, no release)
In `lib/classifier.ts`:
1. Map known installer host `install.python-poetry.org` → `{ type: 'pip-package', packageName: 'poetry' }`.
2. Classify `pypi.org/pypi/<name>/json` (and related API shapes) as `pip-package`.
3. Optional HEAD/GET probe: text/plain or `.py` disposition + poetry installer body → `pip-package` poetry.

Unit tests cover host mapping and PyPI JSON API.

## Validation (local worktree)
```bash
bun test tests/unit/classifier.test.ts  # 29 pass
CI=1 ALLBREW_NONINTERACTIVE=1 bun run bin/allbrew.ts \
  "https://install.python-poetry.org" --name poetry --tap "$(mktemp -d)" --verbose
# → Classified as: pip-package
# → Formula name collides with homebrew/core; uses poetry-tap
# → Generates pip_package formula (no service block)
```

## Service expectation
`service: false` — Poetry is a one-shot CLI (dependency management / packaging), not a long-running daemon. Generated formula has no `service do` block (match).

## Case C note
`homebrew/core` has healthy bottled `poetry` 2.4.1. Official docs recommend **pipx** then the official installer, **not** `brew install poetry`. After this fix, allbrew renames the generated formula to `poetry-tap` due to core collision. Prefer documenting that users should `brew install poetry` from core when they want Homebrew management; allbrew-generated `poetry-tap` is a valid alternate packaging of the same PyPI package.

## Residual risk
- VM retry still fails until fix is released/reconciled into brew-installed allbrew (0.0.24).
- Core name collision → `poetry-tap` may confuse users who expect `poetry`.
- Large pip resource tree (transitive wheels) can make brew install slow; core formula may be better maintained.
