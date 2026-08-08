# nanobot (HKUDS/nanobot) — monitored install diagnosis

## URL
https://github.com/HKUDS/nanobot

## Independent judgment (Phase 0.5)
- **Generator:** `pip-package`
- **PyPI package:** `nanobot-ai` (CLI bin: `nanobot`)
- **Service:** `true` — docs document long-running `nanobot gateway` / LaunchAgent / systemd deployment; formula should use `run [opt_bin/"nanobot", "gateway"]` with `keep_alive true`
- **Not** install-script despite README `curl | sh` one-liner — stable path is PyPI

## Outcomes
| Layer | Result |
|-------|--------|
| Local generate (current source, temp tap) | **OK** — formula `nanobot-ai.rb` (core name collision rename), service stanza correct |
| Local host `brew install nanobot-ai` (via allbrew auto-install) | **OK** — binary present, then uninstalled for hygiene |
| VM `vm-install-one` (allbrew 0.0.24 bottle) | **FAIL** — generate OK; `brew install` never completes in guest log (no `EXIT_CODE=`, no success/fail line); VERIFY_OK=false |

## Root cause analysis

### 1. homebrew/core name collision (product awareness, mostly handled)
- Core formula **`nanobot`** is a **different** project (“Build MCP Agents”, https://www.nanobot.ai/, Apache-2.0).
- HKUDS/nanobot publishes **`nanobot-ai`** on PyPI.
- Current allbrew source renames preferred formula name `nanobot` → `nanobot-ai` with log line:
  `Formula name "nanobot" collides with homebrew/core; using "nanobot-ai" instead`
- VM bottle 0.0.24 wrote `Formula/nanobot.rb` **without** that rename message in some runs → risk of ambiguous `brew install nanobot` resolution.

### 2. Heavy pip formula install time (primary VM failure mode)
- Generated formula pulls **~100** PyPI resources (anthropic, mcp, cryptography, …).
- allbrew generate already downloads wheels for SHA256; `brew install` downloads again into Cellar.
- Guest logs consistently stop at `- Running brew install nanobot...` with **no** trailing `EXIT_CODE=` (process killed mid-install by timeout / incomplete flush).
- Host install of the same shape completed successfully → formula content is sound; VM wall-clock / sparsebundle I/O is the bottleneck for batch timeouts (default 12m, even 25–45m attempts failed to emit completion).

### 3. VM hygiene noise
- Occasional `ensureAllbrew` failures after repeated attach/detach.
- Tap `git commit` failed once (`chore(allbrew): add nanobot`) — formula still on disk; not the primary install failure.
- local-1 VM sometimes not running / auxiliary storage lock errors (env, not product).

## Service expectation vs codebase
- Agent: `service=true`, command `nanobot gateway`
- Codebase (host + VM formulas): `service do; run [opt_bin/"nanobot", "gateway"]; keep_alive true; end`
- **Match** — no service_mismatch

## Generator / package deltas
| Field | Agent | Codebase | Severity |
|-------|-------|----------|----------|
| generator | pip-package | pip-package | match |
| packageName | nanobot-ai | nanobot-ai | match |
| formulaName | nanobot | nanobot-ai (host) / nanobot (VM 0.0.24) | info/warn |
| service | true | true | match |

## Recommended product follow-ups (no mandatory patch for this batch)
1. Prefer formula name **`nanobot-ai`** whenever registry package is `nanobot-ai` or core collision exists (already on current source).
2. Consider batch `TH_BATCH_INSTALL_TIMEOUT_MS` ≥ 45–60m for heavy pip graphs, or stream `brew install` with unbuffered logs for diagnosis.
3. Do **not** force `--service` / `--no-service` — auto-detect already correct.

## Patches
None shipped in this fix-package (host generate+install succeeded with current source; VM failure is install-duration / env, not wrong formula shape).

## Residual risk
- Users requesting `--name nanobot` may still hit core collision depending on allbrew version.
- Heavy dependency graph → long first `brew install` on cold cache.
- Gateway service needs user config/API keys; `brew services start` alone is not a full agent setup.
