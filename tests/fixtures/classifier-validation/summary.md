# Classifier validation summary

Generated: 2026-07-31T17:10:03.438Z
Mode: classify (offline)

## Totals

- Locations classified: **487**
- Skipped cells: **5**
- Classifier vs **manual ground truth**: **476** agree / **11** disagree
- Classifier vs rule oracle: **487** agree / **0** disagree
- Classifier vs agent: **485** agree / **0** disagree / **2** no judgment

## Ground-truth basis mix

- `url-shape`: 424
- `column`: 50
- `column+url`: 8
- `override`: 5

## By source column

- `in_github`: 247
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

- `github-repo`: 287
- `unknown`: 63
- `pip-package`: 36
- `npm-package`: 33
- `bash-script`: 19
- `cargo-package`: 13
- `gem-package`: 9
- `dotnet-package`: 7
- `setapp-app`: 7
- `mac-app-store`: 7
- `archive`: 4
- `cask-dmg`: 2

## Skips by reason

- `script_flag_without_url`: 2
- `unparseable_github_or_module_path`: 1
- `unparseable_script_install`: 1
- `unparseable_pypi`: 1

## Ground-truth mismatches (classifier type ≠ manual expected type)

By column:

- `has_script_install`: 11

- **Docker Desktop** [`has_script_install`] `https://get.docker.com` → classifier=`unknown` ground_truth=`bash-script` (override: Docker convenience script install URL (curl|bash), even without .sh extension.)
- **Rustup** [`has_script_install`] `https://sh.rustup.rs` → classifier=`unknown` ground_truth=`bash-script` (override: Official Rustup installer endpoint; has_script_install column and serves a shell script (extensionless host).)
- **Bun** [`has_script_install`] `https://bun.sh/install` → classifier=`unknown` ground_truth=`bash-script` (column+url: has_script_install URLs are install scripts (extension optional))
- **Devbox** [`has_script_install`] `https://get.jetify.com/devbox` → classifier=`unknown` ground_truth=`bash-script` (override: Devbox install endpoint advertised as curl|bash; extensionless installer host.)
- **Mise** [`has_script_install`] `https://mise.run` → classifier=`unknown` ground_truth=`bash-script` (column+url: has_script_install URLs are install scripts (extension optional))
- **Poetry** [`has_script_install`] `https://install.python-poetry.org` → classifier=`unknown` ground_truth=`bash-script` (column+url: has_script_install URLs are install scripts (extension optional))
- **Atuin** [`has_script_install`] `https://setup.atuin.sh` → classifier=`unknown` ground_truth=`bash-script` (column+url: has_script_install URLs are install scripts (extension optional))
- **Nix** [`has_script_install`] `https://nixos.org/nix/install` → classifier=`unknown` ground_truth=`bash-script` (column+url: has_script_install URLs are install scripts (extension optional))
- **SDKMAN!** [`has_script_install`] `https://get.sdkman.io` → classifier=`unknown` ground_truth=`bash-script` (column+url: has_script_install URLs are install scripts (extension optional))
- **croc** [`has_script_install`] `https://getcroc.schollz.com` → classifier=`unknown` ground_truth=`bash-script` (column+url: has_script_install URLs are install scripts (extension optional))
- **Zellij** [`has_script_install`] `https://zellij.dev/launch` → classifier=`unknown` ground_truth=`bash-script` (column+url: has_script_install URLs are install scripts (extension optional))

## Oracle mismatches (classifier type ≠ oracle type)

_none_

## Agent mismatches

_none_

## Notes

- **Manual ground truth** = column priors + URL-shape + `ground-truth-overrides.json`. It is independent of the rule oracle.
- This harness scores **classifier strategy** only (`github-repo`, `npm-package`, …), not generator selection (`binary-release`, `cask-app-release`, …).
- `in_go_mod` / GitHub-shaped `in_cargo` cells correctly classify as `github-repo`.
- `has_script_install` extensionless hosts (e.g. rustup) are expected `bash-script` by ground truth; offline `classify` may still return `unknown` until HEAD or host allowlists land.
- `in_dev_website` bare domains typically classify as `unknown` without `--head` / discovery.
