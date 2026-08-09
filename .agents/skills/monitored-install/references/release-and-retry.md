# Release and retry

Use after a product fix is validated locally and tests pass.

## 1. Commit hygiene

```bash
cd ~/Developer/allbrew
git status
git --no-pager diff --stat
```

Stage only fix + tests + intentional fixtures:

```bash
git add lib/… tests/…   # explicit paths
# do not add .env, tokens, or unrelated WIP
```

Commit (conventional):

```bash
git commit -m "$(cat <<'EOF'
fix(<scope>): <short description>

<optional body: failure mode + URL class>
EOF
)"
```

Push:

```bash
git push origin main
```

`scripts/release.ts` aborts if the working tree is dirty — commit or stash everything first.

## 2. Load GITHUB_TOKEN without leaking it

Prefer an already-exported token. Otherwise load only the key from `.env` (do not `source` a messy `.env` blindly):

```bash
export GITHUB_TOKEN="$(python3 - <<'PY'
from pathlib import Path
for line in Path('.env').read_text().splitlines():
    s = line.strip()
    if s.startswith('GITHUB_TOKEN='):
        v = s.split('=', 1)[1]
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        print(v, end='')
        break
PY
)"
test -n "$GITHUB_TOKEN" && echo "TOKEN_OK_len=${#GITHUB_TOKEN}" || echo TOKEN_MISSING
```

Never `echo "$GITHUB_TOKEN"`. Never paste tokens into commits, logs, or PR bodies.

Optional env overrides used by release:

| Var | Default |
|-----|---------|
| `GITHUB_REPOSITORY` | `tariqwest/allbrew` |
| `HOMEBREW_TAP_REPO` | `tariqwest/homebrew-tap` |
| `DRY_RUN` | unset / false for real release |

## 3. Ship a patch release

```bash
bun run release patch
```

Expect:

1. Version bump in `package.json` (e.g. `0.0.8` → `0.0.9`)
2. Release commit + tag `vX.Y.Z` on `main`
3. GitHub Release with source tarball asset
4. Updated `Formula/allbrew.rb` pushed to `HOMEBREW_TAP_REPO`

On failure, read the error (auth, dirty tree, existing tag) and fix before retrying. Do not delete remote tags unless the user explicitly asks.

## 4. Upgrade Homebrew allbrew

```bash
brew update
brew upgrade allbrew || brew reinstall allbrew
allbrew --version
brew info allbrew
```

Confirm:

- `which allbrew` → `/opt/homebrew/bin/allbrew`
- version string equals the release just published
- Cellar path contains the fixed sources when relevant, e.g.:
  ```bash
  rg -n "cleanNpmPackageSpec|function_name" "$(brew --prefix allbrew)/libexec/lib" || true
  ```

## 5. Final retry with brew-installed allbrew

Re-run the **same URL** with the bottle, not `bun run bin/allbrew.ts`.

1. Refresh Phase 0.5 service expectation from docs (should match the fix intent).
2. Run without service force-flags:

```bash
LOG=/tmp/allbrew-monitor-retry-$(date +%Y%m%d%H%M%S).log
/opt/homebrew/bin/allbrew "<url>" \
  --name "<slug>" \
  --verbose \
  2>&1 | tee "$LOG"
```

3. Compare `agent_service_expectation` to the generated formula’s `service do` presence/command (`service_mismatch` if they disagree). Update `$RUN_DIR/agent-judgment.json` codebaseObserved + deltas; tee this retry into `$RUN_DIR/allbrew-final.log`.
4. Verify install:

```bash
brew list <name> || brew list --cask <name>
which <bin> && <bin> --version
test -f ~/.config/allbrew/packages/<name>.json
```

If the package was already installed from a previous partial success:

```bash
brew reinstall <name>
# or uninstall then let allbrew reinstall
brew uninstall <name> || brew uninstall --cask <name>
```

## 6. Loop policy

| Attempt | Action |
|---------|--------|
| 1st failure | add-test-case + fix + release + retry |
| 2nd failure | second focused fix + release + retry |
| 3rd failure | stop; report logs, remaining hypotheses, and manual next steps |

## 7. Tap notes

- User packages live in the configured allbrew packages tap (often `~/homebrew-allbrew`, tap name `tariqwest/allbrew`).
- The **allbrew CLI formula** lives in `tariqwest/homebrew-tap` (`Formula/allbrew.rb`), updated by the release script — not in the packages tap.
- After a successful monitored install, `brew info <pkg>` should show `tariqwest/allbrew/<pkg>` (or the configured packages tap).
