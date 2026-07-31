import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export function toFormulaName(name) {
  return name
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function toClassName(formulaName) {
  return formulaName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function toCaskToken(name) {
  return name
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

let cachedHomebrewCorePrefix: string | null | undefined;

/** Resolve homebrew/core checkout path (or null when brew/core is unavailable). */
export function getHomebrewCorePrefix(): string | null {
  if (cachedHomebrewCorePrefix !== undefined) return cachedHomebrewCorePrefix;
  try {
    const out = execFileSync("brew", ["--repo", "homebrew/core"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    cachedHomebrewCorePrefix = out || null;
  } catch {
    cachedHomebrewCorePrefix = null;
  }
  return cachedHomebrewCorePrefix;
}

/** Test-only: override or clear the cached brew --repo homebrew/core path. */
export function setHomebrewCorePrefixForTests(path: string | null | undefined) {
  cachedHomebrewCorePrefix = path;
}

/** True when homebrew/core already ships a formula with this token. */
export function isHomebrewCoreFormulaName(name: string): boolean {
  const token = toFormulaName(name || "");
  if (!token) return false;
  const core = getHomebrewCorePrefix();
  if (!core) return false;
  const letter = token[0];
  if (!/[a-z0-9]/.test(letter)) return false;
  return existsSync(join(core, "Formula", letter, `${token}.rb`));
}

/**
 * Avoid bare tokens that collide with homebrew/core.
 * Homebrew's keg_relocate looks up Formula[name] by bare name, so a third-party
 * formula that reuses a core token (e.g. nanobot) silently inherits core
 * metadata — including preserve_rpath? === false — and breaks pip native wheels.
 */
export function resolveNonCollidingFormulaName(
  preferredName: string,
  alternatives: Array<string | null | undefined> = [],
): { name: string; renamedFrom: string | null; reason: string | null } {
  const preferred = toFormulaName(preferredName || "");
  if (!preferred) {
    return { name: preferred, renamedFrom: null, reason: null };
  }
  if (!isHomebrewCoreFormulaName(preferred)) {
    return { name: preferred, renamedFrom: null, reason: null };
  }

  const seen = new Set<string>([preferred]);
  for (const alt of alternatives) {
    const candidate = toFormulaName(String(alt || ""));
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    if (!isHomebrewCoreFormulaName(candidate)) {
      return {
        name: candidate,
        renamedFrom: preferred,
        reason: `homebrew/core already has formula "${preferred}"`,
      };
    }
  }

  let suffix = 1;
  while (suffix < 50) {
    const candidate = `${preferred}-tap${suffix === 1 ? "" : suffix}`;
    if (!isHomebrewCoreFormulaName(candidate) && !seen.has(candidate)) {
      return {
        name: candidate,
        renamedFrom: preferred,
        reason: `homebrew/core already has formula "${preferred}"`,
      };
    }
    suffix += 1;
  }

  return {
    name: `${preferred}-allbrew`,
    renamedFrom: preferred,
    reason: `homebrew/core already has formula "${preferred}"`,
  };
}

export function extractVersionFromTag(tag) {
  return tag.replace(/^v/i, "");
}

export function indent(text, spaces = 2) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

const ALLBREW_FORMULA_DEPENDENCY = "";

export function getAllbrewFormulaDependency() {
  return process.env.ALLBREW_FORMULA_DEPENDENCY || ALLBREW_FORMULA_DEPENDENCY;
}

export async function writeFormula(name, content, tapPath) {
  const dir = join(tapPath, "Formula");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${name}.rb`);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

export async function writeCask(name, content, tapPath) {
  const dir = join(tapPath, "Casks");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${name}.rb`);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

export function rubyString(value) {
  if (!value) return '""';
  return `"${rubyEscape(value)}"`;
}

const SAFE_RUBY_INTERPOLATIONS = new Set([
  "version",
  "version.to_s",
  "name",
  "bin",
  "buildpath",
  "prefix",
  "libexec",
]);

export function rubyEscape(value) {
  let s = String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");

  // Escape Ruby interpolation sequences, except known-safe Homebrew formula/cask
  // variables that templates intentionally embed (e.g. #{version}, #{name}).
  s = s.replace(/#\{([^{}]+)\}/g, (match, expr) => {
    return SAFE_RUBY_INTERPOLATIONS.has(expr.trim()) ? match : `\\#{${expr}}`;
  });

  // Escape any remaining standalone '#' so it cannot start an unexpected interpolation.
  s = s.replace(/#(?!\{)/g, "\\#");

  return s;
}

export function guessLicenseIdentifier(license) {
  if (!license) return null;
  const map = {
    mit: "MIT",
    "apache-2.0": "Apache-2.0",
    "apache 2.0": "Apache-2.0",
    "gpl-2.0": "GPL-2.0-only",
    "gpl-3.0": "GPL-3.0-only",
    "gpl-2.0-only": "GPL-2.0-only",
    "gpl-3.0-only": "GPL-3.0-only",
    "lgpl-2.1": "LGPL-2.1-only",
    "lgpl-3.0": "LGPL-3.0-only",
    "bsd-2-clause": "BSD-2-Clause",
    "bsd-3-clause": "BSD-3-Clause",
    isc: "ISC",
    "mpl-2.0": "MPL-2.0",
    unlicense: "Unlicense",
    "artistic-2.0": "Artistic-2.0",
  };
  const key = license.toLowerCase().trim();
  return map[key] || license;
}

function isCloudMetadataHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "metadata.google.internal" ||
    host.endsWith(".metadata.google.internal")
  ) {
    return true;
  }
  // AWS IMDS / link-local metadata
  if (host === "169.254.169.254") return true;
  return false;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (parts.some((p) => p > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (host.includes(":")) {
    if (host === "::1") return true;
    if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd"))
      return true;
    if (host.startsWith("::ffff:")) {
      return isPrivateOrLocalHostname(host.slice("::ffff:".length));
    }
  }

  return false;
}

export function assertSafeFetchUrl(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol for fetch: ${url.protocol}`);
  }

  // Always block cloud metadata. Localhost remains allowed for e2e fixture servers.
  if (isCloudMetadataHostname(url.hostname)) {
    throw new Error(`Blocked cloud metadata URL: ${urlString}`);
  }
}

/** Stricter SSRF guard for untrusted page-discovery URLs (no private/local). */
export function assertSafePublicFetchUrl(urlString: string): void {
  assertSafeFetchUrl(urlString);
  const host = new URL(urlString).hostname;
  if (isPrivateOrLocalHostname(host) || isCloudMetadataHostname(host)) {
    throw new Error(`Blocked private or local URL: ${urlString}`);
  }
}

/** Lightweight HTML GET with size/time limits and safe redirects. */
export async function fetchTextLimited(
  urlString: string,
  opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {},
): Promise<{ url: string; contentType: string; body: string }> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const maxRedirects = opts.maxRedirects ?? 10;

  let current = urlString;
  for (let i = 0; i <= maxRedirects; i++) {
    assertSafePublicFetchUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "allbrew/1.0",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect without Location from ${current}`);
        }
        current = new URL(location, current).href;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${current}`);
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const reader = response.body?.getReader();
      if (!reader) {
        const text = await response.text();
        if (text.length > maxBytes) {
          throw new Error(`Response exceeds ${maxBytes} bytes for ${current}`);
        }
        return { url: current, contentType, body: text };
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          throw new Error(`Response exceeds ${maxBytes} bytes for ${current}`);
        }
        chunks.push(value);
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }
      const body = new TextDecoder("utf-8", { fatal: false }).decode(merged);
      return { url: current, contentType, body };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Too many redirects (max ${maxRedirects}) for ${urlString}`);
}

export function archPatterns() {
  return {
    macosArm: [
      /darwin.*arm64/i,
      /macos.*arm64/i,
      /arm64.*darwin/i,
      /arm64.*macos/i,
      /aarch64.*darwin/i,
      /aarch64.*apple/i,
      /apple.*silicon/i,
    ],
    macosIntel: [
      /darwin.*amd64/i,
      /macos.*amd64/i,
      /darwin.*x86_64/i,
      /macos.*x86_64/i,
      /darwin.*x64/i,
      /macos.*x64/i,
      /x86_64.*darwin/i,
      /x86_64.*macos/i,
    ],
    macosUniversal: [
      /macos[-_.]?universal/i,
      /universal[-_.]?macos/i,
      /darwin[-_.]?universal/i,
    ],
    linuxArm: [
      /linux.*arm64/i,
      /linux.*aarch64/i,
      /arm64.*linux/i,
      /aarch64.*linux/i,
    ],
    linuxIntel: [
      /linux.*amd64/i,
      /linux.*x86_64/i,
      /linux.*x64/i,
      /amd64.*linux/i,
      /x86_64.*linux/i,
    ],
  };
}

export function matchAssetToArch(assetName) {
  const patterns = archPatterns();
  for (const [arch, regexes] of Object.entries(patterns)) {
    if (regexes.some((r) => r.test(assetName))) return arch;
  }
  return null;
}

export function isAppAsset(assetName) {
  const lower = assetName.toLowerCase();
  return (
    lower.endsWith(".dmg") ||
    (lower.endsWith(".zip") && /mac|macos|osx|darwin|app/i.test(lower))
  );
}

const ARCHIVE_BINARY_EXTS = [".tar.gz", ".tgz", ".tar.bz2", ".tar.xz", ".zip"];
const BARE_BINARY_SKIP_SUFFIXES = [
  ".sha256",
  ".sha256sum",
  ".sig",
  ".asc",
  ".pem",
  ".sbom",
  ".json",
  ".txt",
  ".md",
  ".yml",
  ".yaml",
  ".dmg",
  ".pkg",
  ".deb",
  ".rpm",
  ".appimage",
  ".msi",
  ".app",
];
const BARE_BINARY_SKIP_NAMES = new Set([
  "sha256.txt",
  "sha256sums.txt",
  "checksums.txt",
  "checksums",
  "checksums.txt.asc",
]);

export function isArchiveBinaryAsset(assetName) {
  const lower = assetName.toLowerCase();
  return (
    ARCHIVE_BINARY_EXTS.some((ext) => lower.endsWith(ext)) &&
    !isAppAsset(assetName)
  );
}

/** Extensionless (or .exe) platform-tagged release binaries, e.g. csctf-macos-arm64.
 * Also accepts versioned bare names like afm_0.1.0_macOS_universal (dots only in versions).
 */
export function isBareBinaryAsset(assetName) {
  const lower = assetName.toLowerCase();
  if (!assetName || BARE_BINARY_SKIP_NAMES.has(lower)) return false;
  if (isAppAsset(assetName) || isArchiveBinaryAsset(assetName)) return false;
  if (BARE_BINARY_SKIP_SUFFIXES.some((s) => lower.endsWith(s))) return false;
  if (matchAssetToArch(assetName) == null) return false;
  if (lower.endsWith(".exe")) return true;
  if (!lower.includes(".")) return true;

  // Allow dots only when they look like embedded versions (1.2.3), not real extensions.
  // Real archive/app extensions are already rejected above.
  if (!/\d+\.\d+/.test(lower)) return false;

  const stripped = lower
    .replace(
      /[-_.]?(darwin|macos|osx|linux|windows|win32|apple)[-_.]?(arm64|aarch64|amd64|x86_64|x64|i386|universal)?/gi,
      " ",
    )
    .replace(/[-_.]+/g, " ")
    .trim();
  if (!stripped) return false;

  for (const token of stripped.split(/\s+/)) {
    if (/^\d+(?:\.\d+)*$/.test(token)) continue; // version segment
    if (/^[a-z][a-z0-9]*$/i.test(token)) continue; // name segment
    return false;
  }
  return true;
}

export function isBinaryAsset(assetName) {
  return isArchiveBinaryAsset(assetName) || isBareBinaryAsset(assetName);
}
