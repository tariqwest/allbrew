import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  E2E_TAP,
  setupTestContext,
  teardownTestContext,
  generateFormula,
  installFromTap,
  uninstallFromTap,
  upgradeFromTap,
  verifyInstalled,
  brewUpdate,
  brewLivecheck,
  updateFormulas,
  mutateApp,
  resetAllFixtures,
  formulaVersion,
  canInstallApp,
  getFixtureApp,
  type TestContext,
} from "./helpers/setup.ts";
import { formulaPath, remoteHasFile, getWorkHeadSha, getRemoteHeadSha } from "./helpers/tap.ts";
import { existsSync } from "node:fs";

describe.skipIf(!E2E_TAP)("npm-package", () => {
  let ctx: TestContext;
  const app = getFixtureApp("fake-npm");

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownTestContext(ctx);
  });

  describe("generate", () => {
    it("should generate, commit, push, and install from tap", () => {
      const gen = generateFormula(ctx, app);
      expect(gen.code, `allbrew generation failed:\n${gen.stderr}`).toBe(0);

      const fpath = formulaPath(ctx.tap, app.name);
      expect(existsSync(fpath), `Formula file not found: ${fpath}`).toBe(true);

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Formula not pushed to remote",
      ).toBe(true);

      if (!canInstallApp(app)) {
        console.log("[skip] brew install — toolchain not available");
        return;
      }

      const install = installFromTap(ctx, app);
      expect(install.code, `brew install failed:\n${install.stdout}\n${install.stderr}`).toBe(0);

      const verify = verifyInstalled(ctx, app);
      expect(verify.code, `verify failed:\n${verify.stderr}`).toBe(0);
      expect(verify.stdout).toContain(app.version);

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code, `brew uninstall failed:\n${uninstall.stderr}`).toBe(0);
    });
  });

  describe("update", () => {
    it("should detect new version via livecheck, regenerate, push, and upgrade", () => {
      if (!canInstallApp(app)) {
        console.log("[skip] update test — toolchain not available");
        return;
      }

      const gen = generateFormula(ctx, app);
      expect(gen.code).toBe(0);

      const install = installFromTap(ctx, app);
      expect(install.code).toBe(0);

      const verifyV1 = verifyInstalled(ctx, app);
      expect(verifyV1.stdout).toContain("1.0.0");

      mutateApp(ctx, "fake-npm", "2.0.0");

      const lc = brewLivecheck(ctx, app);
      expect(lc.code).toBe(0);
      const lcData = JSON.parse(lc.stdout);
      const entry = lcData.find((e: any) => e.formula === `${ctx.tap.tapName}/${app.name}` || e.formula === app.name);
      expect(entry, "livecheck should find the formula").toBeTruthy();
      expect(entry.version?.latest).toBe("2.0.0");
      expect(entry.version?.outdated).toBe(true);

      const update = updateFormulas(ctx, [app.name]);
      expect(update.code, `update-formulas failed:\n${update.stderr}`).toBe(0);
      expect(update.stdout).toContain(app.name);

      const newVersion = formulaVersion(ctx, app);
      expect(newVersion).toBe("2.0.0");

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Updated formula not pushed to remote",
      ).toBe(true);

      const workSha = getWorkHeadSha(ctx.tap);
      const remoteSha = getRemoteHeadSha(ctx.tap);
      expect(remoteSha, "Remote should have the latest commit").toBe(workSha);

      const brewUpd = brewUpdate(ctx);
      expect(brewUpd.code).toBe(0);

      const upgrade = upgradeFromTap(ctx, app);
      expect(upgrade.code, `brew upgrade failed:\n${upgrade.stdout}\n${upgrade.stderr}`).toBe(0);

      const verifyV2 = verifyInstalled(ctx, app);
      expect(verifyV2.stdout).toContain("2.0.0");

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code).toBe(0);

      resetAllFixtures(ctx);
    });
  });
});

