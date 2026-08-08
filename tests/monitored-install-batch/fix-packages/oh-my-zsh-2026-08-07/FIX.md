# Fix: Oh My Zsh (`https://github.com/ohmyzsh/ohmyzsh`) — fail closed

## Failure class
`brew_fail` (product should be **unsupported** / fail closed before generate)

## Symptom
`allbrew https://github.com/ohmyzsh/ohmyzsh --name oh-my-zsh` classifies as `github-repo`, detects README install method **script** (`tools/install.sh`), generates an `install_script` formula, then `brew install` fails or produces a Cellar package with **no usable binary**.

Generated formula (allbrew 0.0.24):

```ruby
url "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh"
version "0.0.1"
def install
  ENV["PREFIX"] = prefix.to_s
  ENV["DESTDIR"] = prefix.to_s
  ENV["HOME"] = buildpath.to_s
  system "bash", cached_download.to_s
  bin.install Dir[buildpath/"bin/*"] if (buildpath/"bin").exist?
end
test do
  assert_match version.to_s, shell_output("#{bin}/oh-my-zsh --version")
end
```

## Independent judgment (Phase 0.5)
Oh My Zsh is a **zsh configuration framework**, not a Cellar CLI:

| Signal | Detail |
|--------|--------|
| Install target | `~/.oh-my-zsh` (or `$ZSH`), not `$PREFIX` |
| Side effects | Rewrites `~/.zshrc`, optional `chsh` |
| Binary | No standalone `oh-my-zsh` CLI; `omz` is shell-function/wrapper after framework load |
| Updates | In-tree `omz update` / git pull, not livecheck on install.sh |
| Service | **false** — not a daemon |

Official install:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

Packaging as a standard Homebrew formula is **inappropriate**. Prefer **fail closed** with a clear message over a broken install-script formula.

## Root cause
1. README advertises `curl|sh` → `detectInstallMethod` returns `script` + install.sh URL.
2. `install-script` generator assumes scripts honor `PREFIX`/`DESTDIR` and drop a binary under `$HOME/bin` or similar.
3. OMZ `tools/install.sh` ignores Homebrew `PREFIX`; it clones the repo into `$HOME/.oh-my-zsh` and mutates shell rc.
4. Formula `bin.install` finds nothing; `test` expects nonexistent `#{bin}/oh-my-zsh --version`.
5. homepage/livecheck wrongly point at the raw install.sh URL; version falls back to `0.0.1`.

## Recommended product fix (batch — fix-package only, no release)
Refuse **home shell frameworks** before formula generation:

1. **Analyzer / CLI gate** when install method is `script` and README/repo evidence matches:
   - owner/repo `ohmyzsh/ohmyzsh` or `robbyrussell/oh-my-zsh`
   - install path clones to `~/.oh-my-zsh` / `$ZSH`
   - docs describe zsh plugins/themes framework (not a PREFIX-aware installer)
2. Raise a structured error in non-interactive mode, e.g.:
   ```
   Oh My Zsh is a home-directory zsh framework (installs to ~/.oh-my-zsh and edits ~/.zshrc).
   It is not packagable as a Homebrew Cellar formula. Install via the official script:
   https://ohmyz.sh
   ```
3. Do **not** emit install-script formulas for scripts that only install under `$HOME`.

Optional general rule (broader than OMZ): if install-script body / README strongly indicates `$HOME`-only install and no PREFIX support, refuse rather than generating empty-bin formulae.

## Service expectation
`service: false` — match if a formula were generated without a service block (observed: no service). Delta is **generator/support**, not service.

## Validation
Local generate (temp tap) produced the broken formula above; VM `vm-install-one.mjs` on homeserver:

```
EXIT_CODE=1
PACKAGE=oh-my-zsh
VERIFY_OK=false
```

After fix: non-interactive allbrew should exit non-zero **before** writing a formula, with a clear unsupported message (not a silent empty Cellar install).

## Residual risk
- Until released, brew allbrew 0.0.24 still emits broken install-script formulas for OMZ and similar frameworks (antigen, prezto, zimfw, etc. may share the pattern).
- Users who want Homebrew management of zsh should use core `zsh` only; frameworks remain out of Cellar by design.

## This run (raw install.sh URL)

- **URL:** `https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh`
- **Classification:** `bash-script` (not `github-repo`)
- **Same broken formula shape** as github-repo path (sha256 `95118b50…`, version `0.0.1`)
- Gate should match **both** github-repo ohmyzsh/ohmyzsh **and** raw tools/install.sh bash-script URLs.
