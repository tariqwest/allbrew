# Classifier validation summary

Generated: 2026-07-29T16:15:55.950Z
Mode: classify + HEAD on unknown

## Totals

- Locations classified: **485**
- Skipped cells: **4**
- Classifier vs oracle: **483** agree / **2** disagree
- Classifier vs agent: **483** agree / **2** disagree / **0** no judgment

## By source column

- `in_github`: 245
- `in_dev_website`: 51
- `in_pip`: 36
- `in_npm`: 32
- `has_script_install`: 27
- `in_ruby_gem`: 21
- `in_go_mod`: 20
- `in_cargo`: 18
- `seed`: 16
- `in_dotnet`: 7
- `in_setapp`: 6
- `in_mas`: 6

## By classifier type

- `github-repo`: 285
- `unknown`: 61
- `pip-package`: 36
- `npm-package`: 33
- `bash-script`: 21
- `cargo-package`: 13
- `gem-package`: 9
- `dotnet-package`: 7
- `setapp-app`: 7
- `mac-app-store`: 7
- `archive`: 4
- `cask-dmg`: 2

## Skips by reason

- `unparseable_github_or_module_path`: 1
- `script_flag_without_url`: 1
- `unparseable_script_install`: 1
- `unparseable_pypi`: 1

## Oracle mismatches (classifier type ≠ oracle type)

- **Rustup** [`has_script_install`] `https://sh.rustup.rs` → classifier=`bash-script` oracle=`unknown`
- **Devbox** [`has_script_install`] `https://get.jetify.com/devbox` → classifier=`bash-script` oracle=`unknown`

## Agent mismatches

- **Rustup** [`has_script_install`] `https://sh.rustup.rs` → classifier=`bash-script` agent=`unknown` — Bootstrapped from rule oracle — replace with independent agent judgment
- **Devbox** [`has_script_install`] `https://get.jetify.com/devbox` → classifier=`bash-script` agent=`unknown` — Bootstrapped from rule oracle — replace with independent agent judgment

## Notes

- This harness scores **classifier strategy** only (`github-repo`, `npm-package`, …), not generator selection (`binary-release`, `cask-app-release`, …).
- `in_go_mod` / GitHub-shaped `in_cargo` cells correctly classify as `github-repo`.
- `in_dev_website` bare domains typically classify as `unknown` without `--head`.