describe.skipIf(!E2E_TAP)("pip-package", () => {
  let ctx: TestContext;
  const app = getFixtureApp("fake-pip");

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownTestContext(ctx);
  });

  describe("generate", () => {
    it("should generate, commit, push, and install from tap", () => {
      const gen = generateFormula(ctx, app);
      expect(gen.code, `allbrew generation failed:\n${gen.stderr}`).toBe(0);

      const fpath = formulaPath(ctx.tap, app.name);
      expect(existsSync(fpath), `Formula file not found: ${fpath}`).toBe(true);

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Formula not pushed to remote",
      ).toBe(true);

      if (!canInstallApp(app)) {
        console.log("[skip] brew install — toolchain not available");
        return;
      }

      const install = installFromTap(ctx, app);
      expect(install.code, `brew install failed:\n${install.stdout}\n${install.stderr}`).toBe(0);

      const verify = verifyInstalled(ctx, app);
      expect(verify.code, `verify failed:\n${verify.stderr}`).toBe(0);
      expect(verify.stdout).toContain(app.version);

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code, `brew uninstall failed:\n${uninstall.stderr}`).toBe(0);
    });
  });

  describe("update", () => {
    it("should detect new version via livecheck, regenerate, push, and upgrade", () => {
      if (!canInstallApp(app)) {
        console.log("[skip] update test — toolchain not available");
        return;
      }

      const gen = generateFormula(ctx, app);
      expect(gen.code).toBe(0);

      const install = installFromTap(ctx, app);
      expect(install.code).toBe(0);

      const verifyV1 = verifyInstalled(ctx, app);
      expect(verifyV1.stdout).toContain("1.0.0");

      mutateApp(ctx, "fake-pip", "2.0.0");

      const lc = brewLivecheck(ctx, app);
      expect(lc.code).toBe(0);
      const lcData = JSON.parse(lc.stdout);
      const entry = lcData.find((e: any) => e.formula === `${ctx.tap.tapName}/${app.name}` || e.formula === app.name);
      expect(entry, "livecheck should find the formula").toBeTruthy();
      expect(entry.version?.latest).toBe("2.0.0");
      expect(entry.version?.outdated).toBe(true);

      const update = updateFormulas(ctx, [app.name]);
      expect(update.code, `update-formulas failed:\n${update.stderr}`).toBe(0);
      expect(update.stdout).toContain(app.name);

      const newVersion = formulaVersion(ctx, app);
      expect(newVersion).toBe("2.0.0");

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Updated formula not pushed to remote",
      ).toBe(true);

      const workSha = getWorkHeadSha(ctx.tap);
      const remoteSha = getRemoteHeadSha(ctx.tap);
      expect(remoteSha, "Remote should have the latest commit").toBe(workSha);

      const brewUpd = brewUpdate(ctx);
      expect(brewUpd.code).toBe(0);

      const upgrade = upgradeFromTap(ctx, app);
      expect(upgrade.code, `brew upgrade failed:\n${upgrade.stdout}\n${upgrade.stderr}`).toBe(0);

      const verifyV2 = verifyInstalled(ctx, app);
      expect(verifyV2.stdout).toContain("2.0.0");

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code).toBe(0);

      resetAllFixtures(ctx);
    });
  });
});

