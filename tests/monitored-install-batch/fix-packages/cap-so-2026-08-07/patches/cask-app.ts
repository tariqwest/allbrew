import {
  toCaskToken,
  rubyEscape,
  extractVersionFromTag,
} from "../utils.ts";
import { downloadToTemp, filenameFromContentDisposition } from "../sha256.ts";
import { listDmgAppNames, listZipEntries } from "../archive-inspector.ts";
import type { CaskAppPayload } from "../template-payload.ts";
import { writeRenderedCask } from "../template-renderer.ts";
import { urlVersionLivecheckBlock } from "./livecheck.ts";

export async function collectCaskAppPayload(
  url: string,
  options: any = {},
): Promise<CaskAppPayload> {
  let appName = options.appName;

  const download = await downloadToTemp(url);
  const { sha256, cleanup, path, filename: resolvedFilename } = download as any;
  try {
    if (!appName) {
      appName = await detectAppName(url, path, resolvedFilename);
    }
  } finally {
    await cleanup();
  }

  const filename =
    resolvedFilename ||
    url.split("/").pop()?.split("?")[0] ||
    "download.dmg";
  const baseName = deriveBaseName(filename, appName);

  const name = options.name || toCaskToken(baseName);
  const desc =
    options.desc ||
    `Install ${((appName || baseName) as string).replace(/\.app$/i, "")}`;
  const version = await resolveCaskVersion(url, {
    ...options,
    downloadFilename: resolvedFilename,
    contentDisposition: (download as any).contentDisposition,
  });
  // Homebrew requires a version stanza; nil version → `undefined method 'latest?' for nil`.
  const versionLine = version
    ? `  version "${rubyEscape(version)}"\n`
    : "  version :latest\n";
  const displayName = ((appName || baseName) as string).replace(/\.app$/i, "");

  return {
    template: "cask_app",
    name,
    sha256: rubyEscape(sha256),
    url: rubyEscape(url),
    displayName: rubyEscape(displayName),
    desc: rubyEscape(desc),
    versionLine,
    homepageLine: (() => {
      const hp = options.homepage || options.sourceUrl;
      return hp ? `  homepage "${rubyEscape(hp)}"\n` : "";
    })(),
    appOrPkgBlock: buildAppOrPkgBlock(url, filename, appName, baseName, name),
    livecheckBlock: urlVersionLivecheckBlock(url),
  };
}

/**
 * Prefer explicit option, then Content-Disposition / download filename version,
 * then path/query version, then GitHub latest release tag, then page scrape.
 * Returns null only when nothing can be determined (caller emits `version :latest`).
 */
