/**
 * Manual ground truth for classifier strategy selection.
 *
 * Unlike the rule oracle (which re-implements classify regexes), this module
 * encodes human expectations from the test-cases table: given a location
 * column + materialized URL, what strategy *should* the classifier return?
 *
 * Overrides (optional) live in
 * tests/fixtures/classifier-validation/ground-truth-overrides.json keyed by URL.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { LocationColumn } from "./test-case-locations.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type GroundTruthExpectation = {
  expected_type: string;
  /** How the expectation was derived */
  basis:
    | "column"
    | "url-shape"
    | "column+url"
    | "override"
    | "seed";
  rationale: string;
  expected_fields?: Record<string, string>;
};

export type GroundTruthOverride = {
  expected_type: string;
  rationale?: string;
  expected_fields?: Record<string, string>;
};

export type GroundTruthOverridesFile = {
  version: number;
  description?: string;
  overrides: Record<string, GroundTruthOverride>;
};

const DEFAULT_OVERRIDES = resolve(
  __dirname,
  "../fixtures/classifier-validation/ground-truth-overrides.json",
);

export function loadGroundTruthOverrides(
  path: string = DEFAULT_OVERRIDES,
): GroundTruthOverridesFile {
  if (!existsSync(path)) {
    return { version: 1, overrides: {} };
  }
  return JSON.parse(readFileSync(path, "utf-8")) as GroundTruthOverridesFile;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function archiveExt(path: string): boolean {
  return [
    ".tar.gz",
    ".tgz",
    ".tar.bz2",
    ".tar.xz",
    ".zip",
    ".gz",
    ".bz2",
    ".xz",
  ].some((e) => path.endsWith(e));
}

function scriptExt(path: string): boolean {
  return path.endsWith(".sh") || path.endsWith(".bash");
}

/**
 * Derive expected classifier type from a materialized location.
 * URL shape can override column when the URL is more specific (e.g. release .dmg).
 */
export function expectedClassifierType(
  sourceColumn: LocationColumn | "seed" | string,
  url: string,
  overrides: GroundTruthOverridesFile = loadGroundTruthOverrides(),
): GroundTruthExpectation {
  const override = overrides.overrides[url];
  if (override) {
    return {
      expected_type: override.expected_type,
      basis: "override",
      rationale: override.rationale || "manual override",
      expected_fields: override.expected_fields,
    };
  }

  const path = pathOf(url);
  const host = hostOf(url);

  // Strong URL-shape signals always win (release assets, registry hosts, stores).
  if (
    host === "apps.apple.com" ||
    host === "itunes.apple.com" ||
    (host.endsWith(".apple.com") && url.includes("/app/"))
  ) {
    return {
      expected_type: "mac-app-store",
      basis: "url-shape",
      rationale: "App Store host",
    };
  }
  if (/^setapp\.com$/i.test(host) && /\/apps\//i.test(url)) {
    const slug = url.match(/\/apps\/([^/?#]+)/i)?.[1];
    return {
      expected_type: "setapp-app",
      basis: "url-shape",
      rationale: "Setapp app URL",
      expected_fields: slug ? { slug } : undefined,
    };
  }
  if (/(?:^|\.)npmjs\.com$/i.test(host) && /\/package\//i.test(url)) {
    const packageName = url.match(/\/package\/(@[^/]+\/[^/?#]+|[^/?#]+)/i)?.[1];
    return {
      expected_type: "npm-package",
      basis: "url-shape",
      rationale: "npm package page",
      expected_fields: packageName ? { packageName } : undefined,
    };
  }
  if (/(?:^|\.)pypi\.org$/i.test(host) && /\/project\//i.test(url)) {
    const packageName = url.match(/\/project\/([^/?#]+)/i)?.[1];
    return {
      expected_type: "pip-package",
      basis: "url-shape",
      rationale: "PyPI project page",
      expected_fields: packageName ? { packageName } : undefined,
    };
  }
  if (/(?:^|\.)crates\.io$/i.test(host) && /\/crates\//i.test(url)) {
    const crateName = url.match(/\/crates\/([^/?#]+)/i)?.[1];
    return {
      expected_type: "cargo-package",
      basis: "url-shape",
      rationale: "crates.io page",
      expected_fields: crateName ? { crateName } : undefined,
    };
  }
  if (/(?:^|\.)rubygems\.org$/i.test(host) && /\/gems\//i.test(url)) {
    const gemName = url.match(/\/gems\/([^/?#]+)/i)?.[1];
    return {
      expected_type: "gem-package",
      basis: "url-shape",
      rationale: "RubyGems page",
      expected_fields: gemName ? { gemName } : undefined,
    };
  }
  if (/(?:^|\.)nuget\.org$/i.test(host) && /\/packages\//i.test(url)) {
    const packageName = url.match(/\/packages\/([^/?#]+)/i)?.[1];
    return {
      expected_type: "dotnet-package",
      basis: "url-shape",
      rationale: "NuGet package page",
      expected_fields: packageName ? { packageName } : undefined,
    };
  }

  // Direct artifacts
  if (path.endsWith(".dmg") || path.endsWith(".pkg")) {
    return {
      expected_type: "cask-dmg",
      basis: "url-shape",
      rationale: ".dmg/.pkg download URL",
    };
  }
  if (archiveExt(path)) {
    // raw github archive special-case already covered by archive ext
    return {
      expected_type: "archive",
      basis: "url-shape",
      rationale: "archive extension",
    };
  }
  if (scriptExt(path) || host === "raw.githubusercontent.com") {
    // raw without archive ext → bash-script per classifier rules
    if (host === "raw.githubusercontent.com" && archiveExt(path)) {
      return {
        expected_type: "archive",
        basis: "url-shape",
        rationale: "raw.githubusercontent.com archive",
      };
    }
    return {
      expected_type: "bash-script",
      basis: "url-shape",
      rationale: scriptExt(path)
        ? "shell script extension"
        : "raw.githubusercontent.com install path",
    };
  }

  // GitHub repo URLs (root / tree / blob / .git)
  if (host === "github.com") {
    // release asset paths already handled by extension above
    if (/\/releases\/download\//i.test(url)) {
      // no recognized extension — still not a repo root
      return {
        expected_type: "unknown",
        basis: "url-shape",
        rationale: "GitHub release download without known artifact extension",
      };
    }
    const m = url.match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:\/(?:tree|blob)\/.*)?\/?$/i,
    );
    if (m) {
      return {
        expected_type: "github-repo",
        basis: "url-shape",
        rationale: "GitHub repository URL",
        expected_fields: {
          owner: m[1],
          repo: m[2].replace(/\.git$/i, ""),
        },
      };
    }
  }

  // Column-informed expectations when URL shape is ambiguous.
  switch (sourceColumn) {
    case "in_github":
    case "in_go_mod":
      return {
        expected_type: "github-repo",
        basis: "column",
        rationale: `${sourceColumn} materializes to a GitHub repo URL`,
      };
    case "in_npm":
      return {
        expected_type: "npm-package",
        basis: "column",
        rationale: "in_npm column → npm-package",
      };
    case "in_pip":
      return {
        expected_type: "pip-package",
        basis: "column",
        rationale: "in_pip column → pip-package",
      };
    case "in_cargo":
      if (host.includes("github.com")) {
        return {
          expected_type: "github-repo",
          basis: "column+url",
          rationale: "in_cargo cell is GitHub-shaped",
        };
      }
      return {
        expected_type: "cargo-package",
        basis: "column",
        rationale: "in_cargo column → cargo-package",
      };
    case "in_ruby_gem":
      if (host.includes("github.com")) {
        return {
          expected_type: "github-repo",
          basis: "column+url",
          rationale: "in_ruby_gem cell is GitHub-shaped",
        };
      }
      return {
        expected_type: "gem-package",
        basis: "column",
        rationale: "in_ruby_gem column → gem-package",
      };
    case "in_dotnet":
      return {
        expected_type: "dotnet-package",
        basis: "column",
        rationale: "in_dotnet column → dotnet-package",
      };
    case "in_setapp":
      return {
        expected_type: "setapp-app",
        basis: "column",
        rationale: "in_setapp column → setapp-app",
      };
    case "in_mas":
      return {
        expected_type: "mac-app-store",
        basis: "column",
        rationale: "in_mas column → mac-app-store",
      };
    case "has_script_install":
      // Manual expectation: script-install column is a shell installer even
      // when the URL has no .sh extension (e.g. https://sh.rustup.rs).
      return {
        expected_type: "bash-script",
        basis: "column+url",
        rationale:
          "has_script_install URLs are install scripts (extension optional)",
      };
    case "in_dev_website":
      return {
        expected_type: "unknown",
        basis: "column",
        rationale:
          "product homepage without artifact extension → unknown offline",
      };
    case "seed":
      return {
        expected_type: "unknown",
        basis: "seed",
        rationale:
          "seed URL with no stronger shape match; inspect seed expectations",
      };
    default:
      return {
        expected_type: "unknown",
        basis: "column",
        rationale: `no ground-truth mapping for column ${sourceColumn}`,
      };
  }
}

export function groundTruthAgrees(
  actualType: string,
  expected: GroundTruthExpectation,
): boolean {
  return actualType === expected.expected_type;
}
