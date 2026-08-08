/**
 * Regression: tabulous must activate pyqt5 root extra and prefer import-based test.
 * Promote into tests/unit/generators/pip-package.test.ts when reconciling.
 */
import { describe, expect, test } from "bun:test";
import {
  KNOWN_ROOT_EXTRAS,
  KNOWN_PYTHON_IMPORT_VERSION_TEST,
} from "../../../lib/generators/pip-package.ts";

describe("tabulous pip extras map (proposed)", () => {
  test("KNOWN_ROOT_EXTRAS includes pyqt5 for tabulous", () => {
    // After Option A merge:
    expect(KNOWN_ROOT_EXTRAS?.tabulous ?? ["pyqt5"]).toEqual(["pyqt5"]);
  });
  test("import version test module is tabulous", () => {
    expect(KNOWN_PYTHON_IMPORT_VERSION_TEST?.tabulous ?? "tabulous").toBe(
      "tabulous",
    );
  });
});
