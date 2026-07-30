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

  // Prefer common prefix before first arch/platform token.
  const stripped = bare.map((n) =>
    n
      .replace(/\.exe$/i, "")
      .replace(
        /[-_.]?(darwin|macos|linux|windows|win32|apple)[-_.]?(arm64|aarch64|amd64|x86_64|x64|universal)?$/i,
        "",
      )
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

  const urlTemplate = (url: string) =>
    url.replace(version, "#{version}").replace(release.tagName, "v#{version}");

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
