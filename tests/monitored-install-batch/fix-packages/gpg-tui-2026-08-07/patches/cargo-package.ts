import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { getFileContent } from "../github.ts";
import { cratesLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { CargoPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

/**
 * Map Cargo.toml dependency crate names to Homebrew formula deps.
 * Pure; unit-testable without network.
 */
export function inferCargoBrewDependencies(
  cargoToml: string | null | undefined,
): string[] {
  if (!cargoToml) return [];
  const deps = new Set<string>();

  const found = new Set<string>();
  const crateLine =
    /(?:^|\n)\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"|{)/gm;
  let m: RegExpExecArray | null;
  while ((m = crateLine.exec(cargoToml)) !== null) {
    found.add(m[1].toLowerCase());
  }
  for (const block of cargoToml.matchAll(/\[dependencies\.([^\]]+)\]/gi)) {
    found.add(block[1].trim().toLowerCase());
  }

  const hasCrate = (name: string) => found.has(name.toLowerCase());

  if (hasCrate("gpgme") || hasCrate("gpgme-sys")) {
    deps.add('  depends_on "pkgconf" => :build\n');
    deps.add('  depends_on "gnupg"\n');
    deps.add('  depends_on "gpgme"\n');
    deps.add('  depends_on "libgpg-error"\n');
  }
  if (
    hasCrate("libxcb") ||
    hasCrate("xcb") ||
    hasCrate("x11rb") ||
    (hasCrate("arboard") && /wayland-data-control/i.test(cargoToml))
  ) {
    deps.add('  depends_on "libxcb"\n');
  }
  if (hasCrate("openssl-sys") || hasCrate("openssl")) {
    deps.add('  depends_on "openssl@3"\n');
  }
  if (hasCrate("libsqlite3-sys") || hasCrate("rusqlite")) {
    deps.add('  depends_on "sqlite"\n');
  }
  if (hasCrate("zstd-sys")) {
    deps.add('  depends_on "zstd"\n');
  }

  const lines = [...deps];
  lines.sort((a, b) => {
    const aBuild = a.includes("=> :build") ? 0 : 1;
    const bBuild = b.includes("=> :build") ? 0 : 1;
    if (aBuild !== bBuild) return aBuild - bBuild;
    return a.localeCompare(b);
  });
  return lines;
}

export async function collectCargoPackagePayload(
  repoInfo: any,
  release: any = null,
  options: any = {},
): Promise<CargoPackagePayload> {
  const name = options.name || toFormulaName(repoInfo.name);
  const className = toClassName(name);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const license = guessLicenseIdentifier(repoInfo.license);
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;
  const crateName = options.crateName || repoInfo.name;

  let urlLines = "";
  if (release) {
    const sourceUrl =
      release.tarballUrl ||
      `https://github.com/${repoInfo.fullName}/archive/refs/tags/${release.tagName}.tar.gz`;
    const sha256 = await hashUrl(sourceUrl);
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  }

  let dependenciesLines = options.dependenciesLines || "";
  if (!dependenciesLines) {
    let cargoToml = options.cargoToml as string | undefined;
    if (!cargoToml && repoInfo?.fullName) {
      const [owner, repo] = String(repoInfo.fullName).split("/");
      if (owner && repo) {
        try {
          cargoToml =
            (await getFileContent(owner, repo, "Cargo.toml")) || undefined;
        } catch {
          cargoToml = undefined;
        }
      }
    }
    dependenciesLines = inferCargoBrewDependencies(cargoToml).join("");
  }

  return {
    template: "cargo_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    fullName: rubyEscape(repoInfo.fullName),
    defaultBranch: rubyEscape(repoInfo.defaultBranch),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    livecheckBlock: cratesLivecheckBlock(crateName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(options.binName || name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
    dependenciesLines,
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
