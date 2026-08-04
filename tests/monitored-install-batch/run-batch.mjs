#!/usr/bin/env bun
/**
 * Skill-aligned batch entrypoint (2× workers by default).
 * Delegates to run-orchestrator.mjs.
 * For the legacy shallow smoke runner, use run-batch-smoke.mjs.
 */
import "./run-orchestrator.mjs";
