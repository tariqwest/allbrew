import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { cratesLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { CargoPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

export type CratesIoCrateInfo = {
  name: string;
  description: string;
  homepage: string;
  repository: string | null;
  version: string;
  checksum: string | null;
  license: string | null;
  binNames: string[];
  githubOwner: string | null;
  githubRepo: string | null;
};

/** Parse github.com owner/repo from a crates.io repository field. */
export function parseGithubRepoFromUrl(
  repository: string | null | undefined,
): { owner: string; repo: string } | null {
  if (!repository) return null;
  const m = String(repository).match(
    /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i,
  );
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/i, "") };
}

/**
 * Fetch crate metadata from crates.io (or CRATES_URL).
 * Prefer max_stable_version over alpha newest when both exist.
 */
export async function fetchCratesIoCrate(
  crateName: string,
): Promise<CratesIoCrateInfo> {
  const base = (process.env.CRATES_URL || "https://crates.io").replace(
    /\/$/,
    "",
  );
  const response = await fetch(
    `${base}/api/v1/crates/${encodeURIComponent(crateName)}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "allbrew/1.0 (https://github.com/tariqwest/allbrew)",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `crates.io lookup failed for ${crateName}: HTTP ${response.status}`,
    );
  }
  const data = (await response.json()) as {
    crate?: {
      name?: string;
      description?: string;
      homepage?: string;
      repository?: string;
      max_stable_version?: string;
      newest_version?: string;
      default_version?: string;
    };
    versions?: Array<{
      num?: string;
      yanked?: boolean;
      checksum?: string;
      license?: string;
      bin_names?: string[];
    }>;
  };
  const crate = data.crate;
  if (!crate?.name) {
    throw new Error(`crates.io returned no crate for ${crateName}`);
  }
  const version =
    crate.max_stable_version ||
    crate.default_version ||
    crate.newest_version ||
    "";
  if (!version) {
    throw new Error(`crates.io returned no version for ${crateName}`);
  }
  const versions = Array.isArray(data.versions) ? data.versions : [];
  const verEntry =
    versions.find((v) => v.num === version && !v.yanked) ||
    versions.find((v) => v.num === version) ||
    versions.find((v) => !v.yanked) ||
    versions[0];
  const gh = parseGithubRepoFromUrl(crate.repository || null);
  return {
    name: crate.name,
    description: crate.description || `Install ${crate.name}`,
    homepage:
      crate.homepage ||
      crate.repository ||
      `https://crates.io/crates/${crate.name}`,
    repository: crate.repository || null,
    version,
    checksum: verEntry?.checksum || null,
    license: verEntry?.license || null,
    binNames: Array.isArray(verEntry?.bin_names)
      ? verEntry!.bin_names!.filter(Boolean)
      : [],
    githubOwner: gh?.owner || null,
    githubRepo: gh?.repo || null,
  };
}

/** static.crates.io download URL for a published crate version. */
export function cratesIoCrateUrl(crateName: string, version: string): string {
  const base = (
    process.env.CRATES_STATIC_URL || "https://static.crates.io"
  ).replace(/\/$/, "");
  return `${base}/crates/${encodeURIComponent(crateName)}/${encodeURIComponent(crateName)}-${encodeURIComponent(version)}.crate`;
}

export async function collectCargoPackagePayload(
  repoInfo: any,
  release: any = null,
  options: any = {},
): Promise<CargoPackagePayload> {
  const crateName =
    options.crateName || repoInfo?.name || options.name || "crate";
  const name = options.name || toFormulaName(crateName);
  const className = toClassName(name);
  const desc =
    options.desc ||
    repoInfo?.description ||
    `Install ${crateName}`;
  const license = guessLicenseIdentifier(
    repoInfo?.license || options.license || null,
  );
  const homepage =
    options.homepage ||
    repoInfo?.homepage ||
    repoInfo?.htmlUrl ||
    `https://crates.io/crates/${crateName}`;
  const fullName =
    repoInfo?.fullName ||
    (options.githubOwner && options.githubRepo
      ? `${options.githubOwner}/${options.githubRepo}`
      : "");
  const defaultBranch = repoInfo?.defaultBranch || "main";

  let urlLines = "";
  if (release) {
    const sourceUrl =
      release.tarballUrl ||
      `https://github.com/${fullName}/archive/refs/tags/${release.tagName}.tar.gz`;
    const sha256 = await hashUrl(sourceUrl);
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  } else if (options.crateVersion) {
    const ver = String(options.crateVersion);
    const crateUrl =
      options.crateUrl || cratesIoCrateUrl(crateName, ver);
    let sha256 = options.crateChecksum as string | undefined;
    if (!sha256) {
      sha256 = await hashUrl(crateUrl);
    }
    urlLines =
      `  url ${rubyString(crateUrl)}\n` +
      `  sha256 ${rubyString(sha256)}\n` +
      `  version ${rubyString(ver)}\n`;
  }

  return {
    template: "cargo_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    fullName: rubyEscape(fullName || "unknown/unknown"),
    defaultBranch: rubyEscape(defaultBranch),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    livecheckBlock: cratesLivecheckBlock(crateName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(
      options.binName || options.testBinName || name,
    ),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateCargoPackage(
  repoInfo: any,
  release: any = null,
  options: any = {},
) {
  const payload = await collectCargoPackagePayload(repoInfo, release, options);
  return writeRenderedFormula(payload, options.tapPath);
}
