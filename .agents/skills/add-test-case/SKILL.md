---
name: add-test-case
description: Add a new app to the allbrew test case table and flow it through the project's unit and integration test suites. Use when the user asks to add an app to the allbrew test cases, catalog, or test suite.
metadata:
  version: "1.1"
---

# Add an app to the allbrew test cases

Use this workflow when the user asks to add a new app to `.agents/plans/allbrew-test-cases.md` and flow it through the test suite.

## 1. Gather app metadata

From the URL provided by the user:

- **GitHub repo**: Read the repository page and the latest release page.
- **Product website**: If the URL is a product site, capture the homepage, download link, and description.
- **In-Homebrew status**: Search `https://formulae.brew.sh/` for an existing formula or cask. Note whether it is present, deprecated, or absent.
- **Package registry**: If the app is a language-specific package, identify the canonical registry URL (PyPI, npm, crates.io, etc.) and the published CLI command name.
- **Release asset**: Identify the latest release asset name and URL (DMG, ZIP, PKG, tarball, etc.). Note whether the URL contains a version, an architecture suffix, or a `/latest/` redirect.
- **License, version, language, stars**: Capture these from the GitHub About section or README.

## 2. Determine the generator

Choose the most appropriate generator from the catalog:

- `pip-package` — Python CLI published on PyPI.
- `npm-package` — Node.js CLI published on npm.
- `cargo-package` — Rust CLI published on crates.io or installable from a GitHub repo.
- `go-package` — Go project installed via `go install`.
- `binary-release` — Prebuilt binaries attached to GitHub releases.
- `source-build` — Build from source using cmake/autotools/make/meson, or Python installed via pip from a git clone.
- `cask-app` — Direct DMG/ZIP/PKG download URL (developer CDN, GitHub `/latest/` redirect, or static file).
- `cask-app-release` — Cask generated from a GitHub repo's release assets.
- `cask-app-mas` — Mac App Store app.
- `cask-app-setapp` — Setapp subscription app (`setapp.com/apps/{slug}`).
- `install-script` — curl/bash installer script.

Prefer the registry-backed generator when a package exists. Prefer `cask-app` over `cask-app-release` when the user provides a direct asset URL.

## 3. Add the table row

Use the **`add-row.mjs` script** in this skill's directory — never raw string splitting or hand-rolled Node.js:

```bash
node .agents/skills/add-test-case/add-row.mjs \
  --app "<name>" \
  --ecosystem <python|node|ruby|rust|go|swift|dotnet|cask|other> \
  [column flags…] \
  --notes "<distinguishing facts>"
```

Run `node .agents/skills/add-test-case/add-row.mjs --help` for the full flag reference.

### Positioning

| Flag | Behaviour |
|------|-----------|
| `--ecosystem <key>` | Inserts after the **last existing row** of that ecosystem group (detected from `in_pip`, `in_npm`, `in_cargo`, `in_go_mod`, `is_cask_dist`, `lang/runtime`, etc.) |
| `--after-app <name>` | Inserts immediately after the named row |
| _(neither)_ | Appends after the last real app row |

### Column flags

| Flag | Table column |
|------|-------------|
| `--lang <value>` | `lang/runtime` |
| `--framework <value>` | `framework` |
| `--in-github <value>` | `in_github` |
| `--in-homebrew <value>` | `in_homebrew` |
| `--in-pip / --in-npm / --in-cargo / --in-go-mod / --in-ruby-gem / --in-swiftpm / --in-mint / --in-dotnet` | registry columns |
| `--in-mas / --in-setapp / --in-dev-website` | distribution columns |
| `--is-tui-app / --is-gui-app / --is-webui-app` | boolean flags → `"yes"` |
| `--is-cask-dist <filename>` | `is_cask_dist` |
| `--has-source-dist` | flag → `"yes"` |
| `--has-prebuilt-bin <value>` | `has_prebuilt_bin_dist` (e.g. `"yes"` or `"yes (4)"`) |
| `--has-script-install` | flag → `"yes"` |
| `--notes <value>` | `notes` |

Always use `--dry-run` first to preview the row before writing.

### Notes column conventions

Capture these facts when known:
- install method (generator name at the end, e.g. `pip-package`, `cask-app-release`)
- version, license, star count
- signing status for casks (`signed + notarized`, `unsigned`, `xattr -cr needed`)
- in-Homebrew status (`in HB` / `not in HB` / deprecated)
- monorepo layout, binary name mismatches, or any edge case

> **Why a script instead of inline Node.js**: Raw `split('|')` corrupts cells that contain backtick-quoted pipes (`` `cmd|flag` ``), escaped pipes (`\|`), or rows with non-uniform column counts. The parser handles all GFM edge cases correctly. The script wraps the same `scanTables` + `insertRow` + `updateCell` + `toMarkdown` pattern used in previous sessions, generalized into a reusable CLI.

## 4. Add a unit test

In `tests/unit/generators/<generator>.test.ts`:

- Add a new `describe` block for the app.
- Mock external calls (registry, SHA256, GitHub) so the test stays offline.
- Create a fixture under `tests/fixtures/<ecosystem>/` if the test needs mocked registry data (e.g., `tests/fixtures/npm/<pkg>.json`).
- Assert on the generated payload: name/class, description, version, license, download URL, livecheck, and any bin-name or override edge cases.

## 5. Add an integration test

In `tests/integration/<generator>.int.test.ts`:

- Add tests that call the real registry/API/download.
- Verify the payload is well-formed (template, name, version, SHA256).
- Render the formula/cask and assert it is structurally valid.

## 6. Optionally add a manual test-driving example

If the app is interesting to exercise end-to-end or demonstrates an edge case:

- Append a short commented example under the appropriate generator section in `.agents/plans/allbrew-test-cases.md` in the "How to drive a test" code blocks.
- Include the `allbrew` invocation and the verification command.
- Call out any notable edge case (deprecated formula, bin name mismatch, arm64-only, unsigned app, etc.).

## 7. Optionally add an E2E catalog entry

Only if the user explicitly asks for E2E coverage or says "add to the E2E catalog":

- Edit `tests/e2e/catalog.json` and append a JSON object with:
  - `name`: the Homebrew formula/cask name (kebab-case).
  - `url`: the URL the user provided or the canonical source URL.
  - `generator`: the chosen generator name.
  - `allbrewArgs`: extra CLI arguments needed for disambiguation, such as `--name`, `--app-name`, `--homepage`, `--desc`, or `--no-service`.
  - `expectedBin`: the CLI binary name, or `null` for casks.
  - `verifyCommand`: an array of strings used to verify the installation.
  - `skip`: `false` unless the user explicitly asks to skip.
  - `notes`: a concise description of the app and why it is an interesting test case.

## 8. Verify

Run the type checker and unit test suite:

```bash
bun run check
bun run test
```

Ensure all tests pass before finishing.

## 9. Summarize

Report the files changed and the generator chosen. Do not run the E2E tier unless explicitly requested.
