# FIX: zellij (https://zellij.dev/launch)

## Case
`has_script_install` — official "try without installing" bootstrap at
`https://zellij.dev/launch` (extensionless shell script, content-type
`application/octet-stream`). Ground truth expects `bash-script`.

## Failures observed

### Released allbrew 0.0.24 (local + expected VM)
- `classify` → `unknown` (no `.sh` extension)
- `classifyWithHead` HEAD → `application/octet-stream` (not `text/x-shellscript`)
- page-discover WebView fails (`net::ERR_ABORTED` — body is a script, not HTML)
- Non-interactive: `Unable to automatically handle URL` → **generate_fail**

Even if classified as `bash-script`, plain `install-script` is wrong: the
launcher curl|tars a GitHub release into `/tmp/zellij/bootstrap` and execs it;
it ignores `PREFIX`/`DESTDIR`, so the formula would install nothing usable.

## Agent judgment
- Preferred durable packaging: **binary-release** from `zellij-org/zellij`
- service: **false** (terminal multiplexer TUI, not launchd)
- Homebrew core already has `zellij` 0.44.3; allbrew path still valuable for
  tap dogfood of the launch URL shape.

## Fixes (worktree validated, not released)
1. **`lib/classifier.ts`**
   - `looksLikeShellScript` + `sniffBodyForScript` (Range GET first 4KiB)
   - `classifyWithHead`: when CT is octet-stream/text/plain/empty, sniff shebang
2. **`lib/analyzer.ts`**
   - `detectGithubBinaryReleaseFromScript(text)` — pure parse of GitHub
     `releases/.../download/...` asset URLs; high confidence for thin /tmp bootstraps
3. **`lib/cli.ts` `handleBashScript`**
   - Fetch script; if probe hits, pivot to `handleGithubRepo` with
     `type: binary-release` (durable packaging)

## Validation
- Unit: `tests/unit/install-script-github-binary-probe.test.ts` + conflict-matrix B3b
- Local generate (worktree, brew stub): formula `zellij` binary-release 0.44.3,
  no `service do`, `zellij --version` test stanza present
- Batch mode: no release; VM on 0.0.24 still generate_fail until parent promote

## Residual risk
- binary-release may pick `zellij-no-web-*` for some arch pairs (pre-existing selector)
- Name collision with homebrew/core `zellij` if both tapped
- Other launchers that download multi-repo assets intentionally stay install-script
