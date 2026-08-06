import {
  toFormulaName,
  toClassName,
  rubyEscape,
  rubyString,
  guessLicenseIdentifier,
} from "../utils.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import { urlVersionLivecheckBlock } from "./livecheck.ts";
import type { BinaryDirectPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

/** Top-level dirs Homebrew will not strip (multi-entry FHS-style layouts). */
const KEEP_TOP_LEVEL_DIRS = new Set([
  "bin",
  "sbin",
  "lib",
  "libexec",
  "share",
  "usr",
  "etc",
  "opt",
  "man",
  "include",
  "doc",
  "docs",
  "completions",
  "var",
  "prefix",
]);

/**
 * Homebrew stages archives by removing a single common top-level directory when
 * the archive wraps all contents in one folder (e.g. `gitu-v0.43.0-aarch64-apple-darwin/`).
 * Paths emitted by the archive inspector still include that prefix; strip it so
 * `bin.install` paths match the staged tree.
 *
 * Do not strip FHS-style top dirs like `bin/` when they are the first segment —
 * those remain after staging when the archive root has multiple entries.
 */
export function detectHomebrewStagePrefix(paths: string[]): string | null {
  if (paths.length === 0) return null;
  if (paths.some((p) => !p.includes("/"))) return null;
  const tops = paths.map((p) => p.split("/")[0]!);
  const top = tops[0]!;
  if (!tops.every((t) => t === top)) return null;
  if (KEEP_TOP_LEVEL_DIRS.has(top.toLowerCase())) return null;
  return `${top}/`;
}

function stripStagePrefix(path: string, prefix: string | null): string {
  if (prefix && path.startsWith(prefix)) return path.slice(prefix.length);
  return path;
}

export async function collectBinaryDirectPayload(
  archiveInfo: any,
  selectedBinaries: any = null,
  options: any = {},
): Promise<BinaryDirectPayload> {
  const { downloadUrl, sha256, binaries, extras = {} } = archiveInfo;

  const bins = selectedBinaries || binaries;
  if (!bins || bins.length === 0) {
    throw new Error("No binary executables found in archive");
  }

  const filename = downloadUrl.split("/").pop().split("?")[0] || "binary";
  const baseName = filename
    .replace(/\.tar\.(gz|bz2|xz)$/i, "")
    .replace(/\.(tgz|zip)$/i, "")
    .replace(/-[\d.]+$/, "");

  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName}`;
  const primaryBin = bins[0].split("/").pop();
  const repoInfo = options.repoInfo || archiveInfo.repoInfo;
  const license = guessLicenseIdentifier(options.license || repoInfo?.license || null);

  return {
    template: "binary_direct",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(downloadUrl),
    url: rubyEscape(downloadUrl),
    sha256: rubyEscape(sha256),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    installBody: buildInstallBody(bins, extras),
    livecheckBlock: urlVersionLivecheckBlock(downloadUrl),
    allbrewDependency: "",
    testBinName: rubyEscape(primaryBin),
    serviceBlock: buildServiceBlock(
      serviceFromOptions(options, primaryBin),
      primaryBin,
    ),
  };
}

export function buildInstallBody(
  bins: string[],
  extras: { manPages?: string[]; completions?: string[]; licenses?: string[] },
) {
  const allPaths = [
    ...bins,
    ...(extras.manPages || []),
    ...(extras.completions || []),
    ...(extras.licenses || []),
  ];
  const stagePrefix = detectHomebrewStagePrefix(allPaths);

  let body = "";
  for (const bin of bins) {
    const staged = stripStagePrefix(bin, stagePrefix);
    const binName = staged.split("/").pop();
    if (staged.includes("/")) {
      body += `    bin.install "${rubyEscape(staged)}" => "${rubyEscape(binName!)}"\n`;
    } else {
      body += `    bin.install "${rubyEscape(binName!)}"\n`;
    }
  }

  if (extras.manPages && extras.manPages.length > 0) {
    body += `\n`;
    for (const manPage of extras.manPages) {
      const staged = stripStagePrefix(manPage, stagePrefix);
      const section = staged.match(/\.(\d)$/)?.[1] || "1";
      body += `    man${section}.install "${rubyEscape(staged)}"\n`;
    }
  }

  if (extras.completions && extras.completions.length > 0) {
    body += `\n`;
    for (const comp of extras.completions) {
      const staged = stripStagePrefix(comp, stagePrefix);
      const lower = staged.toLowerCase();
      if (lower.endsWith(".bash") || lower.includes("bash")) {
        body += `    bash_completion.install "${rubyEscape(staged)}"\n`;
      } else if (lower.endsWith(".zsh") || lower.includes("zsh")) {
        body += `    zsh_completion.install "${rubyEscape(staged)}"\n`;
      } else if (lower.endsWith(".fish") || lower.includes("fish")) {
        body += `    fish_completion.install "${rubyEscape(staged)}"\n`;
      }
    }
  }

  if (extras.licenses && extras.licenses.length > 0) {
    body += `\n`;
    for (const lic of extras.licenses) {
      const staged = stripStagePrefix(lic, stagePrefix);
      body += `    share.install "${rubyEscape(staged)}"\n`;
    }
  }

  return body;
}

export async function generateBinaryDirect(
  archiveInfo: any,
  selectedBinaries: any = null,
  options: any = {},
) {
  const payload = await collectBinaryDirectPayload(
    archiveInfo,
    selectedBinaries,
    options,
  );
  return writeRenderedFormula(payload, options.tapPath);
}
