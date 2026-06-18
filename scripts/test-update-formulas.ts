#!/usr/bin/env bun

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  updateFormulas,
  type LivecheckEntry,
} from "../lib/update-formulas.ts";
import { saveManifest, deleteManifest } from "../lib/manifest.ts";
import type { PackageManifest } from "../lib/manifest.ts";

const TEST_NAMES = [
  "allbrew-test-managed-a",
  "allbrew-test-managed-b",
  "allbrew-test-managed-c",
];

async function seedManifest(
  name: string,
  tapPath: string,
): Promise<PackageManifest> {
  const manifest: PackageManifest = {
    name,
    kind: "formula",
    generator: "npm-package",
    tapPath,
    source: { packageName: name },
    options: {},
    recordedVersion: "1.0.0",
    recordedAt: new Date().toISOString(),
  };
  await saveManifest(manifest);
  return manifest;
}

function fixtureEntries(): LivecheckEntry[] {
  return [
    {
      formula: "allbrew-test-managed-a",
      version: { current: "1.0.0", latest: "2.0.0", outdated: true },
    },
    {
      formula: "allbrew-test-managed-b",
      version: { current: "1.0.0", latest: "1.0.0", outdated: false },
    },
    {
      formula: "allbrew-test-managed-c",
      status: "error",
      version: { current: "1.0.0", latest: "2.0.0", outdated: true },
    },
    {
      formula: "allbrew-test-unmanaged",
      version: { current: "1.0.0", latest: "9.0.0", outdated: true },
    },
  ];
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tapPath = await mkdtemp(join(tmpdir(), "allbrew-tap-"));
  let failures = 0;

  try {
    await seedManifest("allbrew-test-managed-a", tapPath);
    await seedManifest("allbrew-test-managed-b", tapPath);
    await seedManifest("allbrew-test-managed-c", tapPath);

    const entries = fixtureEntries();

    const dryRun = await updateFormulas({ entries, dryRun: true });
    assert(
      dryRun.updated.includes("allbrew-test-managed-a"),
      "dry-run should mark outdated managed package as updated",
    );
    assert(
      dryRun.skipped.includes("allbrew-test-managed-b"),
      "current package should be skipped",
    );
    assert(
      dryRun.skipped.includes("allbrew-test-managed-c"),
      "error status should be skipped",
    );
    assert(
      dryRun.skipped.includes("allbrew-test-unmanaged"),
      "package without manifest should be skipped",
    );
    console.log("OK   dry-run filtering");

    const nameFilter = await updateFormulas({
      entries,
      dryRun: true,
      names: ["allbrew-test-managed-a"],
    });
    assert(
      nameFilter.updated.length === 1 &&
        nameFilter.updated[0] === "allbrew-test-managed-a",
      "name filter should limit updates",
    );
    console.log("OK   name filter");

    const otherTap = await mkdtemp(join(tmpdir(), "allbrew-tap-other-"));
    const tapFilter = await updateFormulas({
      entries,
      dryRun: true,
      tapPath: otherTap,
    });
    assert(
      tapFilter.updated.length === 0 &&
        tapFilter.skipped.includes("allbrew-test-managed-a"),
      "tap filter should skip packages from other taps",
    );
    await rm(otherTap, { recursive: true, force: true });
    console.log("OK   tap filter");
  } catch (err) {
    console.error("FAIL", err instanceof Error ? err.message : err);
    failures++;
  } finally {
    for (const name of TEST_NAMES) {
      await deleteManifest(name);
    }
    await rm(tapPath, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`${failures} update-formulas test failure(s)`);
    process.exit(1);
  }
}

main();
