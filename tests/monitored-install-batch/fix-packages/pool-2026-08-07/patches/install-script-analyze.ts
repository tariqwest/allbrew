/**
 * Pure analysis of bash install-script bodies (curl|sh installers).
 * Detects home-dir installers, PREFIX usage, and prebuilt multi-arch
 * binary tarball patterns (e.g. Poolside pool/install.sh).
 */

export type InstallScriptAnalysis = {
  usesPrefix: boolean;
  homeDirInstaller: boolean;
  looksLikeSystemInstaller: boolean;
  suggestedBinName: string | null;
  coreNameCandidates: string[];
  /** Noninteractive env keys the script documents (e.g. POOL_INSTALL_ACCEPT_EULA). */
  acceptEnvKeys: string[];
  /** Install dir env keys (INSTALL_DIR, POOL_INSTALL_DIR, …). */
  installDirEnvKeys: string[];
  signals: string[];
};

export type PrebuiltBinaryPlan = {
  baseUrl: string;
  versionUrl: string | null;
  /** Archive name template with {os} and {arch} placeholders. */
  archiveTemplate: string;
  binName: string;
  homepage: string;
  signals: string[];
};

const HOME_DOT_DIR_RE =
  /\$\{?HOME\}?\/\.[A-Za-z0-9._+-]+|\$HOME\/\.[A-Za-z0-9._+-]+|~\/\.[A-Za-z0-9._+-]+/i;
const CUSTOM_INSTALL_ENV_RE =
  /\b(?:FLYCTL_INSTALL|INSTALL_DIR|INSTALL_PATH|XDG_BIN_HOME|XDG_DATA_HOME|POOL_INSTALL_DIR)\b/;
const ACCEPT_ENV_RE =
  /\b([A-Z][A-Z0-9_]*(?:ACCEPT|EULA|YES|NONINTERACTIVE|CI)[A-Z0-9_]*)\b/g;