describe.skipIf(!E2E_TAP)("cargo-package", () => {
  let ctx: TestContext;
  const app = getFixtureApp("fake-cargo");

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownTestContext(ctx);
  });

  describe("generate", () => {
    it("should generate, commit, push, and install from tap", () => {
      const gen = generateFormula(ctx, app);
      expect(gen.code, `allbrew generation failed:\n${gen.stderr}`).toBe(0);

      const fpath = formulaPath(ctx.tap, app.name);
      expect(existsSync(fpath), `Formula file not found: ${fpath}`).toBe(true);

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Formula not pushed to remote",
      ).toBe(true);

      if (!canInstallApp(app)) {
        console.log("[skip] brew install — toolchain not available");
        return;
      }

      const install = installFromTap(ctx, app);
      expect(install.code, `brew install failed:\n${install.stdout}\n${install.stderr}`).toBe(0);

      const verify = verifyInstalled(ctx, app);
      expect(verify.code, `verify failed:\n${verify.stderr}`).toBe(0);
      expect(verify.stdout).toContain(app.version);

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code, `brew uninstall failed:\n${uninstall.stderr}`).toBe(0);
    });
  });

  describe("update", () => {
    it("should detect new version via livecheck, regenerate, push, and upgrade", () => {
      if (!canInstallApp(app)) {
        console.log("[skip] update test — toolchain not available");
        return;
      }

      const gen = generateFormula(ctx, app);
      expect(gen.code).toBe(0);

      const install = installFromTap(ctx, app);
      expect(install.code).toBe(0);

      const verifyV1 = verifyInstalled(ctx, app);
      expect(verifyV1.stdout).toContain("1.0.0");

      mutateApp(ctx, "fake-cargo", "2.0.0");

      const lc = brewLivecheck(ctx, app);
      expect(lc.code).toBe(0);
      const lcData = JSON.parse(lc.stdout);
      const entry = lcData.find((e: any) => e.formula === `${ctx.tap.tapName}/${app.name}` || e.formula === app.name);
      expect(entry, "livecheck should find the formula").toBeTruthy();
      expect(entry.version?.latest).toBe("2.0.0");
      expect(entry.version?.outdated).toBe(true);

      const update = updateFormulas(ctx, [app.name]);
      expect(update.code, `update-formulas failed:\n${update.stderr}`).toBe(0);
      expect(update.stdout).toContain(app.name);

      const newVersion = formulaVersion(ctx, app);
      expect(newVersion).toBe("2.0.0");

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Updated formula not pushed to remote",
      ).toBe(true);

      const workSha = getWorkHeadSha(ctx.tap);
      const remoteSha = getRemoteHeadSha(ctx.tap);
      expect(remoteSha, "Remote should have the latest commit").toBe(workSha);

      const brewUpd = brewUpdate(ctx);
      expect(brewUpd.code).toBe(0);

      const upgrade = upgradeFromTap(ctx, app);
      expect(upgrade.code, `brew upgrade failed:\n${upgrade.stdout}\n${upgrade.stderr}`).toBe(0);

      const verifyV2 = verifyInstalled(ctx, app);
      expect(verifyV2.stdout).toContain("2.0.0");

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code).toBe(0);

      resetAllFixtures(ctx);
    });
  });
});

describe.skipIf(!E2E_TAP)("go-package", () => {
  let ctx: TestContext;
  const app = getFixtureApp("fake-go");

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownTestContext(ctx);
  });

  describe("generate", () => {
    it("should generate, commit, push, and install from tap", () => {
      const gen = generateFormula(ctx, app);
      expect(gen.code, `allbrew generation failed:\n${gen.stderr}`).toBe(0);

      const fpath = formulaPath(ctx.tap, app.name);
      expect(existsSync(fpath), `Formula file not found: ${fpath}`).toBe(true);

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Formula not pushed to remote",
      ).toBe(true);

      if (!canInstallApp(app)) {
        console.log("[skip] brew install — toolchain not available");
        return;
      }

      const install = installFromTap(ctx, app);
      expect(install.code, `brew install failed:\n${install.stdout}\n${install.stderr}`).toBe(0);

      const verify = verifyInstalled(ctx, app);
      expect(verify.code, `verify failed:\n${verify.stderr}`).toBe(0);
      expect(verify.stdout).toContain(app.version);

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code, `brew uninstall failed:\n${uninstall.stderr}`).toBe(0);
    });
  });

  describe("update", () => {
    it("should detect new version via livecheck, regenerate, push, and upgrade", () => {
      if (!canInstallApp(app)) {
        console.log("[skip] update test — toolchain not available");
        return;
      }

      const gen = generateFormula(ctx, app);
      expect(gen.code).toBe(0);

      const install = installFromTap(ctx, app);
      expect(install.code).toBe(0);

      const verifyV1 = verifyInstalled(ctx, app);
      expect(verifyV1.stdout).toContain("1.0.0");

      mutateApp(ctx, "fake-go", "2.0.0");

      const lc = brewLivecheck(ctx, app);
      expect(lc.code).toBe(0);
      const lcData = JSON.parse(lc.stdout);
      const entry = lcData.find((e: any) => e.formula === `${ctx.tap.tapName}/${app.name}` || e.formula === app.name);
      expect(entry, "livecheck should find the formula").toBeTruthy();
      expect(entry.version?.latest).toBe("2.0.0");
      expect(entry.version?.outdated).toBe(true);

      const update = updateFormulas(ctx, [app.name]);
      expect(update.code, `update-formulas failed:\n${update.stderr}`).toBe(0);
      expect(update.stdout).toContain(app.name);

      const newVersion = formulaVersion(ctx, app);
      expect(newVersion).toBe("2.0.0");

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Updated formula not pushed to remote",
      ).toBe(true);

      const workSha = getWorkHeadSha(ctx.tap);
      const remoteSha = getRemoteHeadSha(ctx.tap);
      expect(remoteSha, "Remote should have the latest commit").toBe(workSha);

      const brewUpd = brewUpdate(ctx);
      expect(brewUpd.code).toBe(0);

      const upgrade = upgradeFromTap(ctx, app);
      expect(upgrade.code, `brew upgrade failed:\n${upgrade.stdout}\n${upgrade.stderr}`).toBe(0);

      const verifyV2 = verifyInstalled(ctx, app);
      expect(verifyV2.stdout).toContain("2.0.0");

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code).toBe(0);

      resetAllFixtures(ctx);
    });
  });
});

