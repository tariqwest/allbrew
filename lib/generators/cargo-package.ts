import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
  assertSafeFetchUrl,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import {
  cratesLivecheckBlock,
  githubLatestLivecheckBlock,
} from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { CargoPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

/** Parse `name = "…"` from the first `[package]` section of a Cargo.toml. */
export function parseCargoPackageName(
  cargoToml: string | null | undefined,
): string | null {
  if (!cargoToml) return null;

  let inPackageSection = false;
  for (const line of cargoToml.split(/\r?\n/)) {
    const trimmed = line.trim();
    const section = trimmed.match(/^\[([^\]]+)\]/);
    if (section) {
      inPackageSection = section[1] === "package";
      continue;
    }

    if (!inPackageSection) continue;
    const name = trimmed.match(/^name\s*=\s*["']([^"']+)["']/);
    if (name) return name[1];
  }

  return null;
}

/**
 * Parse `[workspace].members` paths from a Cargo.toml (single- or multi-line arrays).
 * Returns [] when not a workspace or members cannot be parsed.
 */
export function parseCargoWorkspaceMembers(
  cargoToml: string | null | undefined,
): string[] {
  if (!cargoToml) return [];
  const text = String(cargoToml);
  // Match members = [ ... ] spanning lines; stop at next top-level assignment/section heuristically.
  const m = text.match(
    /(?:^|\n)\s*members\s*=\s*\[([\s\S]*?)\]/m,
  );
  if (!m) return [];
  const body = m[1];
  const out: string[] = [];
  for (const match of body.matchAll(/["']([^"']+)["']/g)) {
    const p = match[1].trim().replace(/^\.\//, "");
    if (p && !p.includes("*")) out.push(p);
  }
  return out;
}

/** True when root Cargo.toml is a workspace virtual manifest (no [package]). */
export function isCargoWorkspaceRoot(
  cargoToml: string | null | undefined,
): boolean {
  if (!cargoToml) return false;
  if (parseCargoPackageName(cargoToml)) return false;
  return (
    /(?:^|\n)\s*\[workspace\]/m.test(cargoToml) ||
    parseCargoWorkspaceMembers(cargoToml).length > 0
  );
}

/** Ruby fragment for `system "cargo", "install", …`. */
export function cargoStdInstallArgs(
  installPath?: string | null,
  opts: { locked?: boolean } = {},
): string {
  const locked = opts.locked !== false;
  const p = (installPath || "").trim().replace(/^\.\//, "");
  const pathOk =
    p && p !== "." && !p.includes("..") && !p.startsWith("/") && !/["'\\]/.test(p);

  if (locked) {
    if (!pathOk) return "*std_cargo_args";
    return `*std_cargo_args(path: ${rubyString(p)})`;
  }
  // Unlocked path: strip --locked from std_cargo_args (portable across Homebrew).
  if (!pathOk) return '*std_cargo_args.reject { |arg| arg == "--locked" }';
  return `*std_cargo_args(path: ${rubyString(p)}).reject { |arg| arg == "--locked" }`;
}

export type CratesIoCrateMeta = {
  crateName: string;
  version: string;
  description: string | null;
  homepage: string | null;
  repository: string | null;
  license: string | null;
  checksum: string | null;
  crateUrl: string;
  binNames: string[];
};

function cratesApiBase(): string {
  return (process.env.CRATES_URL || "https://crates.io").replace(/\/$/, "");
}

function cratesStaticBase(): string {
  // When CRATES_URL points at a fixture server, downloads stay on that host.
  const api = cratesApiBase();
  if (api.includes("crates.io")) return "https://static.crates.io";
  return api;
}

/** Parse owner/repo from a GitHub repository URL on a crates.io record. */
export function githubFullNameFromRepoUrl(
  repository: string | null | undefined,
): string | null {
  if (!repository) return null;
  try {
    const u = new URL(repository);
    if (!/github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

export async function fetchCratesIoCrate(
  crateName: string,
): Promise<CratesIoCrateMeta> {
  const apiUrl = `${cratesApiBase()}/api/v1/crates/${encodeURIComponent(crateName)}`;
  assertSafeFetchUrl(apiUrl);
  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/json",
      // crates.io rejects bare fetches without a descriptive User-Agent
      "User-Agent": "allbrew/1.0 (https://github.com/tariqwest/allbrew)",
    },
  });
  if (!response.ok) {
    throw new Error(
      `crates.io lookup failed for ${crateName}: ${response.status}`,
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
      max_version?: string;
    };
    versions?: Array<{
      num?: string;
      yanked?: boolean;
      checksum?: string;
      license?: string;
      bin_names?: string[];
      dl_path?: string;
    }>;
  };
  const crate = data.crate;
  if (!crate?.name) {
    throw new Error(`crates.io returned no crate metadata for ${crateName}`);
  }
  const version =
    crate.max_stable_version ||
    crate.newest_version ||
    crate.max_version ||
    data.versions?.find((v) => v.num && !v.yanked)?.num;
  if (!version) {
    throw new Error(`No published version found for crate ${crateName}`);
  }
  const versionRow =
    data.versions?.find((v) => v.num === version) ||
    data.versions?.find((v) => v.num && !v.yanked);
  const crateUrl = `${cratesStaticBase()}/crates/${encodeURIComponent(crate.name)}/${encodeURIComponent(crate.name)}-${encodeURIComponent(version)}.crate`;
  return {
    crateName: crate.name,
    version,
    description: crate.description || null,
    homepage: crate.homepage || null,
    repository: crate.repository || null,
    license: versionRow?.license || null,
    checksum: versionRow?.checksum || null,
    crateUrl,
    binNames: Array.isArray(versionRow?.bin_names)
      ? versionRow!.bin_names!
      : [],
  };
}

/** Synthetic repoInfo for crates.io-only generation (no GitHub API required). */
export function repoInfoFromCratesMeta(meta: CratesIoCrateMeta): any {
  const fullName = githubFullNameFromRepoUrl(meta.repository);
  const name = fullName?.split("/")[1] || meta.crateName;
  const htmlUrl = fullName
    ? `https://github.com/${fullName}`
    : meta.homepage || `https://crates.io/crates/${meta.crateName}`;
  return {
    name,
    fullName: fullName || meta.crateName,
    description: meta.description,
    homepage: meta.homepage || meta.repository || htmlUrl,
    htmlUrl,
    defaultBranch: "main",
    license: meta.license,
  };
}

export async function collectCargoPackagePayload(
  repoInfo: any,
  release: any = null,
  options: any = {},
): Promise<CargoPackagePayload> {
  const crateName =
    options.crateName || repoInfo?.name || options.package || null;
  let cratesMeta: CratesIoCrateMeta | null = options.cratesMeta || null;

  // Registry path (crates.io URL / --crate-name without a GitHub release):
  // resolve a stable .crate artifact. GitHub-sourced cargo formulas that pass
  // a null release intentionally stay head-only unless cratesMeta is provided.
  const wantCratesIo =
    !release &&
    Boolean(crateName) &&
    !options.skipCratesIoFetch &&
    (Boolean(options.cratesMeta) ||
      Boolean(options.fromCratesIo) ||
      !repoInfo);
  if (wantCratesIo) {
    try {
      cratesMeta = cratesMeta || (await fetchCratesIoCrate(crateName));
    } catch (err) {
      if (!repoInfo) throw err;
      cratesMeta = null;
    }
  }

  if (!repoInfo && cratesMeta) {
    repoInfo = repoInfoFromCratesMeta(cratesMeta);
  }
  if (!repoInfo) {
    throw new Error(
      `cargo-package requires repoInfo or a crates.io crate name (got crateName=${crateName})`,
    );
  }

  const resolvedCrate = cratesMeta?.crateName || crateName || repoInfo.name;
  const name = options.name || toFormulaName(resolvedCrate);
  const className = toClassName(name);
  const desc =
    options.desc ||
    cratesMeta?.description ||
    repoInfo.description ||
    `Install ${resolvedCrate}`;
  const license = guessLicenseIdentifier(
    cratesMeta?.license || repoInfo.license,
  );
  const homepage =
    options.homepage ||
    cratesMeta?.homepage ||
    cratesMeta?.repository ||
    repoInfo.homepage ||
    repoInfo.htmlUrl ||
    `https://crates.io/crates/${resolvedCrate}`;

  const fullName =
    githubFullNameFromRepoUrl(cratesMeta?.repository) ||
    repoInfo.fullName ||
    "";
  const defaultBranch = repoInfo.defaultBranch || "main";

  let urlLines = "";
  if (release) {
    const sourceUrl =
      release.tarballUrl ||
      `https://github.com/${fullName || repoInfo.fullName}/archive/refs/tags/${release.tagName}.tar.gz`;
    const sha256 = await hashUrl(sourceUrl);
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  } else if (cratesMeta) {
    let sha256 = cratesMeta.checksum;
    if (!sha256) {
      sha256 = await hashUrl(cratesMeta.crateUrl);
    }
    urlLines = `  url ${rubyString(cratesMeta.crateUrl)}\n  sha256 ${rubyString(sha256)}\n  version ${rubyString(cratesMeta.version)}\n`;
  }

  const binFromCrate =
    cratesMeta?.binNames?.length === 1 ? cratesMeta.binNames[0] : null;

  const installPath =
    options.cargoPath || options.installPath || options.path || null;
  // Prefer crates.io livecheck when the formula is registry-sourced; GitHub
  // source builds (incl. unpublished workspace crates) use :github_latest.
  const livecheckBlock = cratesMeta
    ? cratesLivecheckBlock(resolvedCrate)
    : fullName
      ? githubLatestLivecheckBlock(fullName)
      : cratesLivecheckBlock(resolvedCrate);

  return {
    template: "cargo_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    fullName: rubyEscape(fullName || resolvedCrate),
    defaultBranch: rubyEscape(defaultBranch),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    livecheckBlock,
    cargoInstallArgs: cargoStdInstallArgs(installPath),
    cargoInstallArgsUnlocked: cargoStdInstallArgs(installPath, { locked: false }),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(options.binName || binFromCrate || name),
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
