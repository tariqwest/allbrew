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

export async function collectInstallScriptPayload(
  url: string,
  options: any = {},
): Promise<InstallScriptPayload> {
  const { sha256 } = await downloadAndHash(url);

  const filename = url.split("/").pop().split("?")[0] || "install.sh";
  const baseName = filename.replace(/\.(sh|bash)$/i, "");
  const name = options.name || toFormulaName(baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${baseName} via setup script`;
  const repoInfo = options.repoInfo;
  const license = guessLicenseIdentifier(options.license || repoInfo?.license || null);
  const version = await resolveInstallScriptVersion(url, options);

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
    testBinName: rubyEscape(options.binName || name),
    serviceBlock: buildServiceBlock(serviceFromOptions(options, name), name),
  };
}

export async function generateInstallScript(url: string, options: any = {}) {
  const payload = await collectInstallScriptPayload(url, options);
  return writeRenderedFormula(payload, options.tapPath);
}
