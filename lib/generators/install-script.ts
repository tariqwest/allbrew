import {
  toFormulaName,
  toClassName,
  rubyEscape,
  rubyString,
  guessLicenseIdentifier,
  extractVersionFromTag,
} from "../utils.ts";
import { downloadAndHash } from "../sha256.ts";
import { buildServiceBlock, serviceFromOptions } from "./service.ts";
import { urlVersionLivecheckBlock } from "./livecheck.ts";
import type { InstallScriptPayload } from "../template-payload.ts";
import { writeRenderedFormula } from "../template-renderer.ts";

function extractVersionFromUrl(url: string): string | null {
  const match = String(url).match(/[/-]v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)/);
  return match ? match[1] : null;
}

/** Resolve a Homebrew-safe version for static install-script URLs. */
export async function resolveInstallScriptVersion(
  url: string,
  options: any = {},
): Promise<string> {
  if (options.version) return extractVersionFromTag(String(options.version));

  const fromUrl = extractVersionFromUrl(url);
  if (fromUrl) return fromUrl;

  const releaseTag = options.repoInfo?.releaseTag || options.release?.tagName;
  if (releaseTag) return extractVersionFromTag(String(releaseTag));

  // raw.githubusercontent.com/owner/repo/ref/path → use ref if version-like, else latest release
  try {
    const u = new URL(url);
    if (u.hostname === "raw.githubusercontent.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 3) {
        const [owner, repo, ref] = parts;
        if (/^v?\d/.test(ref)) return extractVersionFromTag(ref);
        const { getLatestRelease } = await import("../github.ts");
        const release = await getLatestRelease(owner, repo);
        if (release?.tagName) return extractVersionFromTag(release.tagName);
      }
    }
  } catch {
    /* ignore network / parse errors */
  }

  // Homebrew requires a non-nil version; livecheck can still move it later.
  return "0.0.1";
}

/** Best-effort parse of CLI binary name from vendor install scripts. */
export function detectBinNameFromInstallScript(
  scriptText: string | null | undefined,
): string | null {
  if (!scriptText) return null;
  const patterns = [
    /\bbin_name\s*=\s*["']([A-Za-z0-9._-]+)["']/,
    /\bCLI_NAME\s*=\s*["']?([A-Za-z0-9._-]+)["']?/,
    /\bBINARY_NAME\s*=\s*["']?([A-Za-z0-9._-]+)["']?/,
    /\bAPP_NAME\s*=\s*["']?([A-Za-z0-9._-]+)["']?/,
  ];
  for (const re of patterns) {
    const m = scriptText.match(re);
    if (m?.[1] && m[1].length < 64) return m[1];
  }
  return null;
}

export async function collectInstallScriptPayload(
  url: string,
  options: any = {},
): Promise<InstallScriptPayload> {
  const { sha256, buffer } = await downloadAndHash(url);

  const filename = url.split("/").pop().split("?")[0] || "install.sh";
  const baseName = filename.replace(/\.(sh|bash)$/i, "");
  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName} via setup script`;
  const repoInfo = options.repoInfo;
  const license = guessLicenseIdentifier(options.license || repoInfo?.license || null);
  const version = await resolveInstallScriptVersion(url, options);
  let binName = options.binName || name;
  if (!options.binName) {
    try {
      const scriptText =
        buffer && buffer.length < 2_000_000
          ? buffer.toString("utf8")
          : null;
      const detected = detectBinNameFromInstallScript(scriptText);
      if (detected) binName = detected;
    } catch {
      /* fallback to name */
    }
  }

  return {
    template: "install_script",
    name,
    className,
    desc: rubyEscape(desc),
    homepage: rubyEscape(url),
    url: rubyEscape(url),
    version: rubyEscape(version),
    sha256: rubyEscape(sha256),
    licenseLine: license ? `  license ${rubyString(license)}\n` : "",
    scriptFilename: rubyEscape(filename),
    livecheckBlock: urlVersionLivecheckBlock(url),
    allbrewDependency: "",
    testBinName: rubyEscape(binName),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateInstallScript(url: string, options: any = {}) {
  const payload = await collectInstallScriptPayload(url, options);
  return writeRenderedFormula(payload, options.tapPath);
}
