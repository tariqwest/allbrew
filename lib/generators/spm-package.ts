import {
  toFormulaName,
  toClassName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { hashUrl } from "../sha256.ts";
import { githubLatestLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { SpmPackagePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

/** Extract executable product names from Package.swift source text. */
export function parseSpmExecutableProducts(packageSwiftText: string): string[] {
  if (!packageSwiftText) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\.executable\s*\(\s*name:\s*"([^"]+)"/g,
    /\.executableTarget\s*\(\s*name:\s*"([^"]+)"/g,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(packageSwiftText)) !== null) {
      const name = match[1];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      found.push(name);
    }
  }
  return found;
}

/** True when Package.swift only exposes libraries (no CLI install target). */
export function isLibraryOnlyPackageSwift(packageSwiftText: string): boolean {
  const text = String(packageSwiftText || "");
  if (!text.trim()) return false;
  if (parseSpmExecutableProducts(text).length > 0) return false;
  return /\.library\s*\(/i.test(text) || /products:\s*\[/i.test(text);
}

/** Root Xcode app/workspace markers that should not become SPM formulae. */
export function hasXcodeAppProject(fileNames: string[] | null | undefined): boolean {
  if (!fileNames?.length) return false;
  return fileNames.some((f) => /\.(xcodeproj|xcworkspace)$/i.test(String(f)));
}

/** Prefer CLI-style product over Server/Mac/Service/Repack helpers. */
export function preferSpmBinName(
  executables: string[],
  formulaName = "",
  repoName = "",
): string | null {
  if (!executables?.length) return null;
  const normalize = (s: string) =>
    String(s || "")
      .toLowerCase()
      .replace(/[-_]/g, "");
  const formulaKey = normalize(formulaName);
  const repoKey = normalize(repoName);

  const score = (name: string) => {
    const n = normalize(name);
    let s = 0;
    if (formulaKey && (n === formulaKey || n.endsWith(formulaKey))) s += 40;
    if (repoKey && (n === repoKey || n.endsWith(repoKey))) s += 30;
    if (/cli$/i.test(name) || /\bcli\b/i.test(name)) s += 50;
    if (/server$/i.test(name) || /service$/i.test(name)) s -= 20;
    if (/mac$/i.test(name) || /app$/i.test(name)) s -= 25;
    if (/repack$/i.test(name) || /tool$/i.test(name)) s -= 10;
    return s;
  };

  const ranked = executables
    .map((name, index) => ({ name, index, score: score(name) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.name || null;
}

export async function collectSpmPackagePayload(
  repoInfo: any,
  release: any,
  options: any = {},
): Promise<SpmPackagePayload> {
  const name = options.name || toFormulaName(repoInfo.name);
  const className = toClassName(name);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const license = guessLicenseIdentifier(repoInfo.license);
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;

  let sourceUrl: string | null = null;
  let version: string;
  if (release) {
    version = release.tagName.replace(/^v/, "");
    sourceUrl =
      release.tarballUrl ||
      `https://github.com/${repoInfo.fullName}/archive/refs/tags/${release.tagName}.tar.gz`;
  } else {
    version = "HEAD";
  }

  let urlLines = "";
  if (sourceUrl && version !== "HEAD") {
    const sha256 = await hashUrl(sourceUrl);
    urlLines = `  url ${rubyString(sourceUrl)}\n  sha256 ${rubyString(sha256)}\n`;
  }

  const packageSwift =
    options.packageSwiftText || options.packageSwift || "";
  const parsedBins = parseSpmExecutableProducts(packageSwift);
  const binNames: string[] = Array.isArray(options.binNames)
    ? options.binNames.filter(Boolean)
    : parsedBins.length > 0
      ? parsedBins
      : [];

  const binTarget =
    options.binName ||
    preferSpmBinName(binNames, name, repoInfo.name) ||
    binNames[0] ||
    null;

  // Library-only Package.swift (common for Xcode app monorepos) has no CLI product.
  // Falling back to repoInfo.name produced broken formulae (swift build + missing bin).
  if (!binTarget) {
    const xcodeHint = options.xcodeApp
      ? " This repository looks like an Xcode app project; distribute via release DMG/ZIP, MAS, or TestFlight instead of an SPM formula."
      : "";
    throw new Error(
      `Cannot generate spm-package for ${repoInfo.fullName || repoInfo.name || name}: ` +
        `Package.swift has no .executable / .executableTarget products (library-only).` +
        xcodeHint +
        ` Pass --bin-name if a product name is known.`,
    );
  }

  const installTargets = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of ([binTarget, ...binNames].filter(Boolean) as string[])) {
      const key = n.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(n);
      }
    }
    return out.length ? out : [binTarget];
  })();
  const binInstallPaths = installTargets
    .map((b) => rubyString(`.build/release/${b}`))
    .join(", ");

  return {
    template: "spm_package",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    fullName: rubyEscape(repoInfo.fullName),
    defaultBranch: rubyEscape(repoInfo.defaultBranch),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    urlLines,
    binInstallPaths,
    livecheckBlock: githubLatestLivecheckBlock(repoInfo.fullName),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(binTarget),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateSpmPackage(
  repoInfo: any,
  release: any,
  options: any = {},
) {
  const payload = await collectSpmPackagePayload(repoInfo, release, options);
  return writeRenderedFormula(payload, options.tapPath);
}