export async function resolveCaskVersion(
  url: string,
  options: any = {},
): Promise<string | null> {
  if (options.version) return String(options.version);

  const fromCd = extractVersionFromFilename(
    options.downloadFilename ||
      filenameFromContentDisposition(options.contentDisposition) ||
      "",
  );
  if (fromCd) return fromCd;

  const fromUrl = extractVersionFromUrl(url);
  if (fromUrl) return fromUrl;

  const gh = url.match(
    /github\.com\/([^/]+)\/([^/]+)\/releases\/(?:latest\/download|download)\/[^/?#]+/i,
  );
  if (gh) {
    try {
      const { getLatestRelease } = await import("../github.ts");
      const release = await getLatestRelease(gh[1], gh[2]);
      const tag = release?.tagName || release?.tag_name;
      if (tag) {
        const v = extractVersionFromTag(tag);
        if (v) return v;
      }
    } catch {
      // fall through
    }
  }

  const pageUrl = options.sourceUrl || options.homepage;
  if (pageUrl && typeof pageUrl === "string" && /^https?:\/\//i.test(pageUrl)) {
    try {
      const fromPage = await extractVersionFromPage(pageUrl);
      if (fromPage) return fromPage;
    } catch {
      // fall through to :latest
    }
  }

  return null;
}

/** Scrape common marketing/download page version strings (not a full parser). */
export async function extractVersionFromPage(
  pageUrl: string,
): Promise<string | null> {
  const res = await fetch(pageUrl, {
    headers: {
      "user-agent": "allbrew/0.0.1 (+https://github.com/tariqwest/allbrew)",
    },
    redirect: "follow",
  });
  if (!res.ok) return null;
  const html = await res.text();
  const patterns = [
    /version\s+(\d+\.\d+(?:\.\d+)?)/i,
    /Download\s+[\w.+-]+\s+(\d+\.\d+(?:\.\d+)?)\s+for\s+mac/i,
    /[\w.+-]+\s+(\d+\.\d+(?:\.\d+)?)\s+for\s+macOS/i,
    /"softwareVersion"\s*:\s*"(\d+\.\d+(?:\.\d+)?)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function buildAppOrPkgBlock(
  url: string,
  filename: string,
  appName: string | null,
  baseName: string,
  caskToken: string,
) {
  if (url.toLowerCase().endsWith(".pkg") || /\.pkg$/i.test(filename)) {
    let block = `  pkg "${rubyEscape(filename)}"\n\n`;
    block += `  uninstall pkgutil: "com.example.${rubyEscape(caskToken)}"\n`;
    return block;
  }

  const app = (appName || baseName).replace(/\.app$/i, "") + ".app";
  return `  app "${rubyEscape(app)}"\n`;
}

export async function generateCaskApp(url: string, options: any = {}) {
  const payload = await collectCaskAppPayload(url, options);
  return writeRenderedCask(payload, options.tapPath);
}

function deriveBaseName(filename: string, appName?: string | null): string {
  if (appName) return appName.replace(/\.app$/i, "");
  // Cap_0.5.8_aarch64.dmg → Cap
  let base = filename
    .replace(/\.(dmg|zip|pkg)$/i, "")
    .replace(/[_-](?:aarch64|arm64|x86_64|x64|amd64|universal|intel)(?:[_-].*)?$/i, "")
    .replace(/[_-]v?\d+\.\d+(?:\.\d+)?.*$/i, "")
    .replace(/-[\d.]+$/, "");
  // Drop pure opaque CDN asset ids
  if (/^[0-9A-Z]{20,}$/i.test(base) || /^[0-9a-f]{16,}$/i.test(base)) {
    return "App";
  }
  return base || "App";
}

export function extractVersionFromFilename(name: string): string | null {
  if (!name) return null;
  const m =
    name.match(/[._-]v?(\d+\.\d+\.\d+(?:\.\d+)?)[._-]/i) ||
    name.match(/[._-]v?(\d+\.\d+)[._-]/i) ||
    name.match(/[/_-]v?(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

async function detectAppName(
  url: string,
  localPath?: string,
  resolvedFilename?: string | null,
) {
  const urlLower = url.toLowerCase().split("?")[0];
  const nameHint = (resolvedFilename || "").toLowerCase();
  const looksDmg =
    urlLower.endsWith(".dmg") ||
    nameHint.endsWith(".dmg") ||
    (localPath?.toLowerCase().endsWith(".dmg") ?? false) ||
    /dmg|crabnebula|publicPlatform=dmg/i.test(url);
  const looksZip =
    urlLower.endsWith(".zip") ||
    nameHint.endsWith(".zip") ||
    (localPath?.toLowerCase().endsWith(".zip") ?? false);

  if (looksDmg) {
    try {
      if (localPath) {
        const apps = await listDmgAppNames(localPath);
        if (apps.length > 0) return apps[0];
      }
    } catch {
      // fall through to filename heuristic
    }
  }

  if (looksZip && !looksDmg) {
    try {
      if (localPath) {
        const entries = await listZipEntries(localPath);
        const appEntry = entries.find((e) => /\.app\/?$/i.test(e));
        if (appEntry) {
          return appEntry.replace(/\/$/, "").split("/").pop();
        }
      }
    } catch {
      // fall through
    }
  }

  const filename =
    resolvedFilename || url.split("/").pop()?.split("?")[0] || "App.dmg";
  const base = deriveBaseName(filename);
  // Prefer Cap from Cap_0.5.8_aarch64
  const fromVer = filename.match(/^([A-Za-z][\w+.-]*?)[._-]v?\d+\.\d+/);
  if (fromVer?.[1] && !/^[0-9A-Z]{20,}$/i.test(fromVer[1])) {
    return fromVer[1] + ".app";
  }
  return base.replace(/\.app$/i, "") + ".app";
}

function extractVersionFromUrl(url: string) {
  const match = url.match(/[/-]v?(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}
