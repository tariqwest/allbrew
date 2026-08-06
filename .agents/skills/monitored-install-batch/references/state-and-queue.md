# State and queue reference

## `state/agent-queue.json`

```json
{
  "updatedAt": "ISO-8601",
  "total": 760,
  "items": [
    {
      "idx": 79,
      "name": "Fly.io CLI",
      "url": "https://formulae.brew.sh/formula/flyctl",
      "source": "in_homebrew",
      "slug": "fly-io-cli",
      "agentName": "url-0079-fly-io-cli",
      "status": "queued|retry|launching|running|success|failed|…",
      "launchName": "u0079-fly-io-cli-20260806T161355Z",
      "launchTag": "20260806T161355Z",
      "agentId": "<child-run-id>",
      "launchedAt": "ISO-8601",
      "lastActivityAt": "ISO-8601",
      "finishedAt": "ISO-8601",
      "runDir": "tests/monitored-install-runs/…",
      "nudgeCount": 0,
      "requeueCount": 0
    }
  ]
}
```

Minimal CLI guarantees: `idx`, `name`, `url`, `slug`, `agentName`, `status` (+ timestamps when marked).

### Status sets

- **Pending:** `queued`, `retry`
- **Active:** `running`, `launching`
- **Terminal OK:** `success`, `success-not-fixed`, `fixed_success`, `failed-fix-applied`, `done`
- **Terminal fail:** `failed`, `failed-agent-runtime`, `failed-timeout`, other `failed*` except fix-applied labels

## `state/agent-wave.json`

- `basePrompt` (or `base_prompt`)
- `concurrency`, `launchTag`, `remaining`, `waveSize`
- `agents[]`: `name`, `stableName`, `title`, `idx`, `url`, `slug`, `source`, `prompt`
- optional `runAgentsHints`: prefer unique names; put base in shared prompt and assignment in per-child prompt

## `state/agent-index.jsonl`

One JSON object per line. Mixed producers (parent marks + child finalize). Richer child rows may include `runId`, `failureClass`, `fixPackage`, `launchName`, `verifyOk`.

## `tests/monitored-install-runs/<runId>/`

| File | Parent use |
|------|------------|
| `metadata.json` | started/finished, url, slug |
| `outcome.json` | status, failureClass, fix.applied, verification.ok |
| `summary.md` | narrative |
| `agent-judgment.json` | Phase 0.5 |
| `vm-install.log` | VM helper / EXIT_CODE |
| `fix-package/` | Option A |

`runId` ≈ `YYYY-MM-DDTHH-mm-ssZ__<slug>`.

## `state/fix-index.jsonl`

Events from `batch:reconcile-fixes`.

## Recovering a lost child run id

1. Queue `agentId` if stored.
2. Harness session history / lifecycle sender for that wave.
3. Never invent ids. Without an id you can still mark-done from RUN_DIR; you cannot nudge.
