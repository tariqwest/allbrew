import { describe, it, expect } from "bun:test";
import { classify } from "../../lib/classifier.ts";
import {
  expectedClassifierType,
  loadGroundTruthOverrides,
  groundTruthAgrees,
} from "../helpers/classifier-ground-truth.ts";
import {
  materializeFromTable,
  materializeSeeds,
  DEFAULT_TEST_CASES_TABLE,
  type MaterializedLocation,
} from "../helpers/test-case-locations.ts";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const OVERRIDES = loadGroundTruthOverrides();

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../fixtures/classifier-validation",
);

describe("expectedClassifierType (manual ground truth)", () => {
  it("loads curated overrides", () => {
    expect(Object.keys(OVERRIDES.overrides).length).toBeGreaterThan(0);
    expect(OVERRIDES.overrides["https://sh.rustup.rs"]?.expected_type).toBe(
      "bash-script",
    );
  });

  it("npm registry host → npm-package", () => {
    const e = expectedClassifierType(
      "in_npm",
      "https://www.npmjs.com/package/maildev",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("npm-package");
    expect(e.basis).toBe("url-shape");
  });

  it("pypi host → pip-package", () => {
    const e = expectedClassifierType(
      "in_pip",
      "https://pypi.org/project/marimo/",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("pip-package");
  });

  it("crates.io → cargo-package", () => {
    const e = expectedClassifierType(
      "in_cargo",
      "https://crates.io/crates/ripgrep",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("cargo-package");
  });

  it("github-shaped cargo cell → github-repo", () => {
    const e = expectedClassifierType(
      "in_cargo",
      "https://github.com/TaKO8Ki/gobang",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("github-repo");
    expect(e.basis).toBe("url-shape");
  });

  it("go_mod github → github-repo", () => {
    const e = expectedClassifierType(
      "in_go_mod",
      "https://github.com/F1bonacc1/process-compose",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("github-repo");
  });

  it("MAS host → mac-app-store", () => {
    const e = expectedClassifierType(
      "in_mas",
      "https://apps.apple.com/us/app/bear/id1091189122",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("mac-app-store");
  });

  it("Setapp host → setapp-app", () => {
    const e = expectedClassifierType(
      "in_setapp",
      "https://setapp.com/apps/bartender",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("setapp-app");
    expect(e.expected_fields?.slug).toBe("bartender");
  });

  it(".dmg URL → cask-dmg even from seed", () => {
    const e = expectedClassifierType(
      "seed",
      "https://proxyman.io/release/osx/Proxyman_latest.dmg",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("cask-dmg");
    expect(e.basis).toBe("url-shape");
  });

  it(".sh install → bash-script", () => {
    const e = expectedClassifierType(
      "has_script_install",
      "https://starship.rs/install.sh",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("bash-script");
  });

  it("extensionless script host uses override or column", () => {
    const e = expectedClassifierType(
      "has_script_install",
      "https://sh.rustup.rs",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("bash-script");
    expect(["override", "column+url"]).toContain(e.basis);
  });

  it("dev website bare domain → unknown offline", () => {
    const e = expectedClassifierType(
      "in_dev_website",
      "https://electrum.org",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("unknown");
    expect(e.basis).toBe("column");
  });

  it("github release .dmg → cask-dmg not github-repo", () => {
    const e = expectedClassifierType(
      "seed",
      "https://github.com/webstonehq/seaquel/releases/download/v2026.4.8/Seaquel_2026.4.8_aarch64.dmg",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("cask-dmg");
  });

  it("github tree URL → github-repo", () => {
    const e = expectedClassifierType(
      "seed",
      "https://github.com/muety/wakapi/tree/master/src",
      OVERRIDES,
    );
    expect(e.expected_type).toBe("github-repo");
    expect(e.expected_fields?.repo).toBe("wakapi");
  });
});

describe("full test-case table vs manual ground truth", () => {
  it("every materializable location has a ground-truth expectation", async () => {
    if (!existsSync(DEFAULT_TEST_CASES_TABLE)) {
      console.warn("skip: test-cases table missing");
      return;
    }
    const { locations } = await materializeFromTable(DEFAULT_TEST_CASES_TABLE);
    expect(locations.length).toBeGreaterThan(100);

    for (const loc of locations) {
      const gt = expectedClassifierType(
        loc.source_column,
        loc.url,
        OVERRIDES,
      );
      expect(typeof gt.expected_type).toBe("string");
      expect(gt.expected_type.length).toBeGreaterThan(0);
      expect(typeof gt.rationale).toBe("string");
    }
  });

  it("registry / store / github columns agree with classify offline", async () => {
    if (!existsSync(DEFAULT_TEST_CASES_TABLE)) return;
    const { locations } = await materializeFromTable(DEFAULT_TEST_CASES_TABLE);

    const strongColumns = new Set([
      "in_github",
      "in_go_mod",
      "in_npm",
      "in_pip",
      "in_cargo",
      "in_ruby_gem",
      "in_dotnet",
      "in_setapp",
      "in_mas",
    ]);

    const mismatches: string[] = [];
    let checked = 0;
    for (const loc of locations) {
      if (!strongColumns.has(loc.source_column)) continue;
      const actual = classify(loc.url);
      const gt = expectedClassifierType(
        loc.source_column,
        loc.url,
        OVERRIDES,
      );
      checked++;
      if (!groundTruthAgrees(actual.type, gt)) {
        mismatches.push(
          `${loc.app} [${loc.source_column}] ${loc.url} → actual=${actual.type} gt=${gt.expected_type} (${gt.basis})`,
        );
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(mismatches, mismatches.slice(0, 25).join("\n")).toEqual([]);
  });

  it("reports has_script_install / in_dev_website gaps without failing unit suite", async () => {
    if (!existsSync(DEFAULT_TEST_CASES_TABLE)) return;
    const { locations } = await materializeFromTable(DEFAULT_TEST_CASES_TABLE);

    const soft: MaterializedLocation[] = locations.filter(
      (l) =>
        l.source_column === "has_script_install" ||
        l.source_column === "in_dev_website",
    );

    let agree = 0;
    let disagree = 0;
    const samples: string[] = [];
    for (const loc of soft) {
      const actual = classify(loc.url);
      const gt = expectedClassifierType(
        loc.source_column,
        loc.url,
        OVERRIDES,
      );
      if (groundTruthAgrees(actual.type, gt)) {
        agree++;
      } else {
        disagree++;
        if (samples.length < 15) {
          samples.push(
            `${loc.app} [${loc.source_column}] ${loc.url} actual=${actual.type} gt=${gt.expected_type}`,
          );
        }
      }
    }

    // Soft columns are allowed to disagree offline (extensionless installers,
    // bare product sites). We still require the suite to materialize them.
    expect(soft.length).toBeGreaterThan(0);
    expect(agree + disagree).toBe(soft.length);
    if (disagree > 0) {
      console.info(
        [
          `soft ground-truth gaps: ${disagree}/${soft.length}`,
          ...samples,
        ].join("\n"),
      );
    }
  });

  it("seeds agree with ground truth where classify is shape-driven", () => {
    const seedsPath = resolve(FIXTURE_DIR, "seed-urls.json");
    const seeds = JSON.parse(readFileSync(seedsPath, "utf-8")) as {
      name: string;
      url: string;
    }[];
    const locs = materializeSeeds(seeds);
    const hardMismatches: string[] = [];
    for (const loc of locs) {
      const actual = classify(loc.url);
      const gt = expectedClassifierType("seed", loc.url, OVERRIDES);
      // Seeds with known artifact/registry/store shape must match.
      if (
        gt.basis === "url-shape" ||
        gt.basis === "override" ||
        gt.expected_type !== "unknown"
      ) {
        if (!groundTruthAgrees(actual.type, gt)) {
          hardMismatches.push(
            `${loc.seed_name} ${loc.url} actual=${actual.type} gt=${gt.expected_type}`,
          );
        }
      }
    }
    expect(hardMismatches).toEqual([]);
  });
});

describe("per-app multi-URL coverage", () => {
  it("apps with multiple location columns produce multiple expectations", async () => {
    if (!existsSync(DEFAULT_TEST_CASES_TABLE)) return;
    const { locations } = await materializeFromTable(DEFAULT_TEST_CASES_TABLE);
    const byApp = new Map<string, MaterializedLocation[]>();
    for (const loc of locations) {
      const list = byApp.get(loc.app) || [];
      list.push(loc);
      byApp.set(loc.app, list);
    }
    const multi = [...byApp.entries()].filter(([, v]) => v.length >= 2);
    expect(multi.length).toBeGreaterThan(10);

    // Spot-check: for a multi-URL app, github + npm (if both present) differ.
    let foundPair = false;
    for (const [, locs] of multi) {
      const gh = locs.find((l) => l.source_column === "in_github");
      const npm = locs.find((l) => l.source_column === "in_npm");
      if (gh && npm) {
        foundPair = true;
        expect(classify(gh.url).type).toBe("github-repo");
        expect(classify(npm.url).type).toBe("npm-package");
        expect(
          expectedClassifierType("in_github", gh.url, OVERRIDES).expected_type,
        ).toBe("github-repo");
        expect(
          expectedClassifierType("in_npm", npm.url, OVERRIDES).expected_type,
        ).toBe("npm-package");
        break;
      }
    }
    expect(foundPair).toBe(true);
  });
});
