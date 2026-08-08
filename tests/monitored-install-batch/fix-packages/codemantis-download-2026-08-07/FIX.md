# codemantis (download page) — generate_fail (upstream site dead)

## Failure class
`generate_fail` — page discovery HTTP 403 / Cloudflare Error 1000; classified `unknown`; no formula/cask.

## Root cause
Not an allbrew generator bug. `https://codemantis.dev` (and `/download`) currently resolve through Cloudflare but origin DNS is broken (**Error 1000: DNS points to prohibited IP**). Fetch returns **HTTP 403** error HTML; `page-discover` finds zero download candidates.

## Prior art
- GitHub URL `https://github.com/codemantis-dev/codemantis` previously failed with repo 404 (org `public_repos: 0`). See `fix-packages/codemantis-2026-08-07/`.
- Product was marketed as Tauri/native desktop (macOS + Windows) — expected path when site recovers: **cask-app**.

## Fix package mode
`docs` only — no lib patches. Optional soft product improvement: surface Cloudflare/upstream error pages more clearly in non-interactive CLI (still not required for this URL).

## Validation
- Local temp-tap: exit 1, Classified unknown, HTTP 403 page discover.
- VM `local-2` via `vm-install-one.mjs`: EXIT_CODE=1 VERIFY_OK=false same error.
