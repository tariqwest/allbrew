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

/** curl-like UA: some install portals (getcroc) Vary: User-Agent HTML vs script. */
const INSTALL_SCRIPT_UA = "curl/8.4.0 allbrew/1.0";

function extractVersionFromScriptBody(body: string): string | null {
  // croc_version="11.0.2" / VERSION=1.2.3 / version: "1.2.3"
  const patterns = [
    /\b(?:croc_)?version\s*=\s*["']v?(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)["']/i,
    /\bVERSION\s*=\s*["']?v?(\d+\.\d+(?:\.\d+)?)["']?/,
    /releases\/download\/v?(\d+\.\d+(?:\.\d+)?)/,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m) return m[1];
  }
  return null;
}

function scriptSupportsPrefixFlag(body: string): boolean {
  return /getopts\s+["'][^"']*p/i.test(body) || /--prefix\b/.test(body) || /\bOPTS=.*p/.test(body);
}

export async function collectInstallScriptPayload(
  url: string,
  options: any = {},
): Promise<InstallScriptPayload> {
  const { sha256, buffer } = await downloadAndHash(url, null, undefined, {
    userAgent: INSTALL_SCRIPT_UA,
    headers: { Accept: "text/plain,*/*;q=0.8" },
  });
  const body = buffer ? buffer.toString("utf8") : "";

  const filename = url.split("/").pop().split("?")[0] || "install.sh";
  const baseName =
    filename.replace(/\.(sh|bash)$/i, "") === filename ||
    filename === "" ||
    filename === "default.txt"
      ? options.name || "app"
      : filename.replace(/\.(sh|bash)$/i, "");
  const name = options.name || toFormulaName(baseName === "default" ? "app" : baseName);
  const className = toClassName(name);
  const desc = options.desc || `Install ${name} via setup script`;
  const repoInfo = options.repoInfo;
  const license = guessLicenseIdentifier(options.license || repoInfo?.license || null);
  let version = await resolveInstallScriptVersion(url, options);
  if (version === "0.0.1") {
    const fromBody = extractVersionFromScriptBody(body);
    if (fromBody) version = fromBody;
  }
  const usePrefixFlag = scriptSupportsPrefixFlag(body);

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
    // @ts-expect-error extended field consumed by template
    installArgsRuby: usePrefixFlag
      ? ', "-p", bin'
      : "",
  };
}

export async function generateInstallScript(url: string, options: any = {}) {
  const payload = await collectInstallScriptPayload(url, options);
  return writeRenderedFormula(payload, options.tapPath);
}
