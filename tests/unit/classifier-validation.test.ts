import { describe, it, expect } from "bun:test";
import { classify } from "../../lib/classifier.ts";
import { oracleClassify } from "../helpers/classifier-oracle.ts";
import {
  materializeCell,
  materializeFromTable,
  DEFAULT_TEST_CASES_TABLE,
} from "../helpers/test-case-locations.ts";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Same conflict matrix URLs as classifier-conflict-matrix.test.ts
const CONFLICT_URLS: { url: string; expectedType: string }[] = [
  { url: "https://www.npmjs.com/package/maildev", expectedType: "npm-package" },
  { url: "https://pypi.org/project/marimo/", expectedType: "pip-package" },
  { url: "https://crates.io/crates/ripgrep", expectedType: "cargo-package" },
  { url: "https://rubygems.org/gems/pry", expectedType: "gem-package" },
  {
    url: "https://www.nuget.org/packages/dotnet-serve",
    expectedType: "dotnet-package",
  },
  { url: "https://github.com/muety/wakapi", expectedType: "github-repo" },
  {
    url: "https://github.com/robinovitch61/wander.git",
    expectedType: "github-repo",
  },
  {
    url: "https://github.com/muety/wakapi/tree/master/src",
    expectedType: "github-repo",
  },
  { url: "https://starship.rs/install.sh", expectedType: "bash-script" },
  {
    url: "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh",
    expectedType: "bash-script",
  },
  { url: "https://example.com/app.dmg", expectedType: "cask-dmg" },
  { url: "https://example.com/foo-1.0.tar.gz", expectedType: "archive" },
  { url: "https://example.com/release.zip", expectedType: "archive" },
  {
    url: "https://raw.githubusercontent.com/someone/repo/main/dist/release.tar.gz",
    expectedType: "archive",
  },
  {
    url: "https://apps.apple.com/us/app/bear/id1091189122",
    expectedType: "mac-app-store",
  },
  { url: "https://setapp.com/apps/bartender", expectedType: "setapp-app" },
  { url: "https://get.volta.sh", expectedType: "unknown" },
];

describe("classifier oracle bootstrap consistency", () => {
  for (const { url, expectedType } of CONFLICT_URLS) {
    it(`oracle and classify agree on ${expectedType}: ${url}`, () => {
      const actual = classify(url);
      const oracle = oracleClassify(url);
      expect(actual.type).toBe(expectedType);
      expect(oracle.type).toBe(expectedType);
      expect(oracle.type).toBe(actual.type);
    });
  }

  it("oracle strips .git on github-repo like classify", () => {
    const url = "https://github.com/robinovitch61/wander.git";
    expect(classify(url).repo).toBe("wander");
    expect(oracleClassify(url).repo).toBe("wander");
  });

  it("oracle normalizes tree URL like classify", () => {
    const url = "https://github.com/muety/wakapi/tree/master/src";
    expect(classify(url).url).toBe("https://github.com/muety/wakapi");
    expect(oracleClassify(url).url).toBe("https://github.com/muety/wakapi");
  });
});

