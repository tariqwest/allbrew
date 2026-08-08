# Fix: pnpm GitHub release (`https://github.com/pnpm/pnpm`)

## Failure class
`brew_fail` (wrong archive entrypoint) + **Case C** (prefer homebrew/core)

## Symptom
`allbrew https://github.com/pnpm/pnpm` classifies as github-repo, detects multi-arch release tarballs, renames formula to `pnpm-tap` (core collision), and emits a **binary-release** formula whose `install` is:

```ruby
libexec.install Dir["*"]
bin.install_symlink libexec/"dist/node_modules/nopt/bin/nopt.js" => "pnpm"
bin.install_symlink libexec/"dist/node_modules/nopt/bin/nopt.js" => "nopt.js"
```

The release tarball is a **SEA** layout: top-level `pnpm` Mach-O plus a large `dist/` tree (including nested `node_modules/**/bin/*`). `pickArchiveEntrypoint` scored `**/bin/nopt.js` (+50 for `bin/`) higher than root `pnpm` because the formula name became `pnpm-tap` (no preferred-name match for `pnpm`).

## Root cause
1. Core name collision → formula `pnpm-tap` while release binary is named `pnpm`.
2. Archive entrypoint scoring boosts any path containing `/bin/` without excluding `node_modules`.
3. Nested install used full `libexec.install Dir["*"]` even for root-level binaries (bloated Cellar).

## Fix (batch mode — fix-package only, no release)
In `lib/generators/binary-release.ts` (`pickArchiveEntrypoint` / `buildBinaryReleaseInstallBody`):
1. Exclude `node_modules/` paths from entrypoint candidates.
2. Prefer preferred names from repo name and formula with `-tap` stripped.
3. Boost root-level extensionless binaries; deprioritize dependency CLIs (nopt/semver/…).
4. For root-level entrypoints, emit `bin.install "pnpm"` instead of libexec+symlink of the whole tree.
5. Installed bin name for `*-tap` formulas is the base name (`pnpm`), not `pnpm-tap`.

Unit tests cover the pnpm SEA layout and root-level install body.

## Validation (local worktree)
```bash
bun test tests/unit/generators/binary-release.test.ts  # 23 pass
# pickArchiveEntrypoint(members, "pnpm-tap", { repoName: "pnpm" }) → { sourcePath: "pnpm", binName: "pnpm" }
# buildBinaryReleaseInstallBody → bin.install "pnpm"
```

## Service expectation
`service: false` — package-manager CLI. Match: no `service do` block.

## Case C note
`homebrew/core` has healthy bottled `pnpm` 11.x with high analytics. Official docs list `brew install pnpm`. Prefer core for users; allbrew `pnpm-tap` binary-release is an alternate packaging when a tap-owned formula is still desired. Linking may conflict if core `pnpm` is already installed.

## Residual risk
- Until released, VM allbrew still generates the nopt.js entrypoint.
- Multi-arch SHA256 of ~140MB SEA assets is slow / timeout-prone during generation.
- Core collision → `pnpm-tap` confuses users who expect `pnpm`.
