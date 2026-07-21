import { it, expect } from "bun:test";
import {
  shouldRunLifecycleTests,
  lifecycleSkipReason,
} from "../helpers/lifecycle-gate.ts";

/**
 * Tier 0 (T0.4) scaffold — Lume-first lifecycle test home.
 *
 * Destructive lifecycle tests (A1 service lifecycle, A3 hooks activation, A4
 * zap persona) live under `tests/e2e-lume/` and are gated by the
 * `lifecycleDescribe` helper. They run on Lume by default; local execution
 * requires `ALLBREW_LIFECYCLE_LOCAL=1`.
 *
 * This file is a non-destructive smoke test that verifies the gate works. The
 * real lifecycle test files (e.g. `service-lifecycle.lume.test.ts`) will be
 * added in PR3/PR4/PR5 per the user-lifecycle test plan.
 *
 * Gating env vars:
 *   - ALLBREW_LUME=1               → set by the Lume VM harness
 *   - ALLBREW_LIFECYCLE_LOCAL=1    → opt in to running destructive tests locally
 */

it("lifecycle gate: reports skip reason when not on Lume / not opted in", () => {
  // This test always runs (it only inspects the gate, it does not mutate state).
  // It documents the expected env-var contract.
  const reason = lifecycleSkipReason();
  if (shouldRunLifecycleTests()) {
    expect(reason).toBe("");
  } else {
    expect(reason).toContain("ALLBREW_LIFECYCLE_LOCAL");
    expect(reason).toContain("Lume");
  }
});
