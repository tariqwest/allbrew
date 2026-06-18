import {
  toFormulaName,
  toClassName,
  extractVersionFromTag,
  matchAssetToArch,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { downloadAndHash } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { BinaryReleasePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

type ArchHash = { url: string; sha256: string; name: string };

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
    const arch = matchAssetToArch(asset.name);
    if (arch) archAssets[arch] = asset;
  }

  if (Object.keys(archAssets).length === 0) {
    throw new Error("No platform-specific binary assets found in release");
  }

  const hashes: Record<string, ArchHash> = {};
  for (const [arch, asset] of Object.entries(archAssets)) {
    const { sha256 } = await downloadAndHash(asset.url);
    hashes[arch] = { url: asset.url, sha256, name: asset.name };
  }

  const urlTemplate = (url: string) =>
    url.replace(version, "#{version}").replace(release.tagName, "v#{version}");

  return {
    template: "binary_release",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    version: rubyEscape(version),
    binName: rubyEscape(name),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    platformBlocks: buildPlatformBlocks(hashes, urlTemplate),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(name),
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
