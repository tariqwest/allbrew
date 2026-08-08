import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  toFormulaName,
  toClassName,
  extractVersionFromTag,
  matchAssetToArch,
  isBinaryAsset,
  isBareBinaryAsset,
  isArchiveBinaryAsset,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { downloadToTemp } from "../sha256.ts";
import { githubLatestLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import type { BinaryReleasePayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

const execFileAsync = promisify(execFile);

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

/** Prefer entrypoint names that match formula / common CLI conventions. */
export function pickArchiveEntrypoint(
  members: string[],
  formulaName: string,
  options: { binName?: string } = {},
): { sourcePath: string; binName: string } | null {
  const files = members
    .map((m) => m.replace(/\\/g, "/").replace(/^\.\//, ""))
    .filter((m) => m && !m.endsWith("/"));

  const candidates = files.filter((m) => {
    const base = m.split("/").pop() || "";
    if (!base || base.startsWith(".")) return false;
    if (/\.(txt|md|json|sha256|sig|asc|1|html|sample|dylib|so|a)$/i.test(base)) return false;
    // Prefer bin/ layout; also allow root-level binaries and files one directory
    // deep (common for release archives with a top-level wrapper directory like
    // `project-arch/binary`).
    const depth = m.split("/").length - 1;
    return (
      /(^|\/)bin\//.test(m) ||
      depth <= 1
    );
  });

  if (candidates.length === 0) return null;

  const preferredNames = [
    options.binName,
    formulaName,
    formulaName.replace(/-/g, ""),
    // Common short aliases for "open-interpreter" style packages.
    formulaName.endsWith("-interpreter") ? "interpreter" : "",
    formulaName.startsWith("open-") ? formulaName.slice(5) : "",
  ].filter(Boolean) as string[];

  const score = (path: string): number => {
    const base = path.split("/").pop() || "";
    let s = 0;
    if (/(^|\/)bin\//.test(path)) s += 50;
    const prefIdx = preferredNames.findIndex((n) => n.toLowerCase() === base.toLowerCase());
    if (prefIdx >= 0) s += 40 - prefIdx;
    // Deprioritize helper hosts / path tools.
    if (/host|rg$|zsh|node|python/i.test(base)) s -= 20;
    if (base.length === 1) s -= 5; // e.g. "i"
    // Boost binary-like files (no extension or known non-doc) over
    // documentation/license files (common in release archives).
    const DOC_PATTERNS = /^(license|licence|readme|changelog|changes|authors|contributing|copying|notice|authors|install|todo)\b/i;
    if (DOC_PATTERNS.test(base)) s -= 10;
    else if (!base.includes(".")) s += 5;
    return s;
  };

  const ranked = [...candidates].sort((a, b) => score(b) - score(a));
  const best = ranked[0];
  const base = best.split("/").pop() || formulaName;
  const binName = options.binName || preferredNames[0] || base;
  return { sourcePath: best, binName };
}

export function buildBinaryReleaseInstallBody(
  binName: string,
  assetNames: string[],
  archiveEntrypoint?: string | null,
): string {
  const bare = assetNames.filter((n) => isBareBinaryAsset(n));
  if (bare.length > 0) {
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

  // Nested package archives (e.g. open-interpreter-package-*/bin/interpreter + resources).
  // Use Dir[] discovery so arch-specific top-level folders (bun-darwin-aarch64/,
  // bun-linux-x64/, …) all resolve on every platform instead of hardcoding one path.
  if (archiveEntrypoint) {
    const src = archiveEntrypoint.replace(/\\/g, "/");
    const upstreamBase = src.split("/").pop() || binName;
    const searchName = upstreamBase || binName;
    const lines = [
      `libexec.install Dir["*"]`,
      `exe = Dir[libexec/"**/${searchName}"].find { |f| File.file?(f) && File.executable?(f) }`,
      `exe ||= Dir[libexec/"**/${searchName}"].find { |f| File.file?(f) }`,
      `odie "No ${searchName} binary found in archive" unless exe`,
      `bin.install_symlink exe => ${rubyString(binName)}`,
    ];
    if (upstreamBase && upstreamBase !== binName) {
      lines.push(
        `bin.install_symlink exe => ${rubyString(upstreamBase)}`,
      );
    }
    return lines.join("\n    ");
  }

  // Fallback: flat archive with binary named like the formula.
  return `bin.install ${rubyString(binName)}`;
}

async function listArchiveMembersFromPath(archivePath: string): Promise<string[]> {
  const lower = archivePath.toLowerCase();
  if (lower.endsWith(".zip")) {
    try {
      const { stdout } = await execFileAsync("zipinfo", ["-1", archivePath]);
      return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    } catch {
      const { stdout } = await execFileAsync("unzip", ["-l", archivePath]);
      return stdout
        .split("\n")
        .slice(3)
        .map((line) => line.trim().split(/\s+/).slice(3).join(" "))
        .filter((f) => f && !f.startsWith("---"));
    }
  }
  if (
    lower.endsWith(".tar.gz") ||
    lower.endsWith(".tgz") ||
    lower.endsWith(".tar.bz2") ||
    lower.endsWith(".tar.xz") ||
    lower.endsWith(".tar") ||
    lower.endsWith(".tar.zst")
  ) {
    const { stdout } = await execFileAsync("tar", ["-tf", archivePath]);
    return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  }
  return [];
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
  /** Prefer primary runtime builds over profile/android/musl/baseline variants. */
  const assetPreferenceScore = (name: string): number => {
    let s = 0;
    if (/(?:^|[^a-z])android(?:[^a-z]|$)/i.test(name)) s -= 100;
    if (/(?:^|[^a-z])(?:profile|debug|symbols)(?:[^a-z]|$)/i.test(name)) s -= 50;
    if (/(?:^|[^a-z])baseline(?:[^a-z]|$)/i.test(name)) s -= 20;
    if (/(?:^|[^a-z])musl(?:[^a-z]|$)/i.test(name)) s -= 10;
    return s;
  };
  for (const asset of release.assets) {
    if (!isBinaryAsset(asset.name)) continue;
    const arch = matchAssetToArch(asset.name);
    if (!arch) continue;
    const existing = archAssets[arch];
    if (
      !existing ||
      assetPreferenceScore(asset.name) > assetPreferenceScore(existing.name)
    ) {
      archAssets[arch] = asset;
    }
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
  let archiveEntrypoint: string | null = null;
  let archiveBinName: string | undefined;

  // Prefer inspecting a macOS archive first (local brew installs), else any arch.
  const archOrder = ["macosArm", "macosIntel", "linuxArm", "linuxIntel"];
  const orderedArchs = [
    ...archOrder.filter((a) => archAssets[a]),
    ...Object.keys(archAssets).filter((a) => !archOrder.includes(a)),
  ];

  let inspectedArchive = false;
  for (const arch of orderedArchs) {
    const asset = archAssets[arch];
    const shouldInspect =
      !inspectedArchive && isArchiveBinaryAsset(asset.name);

    if (shouldInspect) {
      inspectedArchive = true;
      const dl = await downloadToTemp(asset.url, asset.name);
      try {
        hashes[arch] = { url: asset.url, sha256: dl.sha256, name: asset.name };
        try {
          const members = await listArchiveMembersFromPath(dl.path);
          const picked = pickArchiveEntrypoint(members, name, options);
          if (picked) {
            archiveEntrypoint = picked.sourcePath;
            archiveBinName = picked.binName;
          }
        } catch {
          // Fall back to formula-name install if listing fails.
        }
      } finally {
        await dl.cleanup();
      }
    } else {
      // Stream hash to a throwaway path so multi-hundred-MB archives are not
      // retained in memory for every architecture.
      const dl = await downloadToTemp(asset.url, asset.name);
      try {
        hashes[arch] = { url: asset.url, sha256: dl.sha256, name: asset.name };
      } finally {
        await dl.cleanup();
      }
    }
  }

  const assetNames = Object.values(hashes).map((h) => h.name);
  const binName = archiveBinName
    || resolveBinaryReleaseBinName(name, assetNames, options);

  // macOS brew install needs a macOS url; Linux-only platform blocks yield
  // "formula requires at least a URL" on Darwin.
  const hasMacosAsset = Boolean(hashes.macosArm || hashes.macosIntel);
  if (!hasMacosAsset) {
    throw new Error(
      "No macOS binary assets found in release (Linux-only binaries cannot be installed with Homebrew on macOS)",
    );
  }

  // Apple Silicon with only intel binaries also has no active url → same Homebrew error.
  if (
    process.platform === "darwin" &&
    process.arch === "arm64" &&
    !hashes.macosArm
  ) {
    throw new Error(
      "No macOS arm64/universal binary assets found in release (intel-only macOS binaries cannot be installed natively on Apple Silicon)",
    );
  }
  if (
    process.platform === "darwin" &&
    process.arch === "x64" &&
    !hashes.macosIntel
  ) {
    throw new Error(
      "No macOS intel/universal binary assets found in release",
    );
  }

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
    installBody: buildBinaryReleaseInstallBody(binName, assetNames, archiveEntrypoint),
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

  // Prefer whole-tag replacement first. Preserve non-version prefixes in the tag
  // (e.g. rust-v0.0.34 → rust-v#{version}, v1.2.3 → v#{version}).
  if (tag && out.includes(tag)) {
    let replacement: string;
    if (ver && tag.includes(ver)) {
      replacement = tag.split(ver).join("#{version}");
    } else if (/^v/i.test(tag)) {
      replacement = "v#{version}";
    } else {
      replacement = "#{version}";
    }
    out = out.split(tag).join(replacement);
  }

  // Also rewrite remaining bare version segments (asset basenames often omit the
  // leading "v": .../v#{version}/Supersonic-0.22.0-mac-arm64.zip).
  if (ver && out.includes(ver)) {
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
