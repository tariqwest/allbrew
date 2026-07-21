import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  E2E_TAP,
  setupTestContext,
  teardownTestContext,
  generateFormula,
  installFromTap,
  uninstallFromTap,
  verifyInstalled,
  brewUpdate,
  updateFormulas,
  mutateApp,
  resetAllFixtures,
  formulaVersion,
  canInstallApp,
  getFixtureApp,
  type TestContext,
} from "./helpers/setup.ts";
import {
  formulaPath,
  remoteHasFile,
  getLatestCommitMessage,
  getWorkHeadSha,
  getRemoteHeadSha,
} from "./helpers/tap.ts";
import { existsSync } from "node:fs";
import { saveManifest, deleteManifest, loadManifest } from "../../lib/manifest.ts";
import type { PackageManifest } from "../../lib/manifest.ts";
import { updateFormulas as updateFormulasDirect, type LivecheckEntry } from "../../lib/update-formulas.ts";

describe.skipIf(!E2E_TAP)("cross-cutting scenarios", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownTestContext(ctx);
  });

  it("multi-package update batch: 3 apps bumped in one update-formulas call", async () => {
    const apps = [
      { key: "fake-cli", app: getFixtureApp("fake-cli") },
      { key: "fake-src", app: getFixtureApp("fake-src") },
      { key: "fake-install", app: getFixtureApp("fake-install") },
    ];

    for (const { app } of apps) {
      const gen = generateFormula(ctx, app);
      expect(gen.code).toBe(0);
    }

    for (const { key } of apps) {
      await mutateApp(ctx, key, "2.0.0");
    }

    const entries: LivecheckEntry[] = apps.map(({ app }) => ({
      formula: app.name,
      version: { current: "1.0.0", latest: "2.0.0", outdated: true },
    }));

    const result = await updateFormulasDirect({
      entries,
      push: true,
    });

    expect(result.updated).toHaveLength(3);
    for (const { app } of apps) {
      expect(result.updated).toContain(app.name);
    }

    const commitMsg = getLatestCommitMessage(ctx.tap);
    expect(commitMsg).toContain("update");

    for (const { app } of apps) {
      const v = formulaVersion(ctx, app);
      expect(v).toBe("2.0.0");
      expect(remoteHasFile(ctx.tap, `Formula/${app.name}.rb`)).toBe(true);
    }

    const workSha = getWorkHeadSha(ctx.tap);
    const remoteSha = getRemoteHeadSha(ctx.tap);
    expect(remoteSha).toBe(workSha);

    await resetAllFixtures(ctx);
  });

  it("dry-run update: no commit, no push, but result.updated lists the name", async () => {
    const app = getFixtureApp("fake-cli");
    const gen = generateFormula(ctx, app);
    expect(gen.code).toBe(0);

    const shaBefore = getWorkHeadSha(ctx.tap);

    await mutateApp(ctx, "fake-cli", "3.0.0");

    const entries: LivecheckEntry[] = [
      { formula: app.name, version: { current: "1.0.0", latest: "3.0.0", outdated: true } },
    ];

    const result = await updateFormulasDirect({
      entries,
      dryRun: true,
    });

    expect(result.updated).toContain(app.name);

    const shaAfter = getWorkHeadSha(ctx.tap);
    expect(shaAfter).toBe(shaBefore);

    await resetAllFixtures(ctx);
  });

  it("no-op update: no outdated packages, no commit", async () => {
    const app = getFixtureApp("fake-cli");
    const gen = generateFormula(ctx, app);
    expect(gen.code).toBe(0);

    const shaBefore = getWorkHeadSha(ctx.tap);

    const entries: LivecheckEntry[] = [
      { formula: app.name, version: { current: "1.0.0", latest: "1.0.0", outdated: false } },
    ];

    const result = await updateFormulasDirect({
      entries,
    });

    expect(result.updated).toHaveLength(0);
    expect(result.skipped).toContain(app.name);

    const shaAfter = getWorkHeadSha(ctx.tap);
    expect(shaAfter).toBe(shaBefore);

    await resetAllFixtures(ctx);
  });

  it("error status skip: livecheck error entry is skipped", async () => {
    const app = getFixtureApp("fake-cli");
    const gen = generateFormula(ctx, app);
    expect(gen.code).toBe(0);

    const entries: LivecheckEntry[] = [
      { formula: app.name, status: "error", version: { current: "1.0.0", latest: "2.0.0", outdated: true } },
    ];

    const result = await updateFormulasDirect({
      entries,
    });

    expect(result.updated).not.toContain(app.name);
    expect(result.skipped).toContain(app.name);

    await resetAllFixtures(ctx);
  });

  it("manifest persistence: manifest saved after generate, updated after update", async () => {
    const app = getFixtureApp("fake-cli");
    const gen = generateFormula(ctx, app);
    expect(gen.code).toBe(0);

    const manifest = await loadManifest(app.name);
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe(app.name);
    expect(manifest!.generator).toBe("binary-release");
    expect(manifest!.recordedVersion).toBe("1.0.0");
    expect(manifest!.recordedAt).toBeTruthy();

    await mutateApp(ctx, "fake-cli", "2.0.0");

    const entries: LivecheckEntry[] = [
      { formula: app.name, version: { current: "1.0.0", latest: "2.0.0", outdated: true } },
    ];

    await updateFormulasDirect({ entries });

    const updatedManifest = await loadManifest(app.name);
    expect(updatedManifest).not.toBeNull();
    expect(updatedManifest!.recordedVersion).toBe("2.0.0");

    await deleteManifest(app.name);
    await resetAllFixtures(ctx);
  });

  it("unmanaged formula skip: formula without manifest is skipped", async () => {
    const app = getFixtureApp("fake-cli");
    const gen = generateFormula(ctx, app);
    expect(gen.code).toBe(0);

    await deleteManifest(app.name);

    const entries: LivecheckEntry[] = [
      { formula: app.name, version: { current: "1.0.0", latest: "2.0.0", outdated: true } },
    ];

    const result = await updateFormulasDirect({ entries });

    expect(result.updated).not.toContain(app.name);
    expect(result.skipped).toContain(app.name);

    await resetAllFixtures(ctx);
  });

  it("tap filter: packages from other taps are skipped", async () => {
    const app = getFixtureApp("fake-cli");
    const gen = generateFormula(ctx, app);
    expect(gen.code).toBe(0);

    const entries: LivecheckEntry[] = [
      { formula: app.name, version: { current: "1.0.0", latest: "2.0.0", outdated: true } },
    ];

    const result = await updateFormulasDirect({
      entries,
      dryRun: true,
      tapPath: "/some/other/tap/path",
    });

    expect(result.updated).not.toContain(app.name);
    expect(result.skipped).toContain(app.name);

    await resetAllFixtures(ctx);
  });

  it("commit message format: chore(allbrew): update <name>", async () => {
    const app = getFixtureApp("fake-cli");
    const gen = generateFormula(ctx, app);
    expect(gen.code).toBe(0);

    await mutateApp(ctx, "fake-cli", "2.0.0");

    const entries: LivecheckEntry[] = [
      { formula: app.name, version: { current: "1.0.0", latest: "2.0.0", outdated: true } },
    ];

    await updateFormulasDirect({ entries });

    const commitMsg = getLatestCommitMessage(ctx.tap);
    expect(commitMsg).toMatch(/^chore\(allbrew\): update/);
    expect(commitMsg).toContain(app.name);

    await resetAllFixtures(ctx);
  });

  it("push reaches remote: remote HEAD matches work HEAD", async () => {
    const app = getFixtureApp("fake-cli");
    const gen = generateFormula(ctx, app);
    expect(gen.code).toBe(0);

    await mutateApp(ctx, "fake-cli", "2.0.0");

    const entries: LivecheckEntry[] = [
      { formula: app.name, version: { current: "1.0.0", latest: "2.0.0", outdated: true } },
    ];

    await updateFormulasDirect({ entries, push: true });

    const workSha = getWorkHeadSha(ctx.tap);
    const remoteSha = getRemoteHeadSha(ctx.tap);
    expect(remoteSha).toBe(workSha);

    await resetAllFixtures(ctx);
  });
});