describe.skipIf(!E2E_TAP)("gem-package", () => {
  let ctx: TestContext;
  const app = getFixtureApp("fake-gem");

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownTestContext(ctx);
  });

  describe("generate", () => {
    it("should generate, commit, push, and install from tap", () => {
      const gen = generateFormula(ctx, app);
      expect(gen.code, `allbrew generation failed:\n${gen.stderr}`).toBe(0);

      const fpath = formulaPath(ctx.tap, app.name);
      expect(existsSync(fpath), `Formula file not found: ${fpath}`).toBe(true);

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Formula not pushed to remote",
      ).toBe(true);

      if (!canInstallApp(app)) {
        console.log("[skip] brew install — toolchain not available");
        return;
      }

      const install = installFromTap(ctx, app);
      expect(install.code, `brew install failed:\n${install.stdout}\n${install.stderr}`).toBe(0);

      const verify = verifyInstalled(ctx, app);
      expect(verify.code, `verify failed:\n${verify.stderr}`).toBe(0);
      expect(verify.stdout).toContain(app.version);

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code, `brew uninstall failed:\n${uninstall.stderr}`).toBe(0);
    });
  });

  describe("update", () => {
    it("should detect new version via livecheck, regenerate, push, and upgrade", () => {
      if (!canInstallApp(app)) {
        console.log("[skip] update test — toolchain not available");
        return;
      }

      const gen = generateFormula(ctx, app);
      expect(gen.code).toBe(0);

      const install = installFromTap(ctx, app);
      expect(install.code).toBe(0);

      const verifyV1 = verifyInstalled(ctx, app);
      expect(verifyV1.stdout).toContain("1.0.0");

      mutateApp(ctx, "fake-gem", "2.0.0");

      const lc = brewLivecheck(ctx, app);
      expect(lc.code).toBe(0);
      const lcData = JSON.parse(lc.stdout);
      const entry = lcData.find((e: any) => e.formula === `${ctx.tap.tapName}/${app.name}` || e.formula === app.name);
      expect(entry, "livecheck should find the formula").toBeTruthy();
      expect(entry.version?.latest).toBe("2.0.0");
      expect(entry.version?.outdated).toBe(true);

      const update = updateFormulas(ctx, [app.name]);
      expect(update.code, `update-formulas failed:\n${update.stderr}`).toBe(0);
      expect(update.stdout).toContain(app.name);

      const newVersion = formulaVersion(ctx, app);
      expect(newVersion).toBe("2.0.0");

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Updated formula not pushed to remote",
      ).toBe(true);

      const workSha = getWorkHeadSha(ctx.tap);
      const remoteSha = getRemoteHeadSha(ctx.tap);
      expect(remoteSha, "Remote should have the latest commit").toBe(workSha);

      const brewUpd = brewUpdate(ctx);
      expect(brewUpd.code).toBe(0);

      const upgrade = upgradeFromTap(ctx, app);
      expect(upgrade.code, `brew upgrade failed:\n${upgrade.stdout}\n${upgrade.stderr}`).toBe(0);

      const verifyV2 = verifyInstalled(ctx, app);
      expect(verifyV2.stdout).toContain("2.0.0");

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code).toBe(0);

      resetAllFixtures(ctx);
    });
  });
});

