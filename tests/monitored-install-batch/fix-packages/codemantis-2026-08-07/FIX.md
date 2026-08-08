# codemantis — generate_fail (upstream missing)

## Failure class
`generate_fail` — GitHub API 404 on `GET /repos/codemantis-dev/codemantis`.

## Root cause
Not an allbrew generator bug. Org `codemantis-dev` exists (`public_repos: 0`); repo is missing/private/deleted. Octokit surfaces `HttpError: Not Found`.

## Product context (out of assignment scope)
- Sibling catalog URL: `https://codemantis.dev/download` (queue slug also `codemantis`, agent `url-0259-codemantis`).
- Site markets a Tauri v2 native desktop app (macOS AS/Intel + Windows) — likely **cask-app** / DMG path, not github-repo formula.
- Assignment integrity forbids rewriting this run's URL; parent should requeue `https://codemantis.dev/download` separately.

## Fix package mode
`docs` only — no lib patches. Optional product improvement (non-blocking): friendlier CLI message when GitHub repo 404s after successful classification.

## Validation
- Local: `CI=1 bun run bin/allbrew.ts https://github.com/codemantis-dev/codemantis --name codemantis --tap $TMP --verbose` → exit 1, no formula.
- VM: `vm-install-one.mjs` EXIT_CODE=1 VERIFY_OK=false.
