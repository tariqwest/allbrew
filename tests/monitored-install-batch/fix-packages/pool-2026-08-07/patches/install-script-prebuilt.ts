/**
 * Resolve prebuilt multi-arch binaries advertised by an install.sh body
 * into a binary_release formula payload (platform url/sha blocks).
 */
import {
  toFormulaName,
  toClassName,
  extractVersionFromTag,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
} from "../utils.ts";
import { downloadAndHash } from "../sha256.ts";
import {
  detectPrebuiltBinaryPlan,
  expandArchiveTemplate,
  PREBUILT_PLATFORM_SPECS,
  type PrebuiltBinaryPlan,
} from "../install-script-analyze.ts";
import type { BinaryReleasePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";

type ArchHash = { url: string; sha256: string; name: string };

export async function fetchPrebuiltVersion(
  plan: PrebuiltBinaryPlan,
  options: { version?: string } = {},
): Promise<{ raw: string; clean: string }> {
  let raw: string;
  if (options.version) {
    raw = String(options.version).trim();
  } else {
    if (!plan.versionUrl) {
      throw new Error("install script prebuilt plan has no version URL");
    }
    const res = await fetch(plan.versionUrl, {
      headers: { "user-agent": "allbrew" },
    });
    if (!res.ok) {
      throw new Error(
        `failed to fetch version from ${plan.versionUrl}: HTTP ${res.status}`,
      );
    }
    raw = (await res.text()).trim().replace(/\s+/g, "");
    if (!raw) throw new Error(`empty version from ${plan.versionUrl}`);
  }
  return { raw, clean: extractVersionFromTag(raw) };
}

function versionLivecheckBlock(versionUrl: string): string {
  return `  livecheck do
    url ${rubyString(versionUrl)}
    regex(/v?(\\d+(?:\\.\\d+)+)/i)
  end

`;
}

export async function collectPrebuiltFromInstallScriptPayload(
  scriptText: string,
  scriptUrl: string,
  options: any = {},
): Promise<BinaryReleasePayload | null> {
  const plan = detectPrebuiltBinaryPlan(scriptText, {
    url: scriptUrl,
    name: options.name,
  });
  if (!plan) return null;

  const { raw: versionRaw, clean: version } = await fetchPrebuiltVersion(
    plan,
    options,
  );
  const name = options.name || toFormulaName(plan.binName);
  const className = toClassName(name);
  const binName = options.binName || plan.binName || name;
  const desc =
    options.desc || `Install ${binName} (prebuilt via install script)`;
  const license = guessLicenseIdentifier(options.license || null);
  const homepage = options.homepage || plan.homepage || scriptUrl;

  const hashes: Record<string, ArchHash> = {};
  const assetNames: string[] = [];

  for (const spec of PREBUILT_PLATFORM_SPECS) {
    const archiveName = expandArchiveTemplate(
      plan.archiveTemplate,
      spec.os,
      spec.arch,
    );
    const url = `${plan.baseUrl}/${versionRaw}/${archiveName}`;
    try {
      const { sha256 } = await downloadAndHash(url);
      hashes[spec.key] = { url, sha256, name: archiveName };
      assetNames.push(archiveName);
    } catch {
      // platform optional
    }
  }

  if (!hashes.macosArm && !hashes.macosIntel) {
    throw new Error(
      `prebuilt install script resolved no macOS archives from ${plan.baseUrl} version ${versionRaw}`,
    );
  }

  const urlTemplate = (u: string) => {
    // Prefer raw path segment (often "v1.2.3"); fall back to clean version.
    if (versionRaw && u.includes(versionRaw)) {
      // If raw is v-prefixed, keep "v#{version}" so livecheck clean versions still work.
      if (/^v/i.test(versionRaw) && versionRaw.slice(1) === version) {
        return u.split(versionRaw).join("v#{version}");
      }
      return u.split(versionRaw).join("#{version}");
    }
    if (version && u.includes(version)) {
      return u.split(version).join("#{version}");
    }
    return u;
  };

  let platformBlocks = "";
  const hasMacos = hashes.macosArm || hashes.macosIntel;
  const hasLinux = hashes.linuxArm || hashes.linuxIntel;
  if (hasMacos) {
    platformBlocks += `  on_macos do\n`;
    if (hashes.macosArm) {
      platformBlocks += `    on_arm do\n`;
      platformBlocks += `      url ${rubyString(urlTemplate(hashes.macosArm.url))}\n`;
      platformBlocks += `      sha256 ${rubyString(hashes.macosArm.sha256)}\n`;
      platformBlocks += `    end\n`;
    }
    if (hashes.macosIntel) {
      platformBlocks += `    on_intel do\n`;
      platformBlocks += `      url ${rubyString(urlTemplate(hashes.macosIntel.url))}\n`;
      platformBlocks += `      sha256 ${rubyString(hashes.macosIntel.sha256)}\n`;
      platformBlocks += `    end\n`;
    }
    platformBlocks += `  end\n\n`;
  }
  if (hasLinux) {
    platformBlocks += `  on_linux do\n`;
    if (hashes.linuxArm) {
      platformBlocks += `    on_arm do\n`;
      platformBlocks += `      url ${rubyString(urlTemplate(hashes.linuxArm.url))}\n`;
      platformBlocks += `      sha256 ${rubyString(hashes.linuxArm.sha256)}\n`;
      platformBlocks += `    end\n`;
    }
    if (hashes.linuxIntel) {
      platformBlocks += `    on_intel do\n`;
      platformBlocks += `      url ${rubyString(urlTemplate(hashes.linuxIntel.url))}\n`;
      platformBlocks += `      sha256 ${rubyString(hashes.linuxIntel.sha256)}\n`;
      platformBlocks += `    end\n`;
    }
    platformBlocks += `  end\n\n`;
  }

  // Archives contain a single bare executable (often name-os-arch). Rename to binName.
  const installBody = [
    `bin_path = Dir["*"].find { |f| File.file?(f) && File.executable?(f) }`,
    `bin_path ||= Dir["*"].find { |f| File.file?(f) && !f.end_with?(".txt", ".sha256", ".sig", ".asc", ".md") }`,
    `odie "No binary found in download" unless bin_path`,
    `bin.install bin_path => ${rubyString(binName)}`,
  ].join("\n    ");

  const livecheckBlock = plan.versionUrl
    ? versionLivecheckBlock(plan.versionUrl)
    : "";

  return {
    template: "binary_release",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    version: rubyEscape(version),
    binName: rubyEscape(binName),
    installBody,
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    platformBlocks,
    livecheckBlock,
    allbrewDependency: "",
    testBinName: rubyEscape(binName),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, binName), binName),
  };
}

export async function generatePrebuiltFromInstallScript(
  scriptText: string,
  scriptUrl: string,
  options: any = {},
) {
  const payload = await collectPrebuiltFromInstallScriptPayload(
    scriptText,
    scriptUrl,
    options,
  );
  if (!payload) return null;
  return writeRenderedFormula(payload, options.tapPath);
}
