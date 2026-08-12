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

/** Known install-script hosts whose product maps to a GitHub releases repo. */
const HOST_GITHUB_REPO: Record<string, [string, string]> = {
  "starship.rs": ["starship", "starship"],
  "railway.com": ["railwayapp", "cli"],
  "cli.new": ["railwayapp", "cli"],
};

/**
 * Pull owner/repo from install-script bodies that download GitHub releases
 * (e.g. BASE_URL="https://github.com/railwayapp/cli/releases").
 */
function githubRepoFromScript(scriptText: string): [string, string] | null {
  if (!scriptText) return null;
  const m = scriptText.match(
    /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/releases/i,
  );
  if (!m) return null;
  return [m[1], m[2]];
}

async function latestReleaseVersion(
  owner: string,
  repo: string,
): Promise<string | null> {
  try {
    const { getLatestRelease } = await import("../github.ts");
    const release = await getLatestRelease(owner, repo);
    if (release?.tagName) return extractVersionFromTag(String(release.tagName));
  } catch {
    /* ignore network / parse errors */
  }
  return null;
}

async function fetchScriptText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "allbrew/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return "";
    const text = await res.text();
    // Cap: install scripts are tiny; avoid huge downloads if misclassified.
    return text.slice(0, 500_000);
  } catch {
    return "";
  }
}

/**
 * Infer the product binary name from a starship-family (or similar) install script.
 * Prefers explicit `$BIN_DIR/<name>` references and release asset prefixes over formula name.
 */
function binNameFromScript(scriptText: string): string | null {
  if (!scriptText) return null;
  const patterns = [
    /\$BIN_DIR\/([A-Za-z0-9._-]+)/,
    /CLI_NAME\s*=\s*["']?([A-Za-z0-9._-]+)["']?/,
    /\/download\/[^/\s"']+\/([A-Za-z0-9._-]+)-v?\$\{?[A-Z0-9_]*VERSION/i,
    /(?:was )?installed successfully to[^`\n]*\/([A-Za-z0-9._-]+)["'`\s]*$/m,
  ];
  for (const re of patterns) {
    const m = scriptText.match(re);
    if (m?.[1] && m[1] !== "install" && m[1] !== "bin") return m[1];
  }
  return null;
}

/** Resolve a Homebrew-safe version for static install-script URLs. */
export async function resolveInstallScriptVersion(
  url: string,
  options: any = {},
  scriptText?: string,
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
        const ver = await latestReleaseVersion(owner, repo);
        if (ver) return ver;
      }
    }
  } catch {
    /* ignore network / parse errors */
  }

  // Script body references github.com/owner/repo/releases (starship, railway, etc.)
  const fromScript = githubRepoFromScript(scriptText || "");
  if (fromScript) {
    const ver = await latestReleaseVersion(fromScript[0], fromScript[1]);
    if (ver) return ver;
  }

  // Known product hostnames
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const mapped = HOST_GITHUB_REPO[host];
    if (mapped) {
      const ver = await latestReleaseVersion(mapped[0], mapped[1]);
      if (ver) return ver;
    }
  } catch {
    /* ignore */
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

  // Fetch script once for version/bin heuristics (versionless hosts + bin-name overrides).
  const scriptText = await fetchScriptText(url);
  const version = await resolveInstallScriptVersion(url, options, scriptText);

  let binName = options.binName || null;
  if (!binName) {
    const fromScript = binNameFromScript(scriptText);
    if (fromScript) binName = fromScript;
  }
  if (!binName && /agent-cli/i.test(url) && /warp/i.test(name)) {
    const m = scriptText.match(/CLI_NAME\s*=\s*["']?([A-Za-z0-9._-]+)["']?/);
    if (m?.[1]) binName = m[1];
  }
  if (!binName) binName = name;

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
