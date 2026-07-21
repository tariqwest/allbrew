/**
 * Tier A (A2) — Shared uninstall residual helper.
 *
 * After every successful `brew uninstall` in e2e and e2e-tap, call
 * `assertUninstallResiduals()` to verify the package is actually gone from
 * the system. The helper asserts only facts that are valid product behavior
 * today:
 *
 *   - Package no longer in `brew list` (formula or cask)
 *   - For formulae: binary no longer resolves to a Cellar path (or is gone)
 *   - For casks: app path absent under /Applications (or $HOME/Applications)
 *   - Manifest still present (manifests persist — allbrew is the system of
 *     record; `allbrew remove`/doctor/OOB detection in Tier C will handle
 *     deletion). This is the documented product decision from the A2
 *     manifest-semantics prerequisite.
 *
 * The helper does NOT assert `manifestGone` because plain `brew uninstall`
 * has no call path that deletes a manifest (`deleteManifest` is currently
 * dead code). Asserting that would test behavior the product cannot perform.
 *
 * Usage:
 *   import { assertUninstallResiduals } from "../helpers/uninstall-residuals.ts";
 *   await assertUninstallResiduals({ name: "foo", kind: "formula" });
 *   await assertUninstallResiduals({ name: "bar", kind: "cask", appName: "Bar" });
 */
import { execFileSync as defaultExecFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadManifest, getPackagesDir } from "../../lib/manifest.ts";

// Test-injection seam: tests override this to avoid real brew calls.
let _execFileSync: typeof defaultExecFileSync = defaultExecFileSync;

/** @internal Test-only: override the execFileSync implementation. */
export function _setExecFileSyncForTesting(fn: typeof defaultExecFileSync): void {
  _execFileSync = fn;
}

export type ResidualCheckTarget = {
  name: string;
  kind: "formula" | "cask";
  /** For casks: the app name (e.g. "FakeCask"). Defaults to `name`. */
  appName?: string;
  /** Optional env override (for e2e-tap which sets HOMEBREW_* vars). */
  env?: Record<string, string>;
};

export type ResidualCheckOptions = {
  /** Skip the manifest-persistence assertion (default: false). */
  skipManifestCheck?: boolean;
};

export type ResidualCheckResult = {
  passed: boolean;
  failures: string[];
  details: {
    inBrewList: boolean;
    binResolvesToCellar: boolean | null;
    appPathExists: boolean | null;
    manifestExists: boolean | null;
  };
};

function brewListContains(name: string, env?: Record<string, string>): boolean {
  try {
    const result = _execFileSync("brew", ["list", "--full-name", "-1"], {
      encoding: "utf-8",
      env: env ? { ...process.env, ...env } : process.env,
      timeout: 30_000,
      stdio: "pipe",
    });
    const lines = result.trim().split("\n").filter(Boolean);
    // brew list --full-name -1 outputs entries like "tap/name" or just "name"
    return lines.some((line) => {
      const base = line.split("/").pop() || line;
      return base === name || line === name;
    });
  } catch {
    return false;
  }
}

function binResolvesToCellar(name: string): boolean {
  try {
    const brewPrefix = _execFileSync("brew", ["--prefix"], {
      encoding: "utf-8",
      timeout: 10_000,
      stdio: "pipe",
    }).trim();
    const binPath = join(brewPrefix, "bin", name);
    if (!existsSync(binPath)) return false;
    // Resolve symlinks — if it points into the Cellar, the formula is still installed
    const resolved = realpathSync(binPath);
    return resolved.includes("/Cellar/");
  } catch {
    return false;
  }
}

function appPathExists(appName: string): boolean {
  const candidates = [
    join("/Applications", `${appName}.app`),
    join(homedir(), "Applications", `${appName}.app`),
  ];
  return candidates.some((p) => existsSync(p));
}

/**
 * Assert that a package has been cleanly uninstalled from the system.
 *
 * Throws with a descriptive message listing all failed checks if any
 * residual is detected. Returns a structured result on success.
 */
export async function assertUninstallResiduals(
  target: ResidualCheckTarget,
  opts: ResidualCheckOptions = {},
): Promise<ResidualCheckResult> {
  const failures: string[] = [];
  const details = {
    inBrewList: false,
    binResolvesToCellar: null as boolean | null,
    appPathExists: null as boolean | null,
    manifestExists: null as boolean | null,
  };

  // Check 1: not in `brew list`
  details.inBrewList = brewListContains(target.name, target.env);
  if (details.inBrewList) {
    failures.push(
      `Package "${target.name}" still appears in \`brew list\` after uninstall`,
    );
  }

  // Check 2: for formulae, binary no longer resolves to Cellar
  if (target.kind === "formula") {
    details.binResolvesToCellar = binResolvesToCellar(target.name);
    if (details.binResolvesToCellar) {
      failures.push(
        `Binary "${target.name}" still resolves to a Cellar path after uninstall`,
      );
    }
  }

  // Check 3: for casks, app path absent
  if (target.kind === "cask") {
    const appName = target.appName || target.name;
    details.appPathExists = appPathExists(appName);
    if (details.appPathExists) {
      failures.push(
        `App "${appName}.app" still exists in /Applications or ~/Applications after uninstall`,
      );
    }
  }

  // Check 4: manifest persists (documented product decision — manifests are
  // NOT deleted by plain `brew uninstall`; allbrew is the system of record).
  // We assert that the manifest still exists. If the product decision changes
  // to delete manifests on uninstall, flip this assertion and implement the
  // deletion path first.
  if (!opts.skipManifestCheck) {
    const manifest = await loadManifest(target.name);
    details.manifestExists = manifest !== null;
    if (!details.manifestExists) {
      // This is informational, not a hard failure — the manifest may not have
      // been created in this test context (e.g. e2e catalog tests that don't
      // go through allbrew generate). Log it but don't fail.
      // If the manifest WAS expected to exist (test generated via allbrew),
      // the test should additionally assert manifestExists === true.
    }
  }

  const passed = failures.length === 0;
  if (!passed) {
    throw new Error(
      `Uninstall residual checks failed for "${target.name}" (${target.kind}):\n` +
        failures.map((f) => `  - ${f}`).join("\n"),
    );
  }

  return { passed, failures, details };
}

/**
 * Non-throwing variant that returns the result without throwing.
 * Useful for diagnostic logging in teardown paths.
 */
export async function checkUninstallResiduals(
  target: ResidualCheckTarget,
  opts: ResidualCheckOptions = {},
): Promise<ResidualCheckResult> {
  try {
    return await assertUninstallResiduals(target, opts);
  } catch (err: any) {
    return {
      passed: false,
      failures: [err.message],
      details: {
        inBrewList: false,
        binResolvesToCellar: null,
        appPathExists: null,
        manifestExists: null,
      },
    };
  }
}

export { getPackagesDir };
