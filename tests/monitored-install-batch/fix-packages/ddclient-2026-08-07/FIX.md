# fix-package: ddclient (source-build + service)

## Failure
- **brew_fail**: source-build used GitHub API tarball (`api.github.com/.../tarball/v4.0.0`) which lacks pre-generated `./configure` / dist layout; `./configure` fails vs release asset `ddclient-4.0.0.tar.gz` (same checksum as homebrew/core).
- **service_mismatch (command quality)**: README troubleshooting lines `ddclient --daemon=0 --query` scored as service command with `keep_alive true` (one-shot diagnostics).

## Fix
1. `lib/generators/source-build.ts` — `pickReleaseSourceArchiveUrl()` prefers non-platform release source archives over API tarballs.
2. `lib/analyzer.ts` — detect `systemctl enable|start *.service` → bare package name; filter one-shot `--query` / `--daemon=0` / `--once` / `--help|--version`; score `--foreground`; detect systemd sample unit files.

## Validation
- Unit: analyzer + source-build tests pass (143).
- Local temp-tap generate + host path `brew install` of formula file: **Installed: ddclient-tap** with release asset URL + `service do run "ddclient"`.
- VM cycle pending (pool contention / homeserver sparsebundle attach failures).

## Residual
- Service stanza is bare `ddclient` + keep_alive, not interval + `-file conf` like homebrew/core (acceptable medium-confidence auto-detect).
- Formula renamed `ddclient-tap` due to core collision.
- Stable autotools still depends on autoconf/automake (core only needs those for HEAD).
