import {
  toFormulaName,
  toClassName,
  extractVersionFromTag,
  matchAssetToArch,
  isBinaryAsset,
  isBareBinaryAsset,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { downloadAndHash } from "../sha256.ts";
import { githubLatestLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { BinaryReleasePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

type ArchHash = { url: string; sha256: string; name: string };

/**
 * Homebrew stages a bare binary URL as a file named after the asset basename.
 * Archives unpack and typically expose a binary named like the formula.
 * Prefer options.binName, else a common prefix from bare asset names, else formula name.
 */
export function resolveBinaryReleaseBinName(
  formulaName: string,
  assetNames: string[],
  options: { binName?: string } = {},
): string {
  if (options.binName) return options.binName;

  const bare = assetNames.filter((n) => isBareBinaryAsset(n));
  if (bare.length === 0) return formulaName;

  // Prefer common prefix before arch/platform token and optional embedded version.
  // e.g. afm_0.1.0_macOS_universal → afm, csctf-macos-arm64 → csctf
  const stripped = bare.map((n) =>
    n
      .replace(/\.exe$/i, "")
      .replace(
        /[-_.]?(darwin|macos|osx|linux|windows|win32|apple)[-_.]?(arm64|aarch64|amd64|x86_64|x64|i386|universal)?$/i,
        "",
      )
      .replace(/[-_.]\d+\.\d+(?:\.\d+)*(?:[-_][0-9A-Za-z]+)?$/i, "")
      .replace(/[-_.]+$/g, ""),
  );
  if (stripped.every((s) => s && s === stripped[0])) return stripped[0];

  return formulaName;
}

export function buildBinaryReleaseInstallBody(
  binName: string,
  assetNames: string[],
): string {
  const bare = assetNames.filter((n) => isBareBinaryAsset(n));
  if (bare.length === 0) {
    return `bin.install ${rubyString(binName)}`;
  }

  // Each platform URL is a single bare binary; rename asset basename → binName.
  // Use Dir[] so the staged filename (asset basename) is discovered without
  // hardcoding every arch-specific name into the formula.
  return [
    `bin_path = Dir["*"].find { |f| File.file?(f) && File.executable?(f) }`,
    `bin_path ||= Dir["*"].find { |f| File.file?(f) && !f.end_with?(".txt", ".sha256", ".sig", ".asc") }`,
    `odie "No binary found in download" unless bin_path`,
    `bin.install bin_path => ${rubyString(binName)}`,
  ].join("\n    ");
}

export async function collectBinaryReleasePayload(
  repoInfo: any,
  release: any,
  options: any = {},
): Promise<BinaryReleasePayload> {
  const name = options.name || toFormulaName(repoInfo.name);
  const className = toClassName(name);
  const version = extractVersionFromTag(release.tagName);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const license = guessLicenseIdentifier(repoInfo.license);
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;

  const archAssets: Record<string, any> = {};
  for (const asset of release.assets) {
    if (!isBinaryAsset(asset.name)) continue;
    const arch = matchAssetToArch(asset.name);
    if (arch) archAssets[arch] = asset;
  }

  if (archAssets.macosUniversal) {
    archAssets.macosArm = archAssets.macosUniversal;
    archAssets.macosIntel = archAssets.macosUniversal;
    delete archAssets.macosUniversal;
  }

  if (Object.keys(archAssets).length === 0) {
    throw new Error("No platform-specific binary assets found in release");
  }

  const hashes: Record<string, ArchHash> = {};
  for (const [arch, asset] of Object.entries(archAssets)) {
    const { sha256 } = await downloadAndHash(asset.url);
    hashes[arch] = { url: asset.url, sha256, name: asset.name };
  }

  const assetNames = Object.values(hashes).map((h) => h.name);
  const binName = resolveBinaryReleaseBinName(name, assetNames, options);

  // Template version tokens without double-rewriting (tag 0.1.0 must not turn
  // afm_0.1.0_macOS into afm_v#{version}_macOS after a partial first replace).
  const urlTemplate = (url: string) => templateReleaseUrl(url, version, release.tagName);

  return {
    template: "binary_release",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    version: rubyEscape(version),
    binName: rubyEscape(binName),
    installBody: buildBinaryReleaseInstallBody(binName, assetNames),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    platformBlocks: buildPlatformBlocks(hashes, urlTemplate),
    livecheckBlock: githubLatestLivecheckBlock(repoInfo.fullName, ":stable"),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(binName),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

/** Replace release tag / version in download URLs with Homebrew #{version}. */
export function templateReleaseUrl(
  url: string,
  version: string,
  tagName: string,
): string {
  let out = String(url);
  const tag = String(tagName || "");
  const ver = String(version || "");

  // Prefer whole-tag replacement first (handles v1.2.3 tags and bare 1.2.3).
  if (tag && out.includes(tag)) {
    const tagHasV = /^v/i.test(tag);
    const replacement = tagHasV ? "v#{version}" : "#{version}";
    out = out.split(tag).join(replacement);
  } else if (ver && out.includes(ver)) {
    out = out.split(ver).join("#{version}");
  }

  return out;
}

function buildPlatformBlocks(
  hashes: Record<string, ArchHash>,
  urlTemplate: (url: string) => string,
): string {
  const hasMacos = hashes.macosArm || hashes.macosIntel;
  const hasLinux = hashes.linuxArm || hashes.linuxIntel;

  let block = "";
  if (hasMacos) {
    block += `  on_macos do\n`;
    if (hashes.macosArm) {
      block += `    on_arm do\n`;
      block += `      url ${rubyString(urlTemplate(hashes.macosArm.url))}\n`;
      block += `      sha256 ${rubyString(hashes.macosArm.sha256)}\n`;
      block += `    end\n`;
    }
    if (hashes.macosIntel) {
      block += `    on_intel do\n`;
      block += `      url ${rubyString(urlTemplate(hashes.macosIntel.url))}\n`;
      block += `      sha256 ${rubyString(hashes.macosIntel.sha256)}\n`;
      block += `    end\n`;
    }
    block += `  end\n\n`;
  }

  if (hasLinux) {
    block += `  on_linux do\n`;
    if (hashes.linuxArm) {
      block += `    on_arm do\n`;
      block += `      url ${rubyString(urlTemplate(hashes.linuxArm.url))}\n`;
      block += `      sha256 ${rubyString(hashes.linuxArm.sha256)}\n`;
      block += `    end\n`;
    }
    if (hashes.linuxIntel) {
      block += `    on_intel do\n`;
      block += `      url ${rubyString(urlTemplate(hashes.linuxIntel.url))}\n`;
      block += `      sha256 ${rubyString(hashes.linuxIntel.sha256)}\n`;
      block += `    end\n`;
    }
    block += `  end\n\n`;
  }

  return block;
}

export async function generateBinaryRelease(
  repoInfo: any,
  release: any,
  options: any = {},
) {
  const payload = await collectBinaryReleasePayload(repoInfo, release, options);
  return writeRenderedFormula(payload, options.tapPath);
}
