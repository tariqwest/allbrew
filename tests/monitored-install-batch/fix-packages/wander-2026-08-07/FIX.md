# wander — Darwin_all not matched as macOS binary

## Failure

`allbrew https://github.com/robinovitch61/wander` chose `binary-release` from release assets but only logged Linux tarballs:

```
Detected binary assets: wander_1.1.0_Linux_arm64.tar.gz, wander_1.1.0_Linux_x86_64.tar.gz
Error: No macOS binary assets found in release (Linux-only binaries cannot be installed with Homebrew on macOS)
```

Release actually ships goreleaser fat binary:

- `wander_1.1.0_Darwin_all.tar.gz`

`matchAssetToArch` only treated `*universal*` as `macosUniversal`, not goreleaser’s `Darwin_all` / `macos_all`.

## Fix

1. `lib/utils.ts` — `archPatterns().macosUniversal` accepts `darwin_all`, `macos_all`, `osx_all`, and `all_darwin` / `all_macos`.
2. `lib/generators/binary-release.ts` — strip `|all` when deriving bare bin name prefix.
3. Unit tests for wander-style asset names; `Linux_all` stays non-macOS.

## Local validation

With the patch, temp-tap generate succeeds:

- Generator: binary-release
- Formula: `Formula/wander.rb` v1.1.0 with `on_macos` using `Darwin_all` for arm+intel
- No `service do` (agent expectation: false — interactive Nomad TUI)
- Install method: archive → `libexec.install` + symlink `wander`

## VM verify

Not completed: pool local VM not running; homeserver sparsebundle attach failed (`hdiutil attach did not mount at /opt/homebrew`). Product generate path is fixed; parent should re-run VM after infra + bottle/reconcile.

## Upstream note

README documents `brew install robinovitch61/tap/wander` (third-party tap). Allbrew still correctly can generate an independent formula from release binaries.