describe("materializeCell", () => {
  it("prefixes github hostpath", () => {
    const r = materializeCell("in_github", "github.com/juftin/browsr");
    expect(r).toEqual({ url: "https://github.com/juftin/browsr" });
  });

  it("normalizes npm hostpath with www", () => {
    const r = materializeCell("in_npm", "npmjs.com/package/taskbook");
    expect(r).toEqual({ url: "https://www.npmjs.com/package/taskbook" });
  });

  it("normalizes scoped npm hostpath", () => {
    const r = materializeCell("in_npm", "npmjs.com/package/@hehehai/buke");
    expect(r).toEqual({
      url: "https://www.npmjs.com/package/@hehehai/buke",
    });
  });

  it("normalizes pypi hostpath", () => {
    const r = materializeCell("in_pip", "pypi.org/project/browsr");
    expect(r).toEqual({ url: "https://pypi.org/project/browsr/" });
  });

  it("keeps crates.io cargo cells as crates URLs", () => {
    const r = materializeCell("in_cargo", "crates.io/crates/oatmeal");
    expect(r).toEqual({ url: "https://crates.io/crates/oatmeal" });
  });

  it("maps github-shaped cargo cells to github URLs", () => {
    const r = materializeCell("in_cargo", "github.com/TaKO8Ki/gobang");
    expect(r).toEqual({ url: "https://github.com/TaKO8Ki/gobang" });
  });

  it("maps go_mod github paths to github URLs", () => {
    const r = materializeCell(
      "in_go_mod",
      "github.com/F1bonacc1/process-compose",
    );
    expect(r).toEqual({
      url: "https://github.com/F1bonacc1/process-compose",
    });
  });

  it("maps github-shaped ruby gem cells to github URLs", () => {
    const r = materializeCell("in_ruby_gem", "github.com/gogs/gogs");
    expect(r).toEqual({ url: "https://github.com/gogs/gogs" });
  });

  it("maps bare owner/repo to github URL", () => {
    const r = materializeCell("in_github", "eigent-ai/eigent");
    expect(r).toEqual({ url: "https://github.com/eigent-ai/eigent" });
  });

  it("does not treat non-github module hosts as github", () => {
    const r = materializeCell("in_go_mod", "zgo.at/goatcounter/v2");
    expect(r).toEqual({ skip_reason: "unparseable_github_or_module_path" });
  });

  it("reconstructs MAS id cells", () => {
    const r = materializeCell(
      "in_mas",
      "Paste – Limitless Clipboard (id967805235)",
    );
    expect(r).toEqual({ url: "https://apps.apple.com/app/id967805235" });
  });

  it("normalizes setapp hostpath", () => {
    const r = materializeCell("in_setapp", "setapp.com/apps/proxyman");
    expect(r).toEqual({ url: "https://setapp.com/apps/proxyman" });
  });

  it("prefixes bare dev website domains", () => {
    const r = materializeCell("in_dev_website", "electrum.org");
    expect(r).toEqual({ url: "https://electrum.org" });
  });

  it("keeps full script install URLs", () => {
    const r = materializeCell(
      "has_script_install",
      "https://ollama.com/install.sh",
    );
    expect(r).toEqual({ url: "https://ollama.com/install.sh" });
  });

  it("skips yes-only script install flags", () => {
    const r = materializeCell("has_script_install", "yes");
    expect(r).toEqual({ skip_reason: "script_flag_without_url" });
  });

  it("skips empty cells", () => {
    expect(materializeCell("in_github", "-")).toEqual({
      skip_reason: "empty",
    });
    expect(materializeCell("in_github", "")).toEqual({
      skip_reason: "empty",
    });
  });
});

describe("materializeFromTable", () => {
  it("loads the master test-cases table and produces locations", async () => {
    if (!existsSync(DEFAULT_TEST_CASES_TABLE)) {
      console.warn("skip: test-cases table missing");
      return;
    }
    const { locations, skipped } = await materializeFromTable(
      DEFAULT_TEST_CASES_TABLE,
    );
    expect(locations.length).toBeGreaterThan(100);
    // Every location has an absolute URL
    for (const loc of locations.slice(0, 50)) {
      expect(loc.url.startsWith("http")).toBe(true);
      expect(loc.app.length).toBeGreaterThan(0);
    }
    // Skips are structured
    for (const s of skipped.slice(0, 20)) {
      expect(typeof s.skip_reason).toBe("string");
    }
  });

  it("materialized registry URLs classify to matching package types", async () => {
    if (!existsSync(DEFAULT_TEST_CASES_TABLE)) return;
    const { locations } = await materializeFromTable(DEFAULT_TEST_CASES_TABLE);
    const npm = locations.find((l) => l.source_column === "in_npm");
    expect(npm).toBeTruthy();
    expect(classify(npm!.url).type).toBe("npm-package");

    const pip = locations.find((l) => l.source_column === "in_pip");
    expect(pip).toBeTruthy();
    expect(classify(pip!.url).type).toBe("pip-package");

    const crates = locations.find(
      (l) =>
        l.source_column === "in_cargo" && l.url.includes("crates.io"),
    );
    if (crates) {
      expect(classify(crates.url).type).toBe("cargo-package");
    }

    const ghCargo = locations.find(
      (l) =>
        l.source_column === "in_cargo" && l.url.includes("github.com"),
    );
    if (ghCargo) {
      expect(classify(ghCargo.url).type).toBe("github-repo");
    }
  });
});

describe("seed fixtures", () => {
  it("seed-urls.json is valid and classifies", () => {
    const path = resolve(
      import.meta.dir,
      "../fixtures/classifier-validation/seed-urls.json",
    );
    const seeds = JSON.parse(readFileSync(path, "utf-8")) as {
      url: string;
      name: string;
    }[];
    expect(seeds.length).toBeGreaterThan(5);
    for (const s of seeds) {
      const r = classify(s.url);
      expect(typeof r.type).toBe("string");
      expect(oracleClassify(s.url).type).toBe(r.type);
    }
  });
});
