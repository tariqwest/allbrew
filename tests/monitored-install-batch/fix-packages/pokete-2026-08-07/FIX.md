# Fix: pokete (pip) bare dylib ID → Mach-O linkage failure

## Package
- **URL:** https://pypi.org/project/pokete
- **Generator:** `pip-package`
- **Version observed:** `0.10.0rc4` (PyPI latest at run time)
- **Service:** false (interactive TUI game; not a daemon)

## Failure class
`brew_fail`

## Symptom
`allbrew` generates a valid `pip-package` formula and `brew install` fetches wheels, then fails during Homebrew post-install linkage:

```text
Error: Failed changing dylib ID of …/pokete/playsound/libplaysound.arm64.osx.so
  from libplaysound.osx.so
    to /opt/homebrew/opt/pokete/libexec/lib/python3.13/site-packages/pokete/playsound/libplaysound.arm64.osx.so
Error: Failed to fix install linkage
```

## Root cause
Pokete ships a Go c-shared audio module with a **bare** install name:

```text
otool -D libplaysound.arm64.osx.so  →  libplaysound.osx.so
```

`LC_ID_DYLIB` is only 19 bytes. Homebrew’s `fix_dynamic_linkage` tries to rewrite it to a long Cellar path (~104 bytes). `install_name_tool` refuses because there is no header pad.

Existing `preserve_rpath` only skips IDs that already start with `@rpath/`; bare basenames are still expanded and fail.

## Fix
In `lib/templates/formula/pip-package.ts`, after `pip_install_main`, rewrite bare short dylib IDs to `@rpath/<id>` so `preserve_rpath` leaves them alone:

```ruby
Dir[libexec/"**/*.{so,dylib}"].each do |so|
  next unless File.file?(so)
  id = Utils.popen_read("otool", "-D", so).lines.drop(1).first&.strip
  next if id.nil? || id.empty? || id.include?("/") || id.start_with?("@")
  system "install_name_tool", "-id", "@rpath/#{id}", so
end
```

Also update `scripts/test-templates.ts` parity fixture for `pip_package`.

## Validation (local, temp tap + disposable worktree)
1. Stock formula (main): `brew install` fails with dylib ID expansion error (captured in initial host generate log).
2. Fixed worktree generate + install: **succeeds**; binary at `$(brew --prefix)/bin/pokete`.
3. `bun run test:templates` — `pip_package` OK.
4. Unit render tests — pass.

## Residual risk
- **TUI / non-TTY:** `pokete --version` / `--help` import a module that calls `os.get_terminal_size()` at import time, so non-interactive verify (`--version`/`--help`) may fail even after a good install. Prefer path existence / `brew list` for automation smoke.
- **Default formula `test do`:** still asserts `pokete --version`, which can fail under `brew test` without a TTY.
- **Prerelease:** livecheck may surface `0.10.0rc4` as latest from PyPI JSON.
- **Batch mode:** fix not released; stock VM allbrew still hits `brew_fail` until patch lands.

## Files
- `patches/0001-pip-bare-dylib-id-to-rpath.patch`
- `patches/0002-pip-template-parity-bare-dylib.patch`
- `patches/pip-package.ts` / `patches/test-templates.ts` (full copies)
- `formula-pokete-broken.rb` / `formula-pokete-fixed.rb`
