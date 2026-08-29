# other — cross-cutting fixes breakdown

## Patch summary

The `other` category bundles recurring cross-cutting issues found across the fix packages:

- `lib/cli.ts` — added a guard that aborts generation when the derived package name is empty or `untitled`, so a missing/ambiguous URL cannot silently produce an unusable formula.
- `lib/utils.ts` — hardened `toFormulaName`, `toClassName`, and `toCaskToken` against `null`/`undefined`/empty input; made `resolveNonCollidingFormulaName` and `resolveNonCollidingCaskName` skip blank alternatives; improved cloud-metadata detection in `assertSafeFetchUrl` (trailing root dot, AWS IPv6 `fd00:ec2::254`).
- `tests/helpers/uninstall-residuals.ts` — cask residual failures now report the sanitized app path name (`.app` stripped, special chars removed) so diagnostics match the path actually checked.
- `tests/unit/uninstall-residuals.test.ts` and `tests/unit/utils.test.ts` — updated to test the new behavior.
- `lib/sha256.ts` — defensive `getHeader()` helper so the download/filename/version-header logic does not crash when unit tests mock `Response` objects without a `headers` map (same cross-cutting hardening applied to all category worktrees).

## Validation

| Command | Result |
|---|---|
| `bun run check` | pass |
| `bun run test:templates` | all 13 templates pass |
| `bun test tests/unit/uninstall-residuals.test.ts tests/unit/utils.test.ts` | 101/101 pass |
| `bun test tests/unit/sha256.test.ts` | 12/12 pass |
| `bun run test` (full suite) | 1292 pass / 13 fail (pre-existing `reconcileOne`, `matchOfficialCaskByHomepage`, `enrichGithubReleaseAssets`) |

The 13 remaining failures are pre-existing and unrelated to this patch.

## Smoke

A 5-URL host-side generate smoke was run to validate the name/CLI guard and collision logic:

| name | url | status | note |
|---|---|---|---|
| appbun | https://npmjs.com/package/appbun | formula generated | resolved to `appbun-tap` (core collision), not `untitled` |
| s-tui | https://pypi.org/project/s-tui | formula generated | resolved to `s-tui-tap`, not `untitled` |
| aichat | https://crates.io/crates/aichat | formula generated | resolved to `aichat-tap`, not `untitled` |
| dotnet-ef | https://www.nuget.org/packages/dotnet-ef | formula generated | `dotnet-ef` formula produced successfully |
| pop | https://github.com/charmbracelet/pop | generation failed | GitHub API rate limit, not a regression |

Install could not proceed because the host `/opt/homebrew` disk is saturated from earlier category runs; the generated names confirm the `untitled` guard and name/token sanitization behave correctly.

A full 30-URL install smoke is queued to run in isolated Lume VMs after the host has been cleaned and/or as part of the final cross-category regression.

## VM hygiene

N/A for this patch; no Lume VM install smoke was completed because host disk was exhausted. Local and homeserver VMs were stopped/left clean by previous category work.

## Conclusions

- The cross-cutting guard, token sanitization, uninstall-residual reporting, and `sha256` header hardening are unit- and template-tested.
- Host-side resource limits prevent a meaningful 30-URL install smoke here; the category is otherwise ready for review.
- No merge or push to `main` performed.
