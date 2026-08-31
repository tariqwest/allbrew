# allbrew Contributor Dogfood — Plan

> **Status:** Implemented.
>
> Design for a community contribution path built on the `allbrew-dogfood` branch, plus the core system-capture ("diagnose") capability that makes non-developer bug reports actionable, and the built-in `allbrew dogfood <url>` AI harness.

## Motivation

The existing `monitored-install-dogfood` skill is maintainer-only: it hardcodes `/Users/tariqwest/Developer/allbrew`, pushes directly to `allbrew-dogfood` and `main`, and requires `GITHUB_TOKEN` + write access. The goal is to let **any** user — including non-developers — contribute their monitored install experience and AI inference, so fixes are crowd-sourced without granting repo access.

## Decisions (from user)

1. **fm/PCC backend** — implement `allbrew dogfood` on the on-device `fm` model now; treat Private Cloud Compute (`pcc`) as aspirational (a selectable `--backend pcc` that currently falls back to on-device `fm`).
2. **Submission mechanism** — fork + PR via `gh`, with a pre-filled issue fallback for users without GitHub auth.
3. **Sequencing** — all phases in one pass.

## Components

### 1. `lib/diagnose.ts` — system-info capture core

- `captureSystemInfo()` → `DiagnosticReport`: OS (via `sw_vers` + `uname`), Homebrew (`--version`, `--prefix`, `config --json`, `list --formula`/`--cask` truncated to 100), allbrew (version, binary, redacted config, manifests), runtime (node/bun).
- `sanitizeReport()` / `redactSecrets()` — masks token/secret/password/key fields and collapses home paths to `~`.
- `formatDiagnosticReport()` — markdown suitable for issue bodies / PR bodies.
- Backed by `allbrew doctor` (a long-planned management command now landed).

### 2. `lib/dogfood.ts` + `allbrew dogfood <url>` — built-in AI harness

- `ModelBackend` shape: `fm` (`/usr/bin/fm respond` with the dogfood skill as `--instructions` and a structured `--schema`) and `pcc` (aspirational, falls back to `fm`).
- `runDogfood()`: classify → run `allbrew <url> --verbose` non-interactively (`ALLBREW_NONINTERACTIVE=1`) → write `agent-judgment.json` + `allbrew-run.log` + `diagnostic-report.md`.
- `parseJudgment()` tolerates `fm`'s ANSI color / prose-then-JSON output.

### 3. Run-record metadata enrichment

`init-run-record.mjs` now captures richer `host` (productName/productVersion/buildVersion/bun) and a new `homebrew` object (version, redacted config, formulae, casks), keeping the existing shape backward-compatible.

### 4. `monitored-install-dogfood` SKILL.md v2 — two modes

- **Maintainer** (direct push to `allbrew-dogfood` + release) — unchanged flow, but repo root is resolved generically (no hardcoded `~/Developer/allbrew`).
- **Contributor** (Phase 5d) — no push to origin; fork + `gh pr create` against `main`/`allbrew-dogfood`, or a pre-filled issue with artifacts attached. No Phase 6 (release).

### 5. Bug-report template

`.github/ISSUE_TEMPLATE/dogfood-report.yml` — pre-populated with URL, outcome, allbrew version, OS/build, `allbrew doctor` diagnostic, expected behavior, and artifact attachments.

### 6. README `## Contributing` + `### Dogfood testing`

Invites non-developers to opt in via `allbrew dogfood <url>` or the agent skill, documents the submission routes, and the fix lifecycle (contributor → patch artifact → `allbrew-dogfood` → `main`).

## Lifecycle

```
contributor env (allbrew-dogfood build)
  → allbrew dogfood <url>  (fm/PCC classification + run record)
  → patches/dogfood/<run-id>.patch + run record + diagnostic report
  → fork PR (or pre-filled issue)  — review gate
  → allbrew-dogfood branch (maintainer applies + releases)
  → main (cherry-picked / PR'd, reconciled into executed code)
```

`scripts/release.ts` auto-rebases `allbrew-dogfood` onto `main` and re-releases the dogfood build on every `main` release, keeping the two in lock-step.

## Verification

- `bun run check` + `bun run test`.
- Unit tests: `tests/unit/diagnose.test.ts` (capture + redaction), `tests/unit/dogfood.test.ts` (`parseJudgment`, fm backend with a mocked `fm` binary).
- Manual: `allbrew doctor`, `allbrew dogfood --help`, `allbrew dogfood <url>` (dry).

## Open items

- `pcc` backend is a stub pending an `fm` PCC flag/model; wire it when available.
- `brew config --json` shape varies across Homebrew versions; the capture tolerates `null`.