describe.skipIf(!E2E_TAP)("dotnet-package", () => {
  let ctx: TestContext;
  const app = getFixtureApp("fake-dotnet");

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    if (ctx) await teardownTestContext(ctx);
  });

  describe("generate", () => {
    it("should generate, commit, push, and install from tap", () => {
      const gen = generateFormula(ctx, app);
      expect(gen.code, `allbrew generation failed:\n${gen.stderr}`).toBe(0);

      const fpath = formulaPath(ctx.tap, app.name);
      expect(existsSync(fpath), `Formula file not found: ${fpath}`).toBe(true);

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Formula not pushed to remote",
      ).toBe(true);

      if (!canInstallApp(app)) {
        console.log("[skip] brew install — toolchain not available");
        return;
      }

      const install = installFromTap(ctx, app);
      expect(install.code, `brew install failed:\n${install.stdout}\n${install.stderr}`).toBe(0);

      const verify = verifyInstalled(ctx, app);
      expect(verify.code, `verify failed:\n${verify.stderr}`).toBe(0);
      expect(verify.stdout).toContain(app.version);

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code, `brew uninstall failed:\n${uninstall.stderr}`).toBe(0);
    });
  });

  describe("update", () => {
    it("should detect new version via livecheck, regenerate, push, and upgrade", () => {
      if (!canInstallApp(app)) {
        console.log("[skip] update test — toolchain not available");
        return;
      }

      const gen = generateFormula(ctx, app);
      expect(gen.code).toBe(0);

      const install = installFromTap(ctx, app);
      expect(install.code).toBe(0);

      const verifyV1 = verifyInstalled(ctx, app);
      expect(verifyV1.stdout).toContain("1.0.0");

      mutateApp(ctx, "fake-dotnet", "2.0.0");

      const lc = brewLivecheck(ctx, app);
      expect(lc.code).toBe(0);
      const lcData = JSON.parse(lc.stdout);
      const entry = lcData.find((e: any) => e.formula === `${ctx.tap.tapName}/${app.name}` || e.formula === app.name);
      expect(entry, "livecheck should find the formula").toBeTruthy();
      expect(entry.version?.latest).toBe("2.0.0");
      expect(entry.version?.outdated).toBe(true);

      const update = updateFormulas(ctx, [app.name]);
      expect(update.code, `update-formulas failed:\n${update.stderr}`).toBe(0);
      expect(update.stdout).toContain(app.name);

      const newVersion = formulaVersion(ctx, app);
      expect(newVersion).toBe("2.0.0");

      expect(
        remoteHasFile(ctx.tap, `Formula/${app.name}.rb`),
        "Updated formula not pushed to remote",
      ).toBe(true);

      const workSha = getWorkHeadSha(ctx.tap);
      const remoteSha = getRemoteHeadSha(ctx.tap);
      expect(remoteSha, "Remote should have the latest commit").toBe(workSha);

      const brewUpd = brewUpdate(ctx);
      expect(brewUpd.code).toBe(0);

      const upgrade = upgradeFromTap(ctx, app);
      expect(upgrade.code, `brew upgrade failed:\n${upgrade.stdout}\n${upgrade.stderr}`).toBe(0);

      const verifyV2 = verifyInstalled(ctx, app);
      expect(verifyV2.stdout).toContain("2.0.0");

      const uninstall = uninstallFromTap(ctx, app);
      expect(uninstall.code).toBe(0);

      resetAllFixtures(ctx);
    });
  });
});
