/**
 * Tier 0 (T0.4) — Lume-first lifecycle gate.
 *
 * Destructive lifecycle tests (services, zap, hooks — A1/A3/A4) mutate launchd,
 * app install locations, and Homebrew service state. They run on **Lume by
 * default**; local execution is explicitly opt-in via the
 * `ALLBREW_LIFECYCLE_LOCAL=1` env flag.
 *
 * This module exposes the gating convention so future lifecycle test files
 * (e.g. `tests/e2e-lume/service-lifecycle.lume.test.ts`) can skip cleanly when
 * not on Lume and not explicitly opted in.
 *
 * Detection:
 *   - `ALLBREW_LIFECYCLE_LOCAL=1` → force local execution (opt-in).
 *   - `ALLBREW_LUME=1`            → running inside a Lume VM (legacy/allbrew-specific).
 *   - `TH_IN_VM=1`                → running inside a Lume VM (set by lume-macos-testing-harness).
 *   - Otherwise → skip (not Lume, not opted in).
 *
 * Usage with bun:test:
 *   import { lifecycleDescribe } from "../helpers/lifecycle-gate.ts";
 *
 *   lifecycleDescribe("A1 service lifecycle", () => {
 *     it("starts and stops a service", () => { ... });
 *   });
 *
 * Or for manual skip checks:
 *   import { shouldRunLifecycleTests, lifecycleSkipReason } from "../helpers/lifecycle-gate.ts";
 *   if (!shouldRunLifecycleTests()) console.warn(lifecycleSkipReason());
 */
import { describe } from "bun:test";

/** True if destructive lifecycle tests should run in this environment. */
export function shouldRunLifecycleTests(): boolean {
  if (process.env.ALLBREW_LIFECYCLE_LOCAL === "1") return true;
  if (process.env.ALLBREW_LUME === "1") return true;
  if (process.env.TH_IN_VM === "1") return true;
  return false;
}

/** Human-readable reason for skipping lifecycle tests (empty if they should run). */
export function lifecycleSkipReason(): string {
  if (shouldRunLifecycleTests()) return "";
  return (
    "Skipping destructive lifecycle tests — not on Lume and ALLBREW_LIFECYCLE_LOCAL!=1. " +
    "Run on Lume via bun run vm:test --profile user-journeys, or opt in locally with ALLBREW_LIFECYCLE_LOCAL=1."
  );
}

/**
 * Wrap `describe` so the block is skipped unless lifecycle tests are enabled.
 * Uses bun:test's `describe.skipIf` under the hood.
 */
export function lifecycleDescribe(
  name: string,
  fn: () => void,
): void {
  describe.skipIf(!shouldRunLifecycleTests())(`${name} [lifecycle]`, fn);
}
