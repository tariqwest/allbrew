/**
 * B6: Integration quarantine helpers.
 *
 * Provides:
 *   - `quarantine()`: mark a test as flaky/quarantined. The test still runs
 *     but is tagged so it can be filtered out of CI gates.
 *   - `liveSmoke()`: mark a test as part of the "live smoke" set — a small
 *     subset of integration tests that hit real external hosts and are
 *     allowed to fail separately from the CI gate.
 *   - `isQuarantined()`: check if a test name is in the quarantine list.
 *
 * Quarantine list: hosts/packages known to be flaky. Add entries here when
 * a test fails intermittently due to external factors (rate limits, CDN
 * issues, package yanks, etc.). Remove entries when the host stabilizes.
 *
 * Usage in integration tests:
 *   import { quarantine, liveSmoke } from "./helpers/quarantine.ts";
 *   it(quarantine("flaky-package: payload"), async () => { ... });
 *   it.liveSmoke("maildev: payload", async () => { ... });
 *
 * CI gate: run `bun run test:int -- --grep-invert quarantine` to exclude
 * quarantined tests. Run `bun run test:live-smoke` to run only the live
 * smoke set (allowed to fail).
 */

export const QUARANTINED_PACKAGES = new Set<string>([
  // Add package names here when they become flaky.
  // Example: "napari" (large PyPI package, slow download, occasional timeouts)
]);

export const LIVE_SMOKE_PACKAGES = new Set<string>([
  // Small, stable packages that hit each major registry once.
  // These are the "live smoke" set — allowed to fail separately from CI.
  "maildev",     // npm
  "marimo",      // PyPI
  "pry",         // RubyGems
  "dotnet-serve", // NuGet
  "ripgrep",     // crates.io (via GitHub releases)
]);

/**
 * Tag a test name as quarantined. The test still runs but the tag allows
 * CI to filter it out.
 */
export function quarantine(name: string): string {
  return `[quarantine] ${name}`;
}

/**
 * Check if a test name is quarantined.
 */
export function isQuarantined(name: string): boolean {
  return name.startsWith("[quarantine]");
}

/**
 * Check if a package is in the live smoke set.
 */
export function isLiveSmoke(packageName: string): boolean {
  return LIVE_SMOKE_PACKAGES.has(packageName);
}

/**
 * Check if a package is quarantined.
 */
export function isPackageQuarantined(packageName: string): boolean {
  return QUARANTINED_PACKAGES.has(packageName);
}
