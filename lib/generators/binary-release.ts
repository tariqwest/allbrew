import {
  toFormulaName,
  toClassName,
  extractVersionFromTag,
  matchAssetToArch,
  rubyString,
  guessLicenseIdentifier,
  writeFormula,
} from "../utils.ts";
import { downloadAndHash } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";

export async function generateBinaryRelease(
  repoInfo: any,
  release: any,
  options: any = {},
) {
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

  const hashes: Record<string, any> = {};
  for (const [arch, asset] of Object.entries(archAssets)) {
    const { sha256 } = await downloadAndHash(asset.url);
    hashes[arch] = { url: asset.url, sha256, name: asset.name };
  }

  const urlTemplate = (url: string) => {
    return url
      .replace(version, "#{version}")
      .replace(release.tagName, "v#{version}");
  };

  let ruby = `class ${className} < Formula\n`;
  ruby += `  desc ${rubyString(desc)}\n`;
  ruby += `  homepage ${rubyString(homepage)}\n`;
  if (license) ruby += `  license ${rubyString(license)}\n`;
  ruby += `  version ${rubyString(version)}\n`;
  ruby += `\n`;

  const hasMacos = hashes.macosArm || hashes.macosIntel;
  const hasLinux = hashes.linuxArm || hashes.linuxIntel;

  if (hasMacos) {
    ruby += `  on_macos do\n`;
    if (hashes.macosArm) {
      ruby += `    on_arm do\n`;
      ruby += `      url ${rubyString(urlTemplate(hashes.macosArm.url))}\n`;
      ruby += `      sha256 ${rubyString(hashes.macosArm.sha256)}\n`;
      ruby += `    end\n`;
    }
    if (hashes.macosIntel) {
      ruby += `    on_intel do\n`;
      ruby += `      url ${rubyString(urlTemplate(hashes.macosIntel.url))}\n`;
      ruby += `      sha256 ${rubyString(hashes.macosIntel.sha256)}\n`;
      ruby += `    end\n`;
    }
    ruby += `  end\n\n`;
  }

  if (hasLinux) {
    ruby += `  on_linux do\n`;
    if (hashes.linuxArm) {
      ruby += `    on_arm do\n`;
      ruby += `      url ${rubyString(urlTemplate(hashes.linuxArm.url))}\n`;
      ruby += `      sha256 ${rubyString(hashes.linuxArm.sha256)}\n`;
      ruby += `    end\n`;
    }
    if (hashes.linuxIntel) {
      ruby += `    on_intel do\n`;
      ruby += `      url ${rubyString(urlTemplate(hashes.linuxIntel.url))}\n`;
      ruby += `      sha256 ${rubyString(hashes.linuxIntel.sha256)}\n`;
      ruby += `    end\n`;
    }
    ruby += `  end\n\n`;
  }

  ruby += `  livecheck do\n`;
  ruby += `    url :stable\n`;
  ruby += `    strategy :github_latest\n`;
  ruby += `  end\n\n`;

  ruby += `  def install\n`;
  ruby += `    bin.install "${name}"\n`;
  ruby += `  end\n\n`;

  ruby += buildServiceBlock(serviceFromOptions(options, name), name);

  ruby += `  test do\n`;
  ruby += `    assert_match version.to_s, shell_output("#{bin}/${name} --version")\n`;
  ruby += `  end\n`;
  ruby += `end\n`;

  const filePath = await writeFormula(name, ruby, options.tapPath);
  return { filePath, name, className, type: "formula" };
}
