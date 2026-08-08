# googly-eyes — fix-package (Option A, docs mode)

## Summary

Canonical URL `https://googlyeyes.app` is **unreachable** (DNS resolves to `97.117.68.137`; TCP 80/443 connect timeout from host and homeserver VM). allbrew correctly classifies as `unknown` and page-discover aborts with fetch failure. **Not a generator/template bug.**

## Agent expectation

| Field | Value |
|-------|--------|
| Product | Googly Eyes (Sindre Sorhus) — menu bar eyes follow cursor |
| Generator | `cask-app-mas` |
| MAS id | `6743048714` |
| Version | `1.2.0` (min macOS 26) |
| Service | `false` |
| Working pages | `https://apps.apple.com/app/id6743048714`, `https://sindresorhus.com/googly-eyes` |

## Evidence

- Local temp-tap: `Classified as: unknown` → `fetch failed: The operation was aborted.` → non-interactive unable to handle
- VM (`homeserver` + exclusive `/opt/homebrew`): same generate_fail, `EXIT_CODE=1`, `VERIFY_OK=false`
- Sanity (off-canonical): MAS URL and sindresorhus product page both produce `Casks/googly-eyes.rb` with `mas install 6743048714`

## Recommended product/catalog actions (no patch)

1. **Update catalog / queue URL** from `https://googlyeyes.app` to either:
   - `https://apps.apple.com/us/app/googly-eyes/id6743048714` (preferred for cask-app-mas), or
   - `https://sindresorhus.com/googly-eyes` (page-discover → MAS)
2. Do **not** add a hard-coded `googlyeyes.app` → MAS id alias in classifier unless a broader “dead marketing domain → itunes seller lookup” design is adopted.
3. Optional follow-up: MAS cask `url "macappstore://…"` still makes `brew` attempt a download that fails with `Protocol "macappstore" not supported` before installer script; verify installer-only / `url` strategy for `cask-app-mas` under real `mas` on Apple Silicon (separate from this URL’s generate_fail).

## Mode

`docs` — diagnosis only; no `patches/*.patch`. Upstream/catalog URL issue.