function extractBinCandidates(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    let b = String(raw || "").toLowerCase();
    b = b.replace(
      /\.(?:tar\.gz|tgz|tar\.bz2|tar\.xz|zip|dmg|pkg|exe|sh|bash)$/i,
      "",
    );
    if (!b || b.length < 2 || b.length > 40) return;
    if (!/^[a-z][a-z0-9._+-]*$/.test(b)) return;
    if (
      /^(bin|tmp|dir|path|install|script|curl|tar|sh|bash|zsh|home|user|local|opt|os|arch|version|archive|url)$/.test(
        b,
      )
    ) {
      return;
    }
    if (seen.has(b)) return;
    seen.add(b);
    found.push(b);
  };

  for (const m of text.matchAll(
    /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?\/([A-Za-z][A-Za-z0-9._+-]+)/g,
  )) {
    push(m[1]);
  }
  for (const m of text.matchAll(
    /(?:exe|binary|bin_path|cmd)\w*\s*=\s*["']?[^"'\n]*\/([A-Za-z][A-Za-z0-9._+-]+)["']?/gi,
  )) {
    push(m[1]);
  }
  for (const m of text.matchAll(
    /chmod\s+(?:\+x|-x|[0-7]+)\s+["']?[^"'\n]*\/([A-Za-z][A-Za-z0-9._+-]+)/g,
  )) {
    push(m[1]);
  }
  // mv "$binary" "$INSTALL_DIR/pool"
  for (const m of text.matchAll(
    /mv\s+[^\n]+["']?\$\{?[A-Za-z_]+\}?\/([A-Za-z][A-Za-z0-9._+-]+)["']?/g,
  )) {
    push(m[1]);
  }

  return found;
}

export function analyzeInstallScript(
  scriptText: string,
  opts: { url?: string; name?: string } = {},
): InstallScriptAnalysis {
  const text = String(scriptText || "");
  const signals: string[] = [];

  const usesPrefix =
    /\$\{?PREFIX\}?/.test(text) ||
    /\$\{?DESTDIR\}?/.test(text) ||
    /\bPREFIX=/.test(text);
  if (usesPrefix) signals.push("references-PREFIX");

  const homeDirInstaller =
    !usesPrefix &&
    (HOME_DOT_DIR_RE.test(text) || CUSTOM_INSTALL_ENV_RE.test(text));
  if (homeDirInstaller) signals.push("home-dir-installer");

  const looksLikeSystemInstaller =
    !usesPrefix &&
    (/\bsudo\b|\/nix\/|multi-user|daemon/i.test(text) ||
      /\/usr\/local\/(?:bin|lib)/i.test(text));
  if (looksLikeSystemInstaller) signals.push("system-installer");

  const acceptEnvKeys: string[] = [];
  const acceptSeen = new Set<string>();
  for (const m of text.matchAll(ACCEPT_ENV_RE)) {
    const k = m[1];
    if (!acceptSeen.has(k)) {
      acceptSeen.add(k);
      acceptEnvKeys.push(k);
    }
  }
  // Explicit Poolside-style
  if (/\bPOOL_INSTALL_ACCEPT_EULA\b/.test(text) && !acceptSeen.has("POOL_INSTALL_ACCEPT_EULA")) {
    acceptEnvKeys.push("POOL_INSTALL_ACCEPT_EULA");
  }

  const installDirEnvKeys: string[] = [];
  for (const k of [
    "POOL_INSTALL_DIR",
    "INSTALL_DIR",
    "INSTALL_PATH",
    "FLYCTL_INSTALL",
    "XDG_BIN_HOME",
  ]) {
    if (new RegExp(`\\b${k}\\b`).test(text)) installDirEnvKeys.push(k);
  }

  const bins = extractBinCandidates(text);
  const suggestedBinName =
    opts.name ||
    bins.find((b) => b === "pool") ||
    bins[0] ||
    null;
  if (suggestedBinName) signals.push(`bin:${suggestedBinName}`);

  const coreNameCandidates = [
    ...(opts.name ? [opts.name] : []),
    ...bins,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return {
    usesPrefix,
    homeDirInstaller,
    looksLikeSystemInstaller,
    suggestedBinName,
    coreNameCandidates,
    acceptEnvKeys,
    installDirEnvKeys,
    signals,
  };
}

/**
 * Detect prebuilt multi-arch tarball installers:
 *   BASE_URL=...
 *   archive="name-${os}-${arch}.tar.gz"
 *   version from *latest-version* file
 */
export function detectPrebuiltBinaryPlan(
  scriptText: string,
  opts: { url?: string; name?: string } = {},
): PrebuiltBinaryPlan | null {
  const text = String(scriptText || "");
  const signals: string[] = [];

  const baseMatch =
    text.match(/\bBASE_URL=["'](https?:\/\/[^"']+)["']/) ||
    text.match(/\bDOWNLOAD_URL=["'](https?:\/\/[^"']+)["']/) ||
    text.match(/\bRELEASE_URL=["'](https?:\/\/[^"']+)["']/);
  if (!baseMatch) return null;
  const baseUrl = baseMatch[1].replace(/\/+$/, "");
  signals.push(`base:${baseUrl}`);

  // archive="pool-${os}-${arch}.tar.gz" or with $os/$arch
  const archMatch =
    text.match(
      /archive=["']([^"']*\$\{?os\}?[^"']*\$\{?arch\}?[^"']*)["']/,
    ) ||
    text.match(
      /archive=["']([^"']*\$os[^"']*\$arch[^"']*)["']/,
    ) ||
    text.match(
      /["']([A-Za-z0-9._+-]+-\$\{?os\}?-\$\{?arch\}?\.tar\.gz)["']/,
    );
  if (!archMatch) return null;

  let archiveTemplate = archMatch[1]
    .replace(/\$\{os\}/g, "{os}")
    .replace(/\$os/g, "{os}")
    .replace(/\$\{arch\}/g, "{arch}")
    .replace(/\$arch/g, "{arch}");
  if (!archiveTemplate.includes("{os}") || !archiveTemplate.includes("{arch}")) {
    return null;
  }
  signals.push(`archive:${archiveTemplate}`);

  // version file references (basename only when script uses ${BASE_URL}/file.txt)
  let versionUrl: string | null = null;
  const verFile =
    text.match(
      /["']([^"']*latest[-_]version[^"']*\.txt)["']/,
    ) ||
    text.match(
      /\$\{?BASE_URL\}?\/([A-Za-z0-9._+-]*latest[-_]version[A-Za-z0-9._+-]*\.txt)/,
    );
  if (verFile) {
    let vf = verFile[1];
    // Drop shell expansions / URL prefixes → keep basename
    vf = vf.replace(/\$\{[^}]+\}\/?/g, "").replace(/\$[A-Za-z_][A-Za-z0-9_]*\/?/g, "");
    vf = vf.replace(/^https?:\/\/[^/]+\//i, "");
    const baseName = vf.split("/").filter(Boolean).pop() || vf;
    if (/latest[-_]version/i.test(baseName) && !/[\$\{]/.test(baseName)) {
      versionUrl = `${baseUrl}/${baseName}`;
      signals.push(`version-file:${versionUrl}`);
    }
  }

  // Common Poolside path when basename matches
  if (!versionUrl && /poolside\.ai\/pool/i.test(baseUrl)) {
    versionUrl = `${baseUrl}/pool-latest-version.txt`;
    signals.push(`version-file-default:${versionUrl}`);
  }

  const analysis = analyzeInstallScript(text, opts);
  const binName =
    opts.name ||
    analysis.suggestedBinName ||
    archiveTemplate.split("-")[0] ||
    "bin";

  let homepage = baseUrl;
  try {
    if (opts.url) homepage = new URL(opts.url).origin;
  } catch {
    /* keep base */
  }

  return {
    baseUrl,
    versionUrl,
    archiveTemplate,
    binName,
    homepage,
    signals,
  };
}

export function expandArchiveTemplate(
  template: string,
  os: string,
  arch: string,
): string {
  return template.replaceAll("{os}", os).replaceAll("{arch}", arch);
}

/** Map Homebrew/macOS arches to installer script arch tokens. */
export const PREBUILT_PLATFORM_SPECS: Array<{
  key: "macosArm" | "macosIntel" | "linuxArm" | "linuxIntel";
  os: string;
  arch: string;
}> = [
  { key: "macosArm", os: "darwin", arch: "arm64" },
  { key: "macosIntel", os: "darwin", arch: "amd64" },
  { key: "linuxArm", os: "linux", arch: "arm64" },
  { key: "linuxIntel", os: "linux", arch: "amd64" },
];
