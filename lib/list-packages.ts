import type { PackageManifest } from "./manifest.ts";
import { listManifests } from "./manifest.ts";

export type PackageListRow = {
  name: string;
  kind: string;
  generator: string;
  version: string;
  recordedAt: string;
  tapPath: string;
};

export function toPackageListRow(manifest: PackageManifest): PackageListRow {
  return {
    name: manifest.name,
    kind: manifest.kind,
    generator: manifest.generator,
    version: manifest.recordedVersion || "?",
    recordedAt: manifest.recordedAt || "?",
    tapPath: manifest.tapPath || "?",
  };
}

/**
 * Render manifests as aligned plain-text table lines (header + one row per
 * package), sorted by name. Returns [] when there are no packages.
 */
export function formatPackageList(manifests: PackageManifest[]): string[] {
  if (manifests.length === 0) return [];
  const rows = manifests
    .map(toPackageListRow)
    .sort((a, b) => a.name.localeCompare(b.name));
  const header = { name: "NAME", kind: "KIND", generator: "GENERATOR", version: "VERSION", recordedAt: "RECORDED" };
  const widths = {
    name: Math.max(header.name.length, ...rows.map((r) => r.name.length)),
    kind: Math.max(header.kind.length, ...rows.map((r) => r.kind.length)),
    generator: Math.max(header.generator.length, ...rows.map((r) => r.generator.length)),
    version: Math.max(header.version.length, ...rows.map((r) => r.version.length)),
  };
  const line = (r: { name: string; kind: string; generator: string; version: string; recordedAt: string }) =>
    [
      r.name.padEnd(widths.name),
      r.kind.padEnd(widths.kind),
      r.generator.padEnd(widths.generator),
      r.version.padEnd(widths.version),
      r.recordedAt,
    ].join("  ");
  return [line(header), ...rows.map(line)];
}

/**
 * List all managed packages. Separated from the CLI action for testability.
 */
export async function listPackages(): Promise<PackageManifest[]> {
  return await listManifests();
}
