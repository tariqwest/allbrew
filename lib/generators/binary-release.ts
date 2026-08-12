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
  isUntaggedCliZipName,
  rubyString,
  rubyEscape,
  guessLicenseIdentifier,
  getAllbrewFormulaDependency,
} from "../utils.ts";
import { downloadToTemp } from "../sha256.ts";
import { githubLatestLivecheckBlock } from "./livecheck.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import { prereleaseFormulaComment } from "../github.ts";
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
        /[-_.]?(darwin|macos|osx|linux|windows|win32|apple)[-_.]?(arm64|aarch64|amd64|x86_64|x64|i386|universal|all)?$/i,
        "",
      )
      .replace(/[-_.]\d+\.\d+(?:\.\d+)*(?:[-_][0-9A-Za-z]+)?$/i, "")
      .replace(/[-_.]+$/g, ""),
  );
  if (stripped.every((s) => s && s === stripped[0])) return stripped[0];

  return formulaName;
}

/** Doc / legal files that must never become the install entrypoint. */
const ARCHIVE_DOC_BASENAME_RE =
  /^(license|licence|readme|changelog|changes|authors|contributing|copying|notice|install|todo|code_of_conduct|security|history|news|credits|acknowledgements?)(\.[a-z0-9]+)?$/i;

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
    // Hard-refuse documentation / license files (television, toolong archives).
    if (ARCHIVE_DOC_BASENAME_RE.test(base)) return false;
    if (/\.(txt|md|json|sha256|sig|asc|1|html|sample|dylib|so|a|ps1|psm1|bat|sh|rb|py|rs|go|ts|js|css|map)$/i.test(base)) {
      return false;
    }
    if (m.includes("/node_modules/") || m.includes("/vendor/") || m.includes("/.git/")) return false;
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
    const depth = path.split("/").length - 1;
    let s = 0;
    if (base.toLowerCase() === formulaName.toLowerCase() && depth <= 1) s += 60;
    if (/(^|\/)bin\//.test(path)) s += 50;
    const prefIdx = preferredNames.findIndex((n) => n.toLowerCase() === base.toLowerCase());
    if (prefIdx >= 0) s += 40 - prefIdx;
    // Deprioritize helper hosts / path tools.
    if (/host|rg$|zsh|node|python/i.test(base)) s -= 20;
    if (base.length === 1) s -= 5; // e.g. "i"
    // Prefer extensionless binaries (typical CLI) over named scripts with dots.
    if (!base.includes(".")) s += 5;
    // Prefer versioned layout binaries that look like the product binary.
    if (new RegExp(`^${formulaName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(base)) {
      s += 15;
    }
    return s;
  };

  const ranked = [...candidates].sort((a, b) => score(b) - score(a));
  const best = ranked[0];
  if (!best || ARCHIVE_DOC_BASENAME_RE.test(best.split("/").pop() || "")) {
    return null;
  }
  const base = best.split("/").pop() || formulaName;
  // Prefer formula name as the installed bin token when the entrypoint is a
  // versioned path (e.g. television-0.1.2/television) rather than the full
  // versioned basename.
  const binName =
    options.binName ||
    preferredNames[0] ||
    (ARCHIVE_DOC_BASENAME_RE.test(base) ? formulaName : base);
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
  // Source path may embed a release version; emit #{version} so livecheck upgrades work.
  if (archiveEntrypoint) {
    const src = archiveEntrypoint.replace(/\\/g, "/");
    const upstreamBase = src.split("/").pop() || "";
    // Flat single-file CLI zips (license-plist.zip → root "license-plist"): install
    // the binary directly into bin. libexec+symlink has been observed to leave
    // PREFIX/bin unusable for some root-level Mach-O redistributables under
    // verify (BIN_MISSING despite FORMULA_LISTED).
    if (!src.includes("/")) {
      const lines = [
        `chmod "a+rx", ${rubyString(src)} if File.exist?(${rubyString(src)})`,
        `bin.install ${rubyString(src)} => ${rubyString(binName)}`,
      ];
      if (
        upstreamBase &&
        upstreamBase !== binName &&
        !ARCHIVE_DOC_BASENAME_RE.test(upstreamBase)
      ) {
        lines.push(
          `bin.install_symlink ${rubyString(binName)} => ${rubyString(upstreamBase)}`,
        );
      }
      return lines.join("\n    ");
    }
    const srcRuby = templateEntrypointPath(src);
    const lines = [
      `libexec.install Dir["*"]`,
      `bin.install_symlink libexec/${srcRuby} => ${rubyString(binName)}`,
    ];
    // Also expose the upstream entrypoint basename when it differs (interpreter vs open-interpreter).
    if (
      upstreamBase &&
      upstreamBase !== binName &&
      !ARCHIVE_DOC_BASENAME_RE.test(upstreamBase)
    ) {
      lines.push(
        `bin.install_symlink libexec/${srcRuby} => ${rubyString(upstreamBase)}`,
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

  // When cask-app-release peeks a bare product zip (license-plist.zip) and finds
  // no .app, callers pass allowUntaggedCliZips so we bottle it as universal macOS.
  if (Object.keys(archAssets).length === 0 && options.allowUntaggedCliZips) {
    const untagged = (release.assets || []).filter((a: any) =>
      isUntaggedCliZipName(a?.name || ""),
    );
    if (untagged.length > 0) {
      const score = (name: string): number => {
        const l = name.toLowerCase();
        let s = 0;
        if (/(?:^|[_-])portable(?:[_-]|$)/i.test(l)) s -= 20;
        if (l.includes("artifactbundle")) s -= 50;
        // Prefer shorter product zips (license-plist.zip over long marketing names)
        s -= Math.min(l.length, 40) / 10;
        return s;
      };
      untagged.sort(
        (a: any, b: any) => score(b.name) - score(a.name) || a.name.length - b.name.length,
      );
      archAssets.macosUniversal = untagged[0];
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
      !inspectedArchive &&
      (isArchiveBinaryAsset(asset.name) ||
        (options.allowUntaggedCliZips &&
          isUntaggedCliZipName(asset.name)));

    if (shouldInspect) {
      inspectedArchive = true;
      const dl = await downloadToTemp(asset.url, asset.name);
      try {
        hashes[arch] = { url: asset.url, sha256: dl.sha256, name: asset.name };
        try {
          const members = await listArchiveMembersFromPath(dl.path);
          const picked = pickArchiveEntrypoint(members, name, options);
          if (picked) {
            let src = picked.sourcePath;
            const topDirs = new Set(
              members
                .map((m) => m.split("/")[0])
                .filter((p) => p && members.some((x) => x === `${p}/` || x.startsWith(`${p}/`))),
            );
            if (topDirs.size === 1) {
              const wrapper = [...topDirs][0];
              const allPrefixed = members
                .filter((m) => m && !m.endsWith("/"))
                .every((m) => m === wrapper || m.startsWith(`${wrapper}/`));
              if (allPrefixed && src.startsWith(`${wrapper}/`)) {
                src = src.slice(wrapper.length + 1);
              }
            }
            archiveEntrypoint = src;
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
    licenseLine:
      prereleaseFormulaComment(release) +
      (license ? `  license ${rubyString(license)}\n` : ""),
    platformBlocks: buildPlatformBlocks(hashes, urlTemplate),
    livecheckBlock: githubLatestLivecheckBlock(repoInfo.fullName, ":stable"),
    allbrewDependency: rubyEscape(getAllbrewFormulaDependency()),
    testBinName: rubyEscape(binName),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

/**
 * When an archive member path embeds a dotted version (e.g. television-0.12.1/tv),
 * rewrite that segment to use Homebrew's #{version} so upgrades keep working.
 * Leaves paths without a version segment unchanged.
 */
export function templateEntrypointPath(path: string): string {
  const src = String(path || "").replace(/\\/g, "/");
  // Path segments like name-1.2.3 or name_1.2.3
  const versionedSeg = src.match(
    /(?:^|\/)([A-Za-z0-9._-]*?)[-_](\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)(?=\/|$)/,
  );
  if (!versionedSeg) {
    return rubyString(src);
  }
  // Build a Ruby string interpolation: "prefix-#{version}/rest"
  const full = versionedSeg[0].replace(/^\//, "");
  const idx = src.indexOf(full);
  const before = src.slice(0, idx);
  const after = src.slice(idx + full.length);
  const prefix = versionedSeg[1];
  const sep = full.includes(`_${versionedSeg[2]}`) ? "_" : "-";
  // before may include leading path with slash
  const left = before.endsWith("/") || before === "" ? before : before;
  // Use double-quoted Ruby so #{version} interpolates at brew time.
  const rubyPath = `${left}${prefix}${sep}#{version}${after}`;
  return `"${rubyPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
  // Asset basenames often embed the bare version (NetBar-1.2.1.zip) while the
  // path segment used the tag (v1.2.1). After tag rewrite, still template any
  // remaining bare version so livecheck upgrades keep working.
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
