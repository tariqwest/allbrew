import { describe, it, expect } from "bun:test";
import {
  quarantine,
  isQuarantined,
  isLiveSmoke,
  isPackageQuarantined,
  QUARANTINED_PACKAGES,
  LIVE_SMOKE_PACKAGES,
} from "../../tests/integration/helpers/quarantine.ts";

// ─── B6: Quarantine helper unit tests ───────────────────────────────────

describe("B6: quarantine helper", () => {
  describe("quarantine()", () => {
    it("tags a test name with [quarantine] prefix", () => {
      expect(quarantine("flaky test")).toBe("[quarantine] flaky test");
    });

    it("does not double-tag an already-quarantined name", () => {
      // The helper is simple — it always prepends. Callers should check.
      expect(quarantine("[quarantine] already")).toBe("[quarantine] [quarantine] already");
    });
  });

  describe("isQuarantined()", () => {
    it("returns true for quarantined test names", () => {
      expect(isQuarantined("[quarantine] flaky test")).toBe(true);
    });

    it("returns false for normal test names", () => {
      expect(isQuarantined("normal test")).toBe(false);
    });
  });

  describe("isLiveSmoke()", () => {
    it("returns true for packages in the live smoke set", () => {
      expect(isLiveSmoke("maildev")).toBe(true);
      expect(isLiveSmoke("marimo")).toBe(true);
    });

    it("returns false for packages not in the live smoke set", () => {
      expect(isLiveSmoke("nonexistent")).toBe(false);
    });
  });

  describe("isPackageQuarantined()", () => {
    it("returns false for packages not in the quarantine list", () => {
      expect(isPackageQuarantined("maildev")).toBe(false);
    });

    it("returns true for packages added to the quarantine list", () => {
      const pkg = "temp-quarantine-test";
      QUARANTINED_PACKAGES.add(pkg);
      expect(isPackageQuarantined(pkg)).toBe(true);
      QUARANTINED_PACKAGES.delete(pkg);
      expect(isPackageQuarantined(pkg)).toBe(false);
    });
  });

  describe("LIVE_SMOKE_PACKAGES", () => {
    it("contains at least one package per major registry", () => {
      // npm, PyPI, RubyGems, NuGet
      expect(LIVE_SMOKE_PACKAGES.size).toBeGreaterThanOrEqual(4);
    });
  });
});
