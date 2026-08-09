# Monitored install run records

Dogfood flat-file DB for real workstation installs driven by this skill.

## Location

```
tests/monitored-install-runs/
  latest -> <run-id>/
  index.jsonl
  <run-id>/
    metadata.json
    agent-judgment.json
    outcome.json
    summary.md
    allbrew-initial.log
    allbrew-final.log          # optional, after release retry
    terminal-transcript.md     # optional condensed terminal notes
    formula.rb                 # optional copy of generated formula/cask
    classifier-rule.mjs        # optional proposed rule function
```

`tests/monitored-install-runs/` is gitignored (like `tests/e2e-runs/`). Schema and helpers live in this skill and are committed.

## When to write

**Always** at the end of a monitored run (Phase 5), whether success or failure — including env failures after a URL was attempted. Create the run dir at Phase 0.5/1 start so logs can stream into it; finalize `outcome.json` + `index.jsonl` in Phase 5.

## Run id

```
YYYY-MM-DDTHH-mm-ssZ__<slug>
```

UTC timestamp + formula/cask slug (or URL basename). Example: `2026-07-30T20-49-04Z__gitnexus`.

## Files

### `metadata.json`

Machine-readable envelope:

| Field | Type | Notes |
|-------|------|-------|
| `schemaVersion` | `1` | bump when shape breaks |
| `runId` | string | directory name |
| `startedAt` / `finishedAt` | ISO-8601 | |
| `url` | string | user input |
| `slug` | string | formula/cask name attempted |
| `host` | object | `os`, `arch`, `node` (optional), `brewPrefix` |
| `allbrew` | object | `binary`, `versionInitial`, `versionFinal`, `tapPath`, `sourceGitSha` |
| `attempts` | array | each install attempt: `{phase, binary, logFile, exitCode, startedAt, finishedAt}` |
| `release` | object\|null | `{tag, commit, bumped}` if Phase 4 ran |
| `files` | object | relative paths of artifacts in the run dir |

### `agent-judgment.json` (required)

Agent’s independent classification **before/without trusting** allbrew’s detector, plus comparison after the run.

```json
{
  "schemaVersion": 1,
  "url": "https://github.com/abhigyanpatwari/GitNexus",
  "inputShape": {
    "kind": "github-repo",
    "host": "github.com",
    "owner": "abhigyanpatwari",
    "repo": "GitNexus",
    "hints": ["readme-npm-global", "npx", "mcp-stdio", "optional-serve"]
  },
  "expected": {
    "strategy": "npm-package",
    "generator": "npm-package",
    "packageName": "gitnexus",
    "formulaName": "gitnexus",
    "binName": "gitnexus",
    "service": false,
    "serviceCommand": null,
    "allbrewArgs": ["--name", "gitnexus", "--package", "gitnexus"],
    "rationale": "README installs npm CLI; primary UX is analyze/mcp stdio not launchd"
  },
  "codebaseObserved": {
    "strategy": "github-repo->npm-package",
    "generator": "npm-package",
    "packageNameDetected": "gitnexus@latest",
    "packageNameUsed": null,
    "serviceDetected": true,
    "serviceCommand": "This starts the server on `",
    "formulaPath": null,
    "logSignals": ["Detected install method: npm (gitnexus@latest)", "Detected service/launchagent hint"]
  },
  "deltas": [
    {
      "field": "packageName",
      "agent": "gitnexus",
      "codebase": "gitnexus@latest",
      "severity": "error",
      "note": "dist-tag left on registry path → 404"
    },
    {
      "field": "service",
      "agent": false,
      "codebase": true,
      "severity": "error",
      "note": "stdio MCP / optional serve misread as brew service"
    }
  ],
  "proposedRule": {
    "id": "npm-strip-dist-tag",
    "language": "js",
    "appliesTo": ["detectInstallMethod", "cleanNpmPackageSpec"],
    "description": "Strip @latest/@version from unscoped and scoped npm install specs",
    "regex": "(?:npm|pnpm|yarn|bun|npx)[^\\n]*\\b(@?[\\w.-]+(?:/[\\w.-]+)?)(?:@[\\w.-]+)?",
    "functionName": "matchGitNexusNpmLatest",
    "implementationFile": "classifier-rule.mjs",
    "shouldPromoteToCode": true
  },
  "notes": "Free-form agent summary of judgment process"
}
```

`severity`: `match` | `info` | `warn` | `error`.

### `classifier-rule.mjs` (strongly encouraged when deltas exist)

Export a pure function the agent believes would classify **this URL/input shape** correctly. Prefer general rules over one-off host checks; one-offs are still useful as fixtures.

```js
/** @param {{ url: string, readmeText?: string }} input */
export function matchCase(input) {
  // return null if rule does not apply
  // else return { generator, packageName, formulaName, binName, service, serviceCommand, confidence, reason }
}

export const meta = {
  id: "npm-strip-dist-tag",
  runId: "…",
  url: "…",
};
```

Optional companion unit later: load all `**/classifier-rule.mjs` under run dirs and assert they still return the recorded expectation for stored fixtures.

### `outcome.json`

```json
{
  "schemaVersion": 1,
  "status": "success" | "fixed_success" | "failed" | "blocked",
  "failureClass": null | "generate_fail" | "brew_fail" | "service_mismatch" | "prompt_hang" | "env_fail",
  "package": { "name": "gitnexus", "version": "1.6.9", "kind": "formula" },
  "verification": { "ok": true, "commands": [["gitnexus","--version"]], "outputs": ["1.6.9"] },
  "fix": {
    "applied": true,
    "commit": "8e18db7",
    "releaseTag": "v0.0.8",
    "files": ["lib/analyzer.ts", "tests/unit/analyzer.test.ts"]
  },
  "agentCodebaseAgreement": {
    "generator": true,
    "packageName": true,
    "service": true,
    "overall": true
  }
}
```

### `summary.md`

Human narrative: thought process, what failed, what was fixed, residual risk. Safe to paste into chat reports.

### Logs

Copy or tee Phase 1 / final retry logs into the run dir (`allbrew-initial.log`, `allbrew-final.log`). Redact tokens if any leak into output.

## `index.jsonl`

One JSON object per run (append-only), minimal for scanning:

```json
{"runId":"…","finishedAt":"…","url":"…","slug":"…","status":"fixed_success","generator":"npm-package","failureClass":"generate_fail","deltas":["packageName","service"],"releaseTag":"v0.0.8"}
```

Write via `scripts/finalize-run-record.mjs` so the line is valid JSON.

## Helpers

| Script | Role |
|--------|------|
| `scripts/init-run-record.mjs` | create run dir + skeleton metadata, print `RUN_DIR` |
| `scripts/finalize-run-record.mjs` | validate, write/merge outcome, append index, update `latest` symlink |
| `scripts/run-allbrew-capture.sh` | may accept `--log` pointing inside `RUN_DIR` |

## Privacy

- Never store `GITHUB_TOKEN`, `githubToken`, or raw `.env`.
- Redact Authorization headers if present in logs.
- Local-only by default (gitignored). Promote anonymized fixtures into `tests/fixtures/` or unit cases deliberately.
