import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertUninstallResiduals,
  checkUninstallResiduals,
  _setExecFileSyncForTesting,
  type ResidualCheckTarget,
} from "../helpers/uninstall-residuals.ts";
import { _setConfigDirForTesting } from "../../lib/config.ts";
import { saveManifest, type PackageManifest } from "../../lib/manifest.ts";

// ─── A2: uninstall residual helper unit tests ───────────────────────────
// Tests the residual helper logic with an injected execFileSync so no real
// brew calls are made. Verifies:
//   - brew list check (formula and cask)
//   - bin Cellar resolution check (formula)
//   - app path check (cask)
//   - manifest persistence assertion (manifests persist per A2 decision)
//   - non-throwing variant

let testConfigDir: string;

beforeEach(async () => {
  testConfigDir = await mkdtemp(join(tmpdir(), "allbrew-residual-test-"));
  _setConfigDirForTesting(testConfigDir);
});

afterEach(async () => {
  await rm(testConfigDir, { recursive: true, force: true }).catch(() => {});
  _setExecFileSyncForTesting(undefined as any);
});

function mockExec(replies: Record<string, (args: string[]) => string>) {
  return ((cmd: string, args: string[]) => {
    const key = args[0] || "";
    if (replies[key]) return replies[key](args);
    return "";
  }) as any;
}

function makeManifest(name: string, kind: "formula" | "cask" = "formula"): PackageManifest {
  return {
    name,
    kind,
    generator: "binary-release",
    tapPath: "/tmp/tap",
    source: {},
    options: {},
    recordedVersion: "1.0.0",
    recordedAt: new Date().toISOString(),
  };
}

describe("assertUninstallResiduals — formula", () => {
  it("passes when package is not in brew list, bin is gone, and manifest persists", async () => {
    await saveManifest(makeManifest("foo"));
    _setExecFileSyncForTesting(mockExec({
      list: () => "other-pkg\nanother-pkg\n",
      "--prefix": () => "/opt/homebrew\n",
    }));

    const result = await assertUninstallResiduals({ name: "foo", kind: "formula" });
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.details.inBrewList).toBe(false);
    expect(result.details.binResolvesToCellar).toBe(false);
    expect(result.details.manifestExists).toBe(true);
  });

  it("fails when package is still in brew list", async () => {
    await saveManifest(makeManifest("foo"));
    _setExecFileSyncForTesting(mockExec({
      list: () => "tap/foo\nother-pkg\n",
      "--prefix": () => "/opt/homebrew\n",
    }));

    await expect(
      assertUninstallResiduals({ name: "foo", kind: "formula" }),
    ).rejects.toThrow(/still appears in .brew list./);
  });

  it("fails when binary still resolves to Cellar", async () => {
    await saveManifest(makeManifest("foo"));
    // Create a fake Cellar symlink
    const fakePrefix = await mkdtemp(join(tmpdir(), "brew-prefix-"));
    const fakeCellarBin = join(fakePrefix, "Cellar", "foo", "1.0.0", "bin", "foo");
    await mkdir(join(fakeCellarBin, ".."), { recursive: true });
    await writeFile(fakeCellarBin, "fake bin", { mode: 0o755 });
    const fakeBinDir = join(fakePrefix, "bin");
    await mkdir(fakeBinDir, { recursive: true });
    await symlink(fakeCellarBin, join(fakeBinDir, "foo"));

    _setExecFileSyncForTesting(mockExec({
      list: () => "other-pkg\n",
      "--prefix": () => `${fakePrefix}\n`,
    }));

    try {
      await expect(
        assertUninstallResiduals({ name: "foo", kind: "formula" }),
      ).rejects.toThrow(/still resolves to a Cellar path/);
    } finally {
      await rm(fakePrefix, { recursive: true, force: true });
    }
  });

  it("passes when binary is gone (not in bin dir)", async () => {
    await saveManifest(makeManifest("foo"));
    const fakePrefix = await mkdtemp(join(tmpdir(), "brew-prefix-"));
    _setExecFileSyncForTesting(mockExec({
      list: () => "other-pkg\n",
      "--prefix": () => `${fakePrefix}\n`,
    }));

    try {
      const result = await assertUninstallResiduals({ name: "foo", kind: "formula" });
      expect(result.passed).toBe(true);
      expect(result.details.binResolvesToCellar).toBe(false);
    } finally {
      await rm(fakePrefix, { recursive: true, force: true });
    }
  });
});

describe("assertUninstallResiduals — cask", () => {
  it("passes when package is not in brew list and app path is absent", async () => {
    await saveManifest(makeManifest("bar", "cask"));
    _setExecFileSyncForTesting(mockExec({
      list: () => "other-pkg\n",
    }));

    const result = await assertUninstallResiduals({
      name: "bar",
      kind: "cask",
      appName: "NonExistentApp",
    });
    expect(result.passed).toBe(true);
    expect(result.details.appPathExists).toBe(false);
    expect(result.details.binResolvesToCellar).toBeNull();
  });

  it("does not check bin resolution for casks", async () => {
    await saveManifest(makeManifest("bar", "cask"));
    _setExecFileSyncForTesting(mockExec({
      list: () => "other-pkg\n",
    }));

    const result = await assertUninstallResiduals({
      name: "bar",
      kind: "cask",
      appName: "NonExistentApp",
    });
    expect(result.details.binResolvesToCellar).toBeNull();
  });
});

describe("assertUninstallResiduals — manifest persistence", () => {
  it("does not fail when manifest is absent (informational only)", async () => {
    _setExecFileSyncForTesting(mockExec({
      list: () => "other-pkg\n",
      "--prefix": () => "/opt/homebrew\n",
    }));

    const result = await assertUninstallResiduals({ name: "no-manifest", kind: "formula" });
    expect(result.passed).toBe(true);
    expect(result.details.manifestExists).toBe(false);
  });

  it("skipManifestCheck=true skips the manifest check", async () => {
    _setExecFileSyncForTesting(mockExec({
      list: () => "other-pkg\n",
      "--prefix": () => "/opt/homebrew\n",
    }));

    const result = await assertUninstallResiduals(
      { name: "foo", kind: "formula" },
      { skipManifestCheck: true },
    );
    expect(result.passed).toBe(true);
    expect(result.details.manifestExists).toBeNull();
  });

  it("manifest persists when saved (allbrew is system of record)", async () => {
    await saveManifest(makeManifest("foo"));
    _setExecFileSyncForTesting(mockExec({
      list: () => "other-pkg\n",
      "--prefix": () => "/opt/homebrew\n",
    }));

    const result = await assertUninstallResiduals({ name: "foo", kind: "formula" });
    expect(result.details.manifestExists).toBe(true);
    // Per A2 decision: manifests persist after brew uninstall. The helper
    // does NOT assert manifestGone. This test documents that the manifest
    // is still present, which is the expected product behavior.
  });
});

describe("checkUninstallResiduals — non-throwing variant", () => {
  it("returns a failed result instead of throwing", async () => {
    await saveManifest(makeManifest("foo"));
    _setExecFileSyncForTesting(mockExec({
      list: () => "tap/foo\n",
      "--prefix": () => "/opt/homebrew\n",
    }));

    const result = await checkUninstallResiduals({ name: "foo", kind: "formula" });
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it("returns a passed result on success", async () => {
    await saveManifest(makeManifest("foo"));
    _setExecFileSyncForTesting(mockExec({
      list: () => "other-pkg\n",
      "--prefix": () => "/opt/homebrew\n",
    }));

    const result = await checkUninstallResiduals({ name: "foo", kind: "formula" });
    expect(result.passed).toBe(true);
  });
});
