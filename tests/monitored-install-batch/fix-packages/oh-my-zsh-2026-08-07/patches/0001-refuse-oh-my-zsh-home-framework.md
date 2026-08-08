# Proposed patch (not applied to main in batch mode)

## Goal
Fail closed for Oh My Zsh-style home frameworks before writing Formula/oh-my-zsh.rb.

## Files
- `lib/analyzer.ts` — detect home-shell-framework install shape
- `lib/cli.ts` — when detected, throw clear non-interactive error
- `tests/unit/analyzer.test.ts` — fixture for ohmyzsh README install.sh → unsupported

## Detection signals (any strong match)
1. GitHub `owner/repo` in `{ohmyzsh/ohmyzsh, robbyrussell/oh-my-zsh}`
2. README install lines targeting `~/.oh-my-zsh` or `$ZSH`
3. Install script URL matching `ohmyzsh/ohmyzsh/.../tools/install.sh` or `install.ohmyz.sh`

## Error message (non-interactive)
```
Unsupported for Homebrew packaging: Oh My Zsh installs to ~/.oh-my-zsh and modifies ~/.zshrc.
Use the official installer (https://ohmyz.sh), not a Cellar formula.
```

## Do not
- Force `--type install-script` workarounds
- Rewrite install.sh into a fake PREFIX installer
- Add a brew service
