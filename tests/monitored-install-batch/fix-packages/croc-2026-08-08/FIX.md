# FIX: getcroc.schollz.com (`croc`)

## Failure
1. `classifyWithHead` used `User-Agent: allbrew/1.0` → site `Vary: User-Agent` returns **HTML** SPA (not the curl installer). Classified `unknown`.
2. Page discovery / WebView preferred `github.com/sponsors/schollz` (matched as fake `github-repo`) → GitHub API 404.
3. Even as install-script, brew fetch uses Homebrew UA → HTML, wrong SHA; script ignores `PREFIX` without `-p`.
4. After pivot to GitHub releases: `Linux-64bit` / `macOS-64bit` assets not matched; `croc-web_*` could win over `croc_*`.

## Fix (Option A worktree)
1. **classifier** — curl-like UA + shebang sniff for `text/plain`; reserve `sponsors` pseudo-owner.
2. **cli handleBashScript** — if installer body downloads GitHub releases, package as `github-repo` (binary-release).
3. **utils archPatterns** — recognize goreleaser `64bit` tokens.
4. **binary-release** — score primary product assets over `-web` companions.
5. **install-script / sha256** — curl UA download + optional `-p bin` (fallback path).

## Expected outcome after release
- Generator path: bash-script → github-repo → **binary-release**
- Formula name: **croc-tap** (homebrew/core collision)
- Version 11.0.2, macOS ARM/Intel + Linux ARM/Intel `croc_v*` tarballs
- service: false
