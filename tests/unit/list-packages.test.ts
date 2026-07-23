import { describe, it, expect } from "bun:test";
import {
  formatPackageList,
  toPackageListRow,
} from "../../lib/list-packages.ts";
import type { PackageManifest } from "../../lib/manifest.ts";

function manifest(overrides: Partial<PackageManifest> = {}): PackageManifest {
  return {
    name: "maildev",
    kind: "formula",
    generator: "npm-package",
    tapPath: "/Users/x/homebrew-mytapp",
    source: {},
    options: {},
    recordedVersion: "2.2.1",
    recordedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("list-packages: toPackageListRow", () => {
  it("maps manifest fields to display row", () => {
    const row = toPackageListRow(manifest());
    expect(row).toEqual({
      name: "maildev",
      kind: "formula",
      generator: "npm-package",
      version: "2.2.1",
      recordedAt: "2026-07-01T00:00:00.000Z",
      tapPath: "/Users/x/homebrew-mytapp",
    });
  });

  it("falls back to '?' for missing version/date/tap", () => {
    const row = toPackageListRow(
      manifest({ recordedVersion: "", recordedAt: "", tapPath: "" }),
    );
    expect(row.version).toBe("?");
    expect(row.recordedAt).toBe("?");
    expect(row.tapPath).toBe("?");
  });
});

describe("list-packages: formatPackageList", () => {
  it("returns [] for no packages", () => {
    expect(formatPackageList([])).toEqual([]);
  });

  it("renders a header plus one aligned row per package, sorted by name", () => {
    const lines = formatPackageList([
      manifest({ name: "zoxide", generator: "binary-release", recordedVersion: "0.9.8" }),
      manifest({ name: "maildev" }),
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^NAME\s+KIND\s+GENERATOR\s+VERSION\s+RECORDED$/);
    expect(lines[1]).toStartWith("maildev");
    expect(lines[2]).toStartWith("zoxide");
    expect(lines[1]).toContain("npm-package");
    expect(lines[2]).toContain("binary-release");
    // Columns align: KIND starts at the same index in every line.
    const kindIdx = lines[0].indexOf("KIND");
    expect(lines[1].slice(kindIdx)).toStartWith("formula");
    expect(lines[2].slice(kindIdx)).toStartWith("formula");
  });

  it("renders cask kind and versions", () => {
    const lines = formatPackageList([
      manifest({ name: "rectangle", kind: "cask", generator: "cask-app-release", recordedVersion: "0.99" }),
    ]);
    expect(lines[1]).toContain("cask");
    expect(lines[1]).toContain("0.99");
  });
});
