import {
  toCaskToken,
  rubyEscape,
  extractVersionFromTag,
} from "../utils.ts";
import { downloadToTemp } from "../sha256.ts";
import { listDmgAppNames, listZipEntries } from "../archive-inspector.ts";
import type { CaskAppPayload } from "../template-payload.ts";
import { writeRenderedCask } from "../template-renderer.ts";
import { urlVersionLivecheckBlock } from "./livecheck.ts";

export async function collectCaskAppPayload(
  url: string,
  options: any = {},
): Promise<CaskAppPayload> {
  let appName = options.appName;

  const { sha256, cleanup, path } = await downloadToTemp(url);
  try {
    if (!appName) {
      appName = await detectAppName(url, path);
    }
  } finally {
    await cleanup();
  }

  const filename = url.split("/").pop().split("?")[0];
  const baseName = filename
    .replace(/\.(dmg|zip|pkg)$/i, "")
    .replace(/-[\d.]+$/, "");

  const name = options.name || toCaskToken(baseName);
  const desc = options.desc || `Install ${appName || baseName}`;
  const version = await resolveCaskVersion(url, options);
  // Homebrew requires a version stanza; nil version → `undefined method 'latest?' for nil`.
  const versionLine = version
    ? `  version "${rubyEscape(version)}"\n`
    : "  version :latest\n";
  const displayName = (appName || baseName).replace(/\.app$/i, "");

  return {
    template: "cask_app",
    name,
    sha256: rubyEscape(sha256),
    url: rubyEscape(url),
    displayName: rubyEscape(displayName),
    desc: rubyEscape(desc),
    versionLine,
    homepageLine: options.homepage
      ? `  homepage "${rubyEscape(options.homepage)}"\n`
      : "",
    appOrPkgBlock: buildAppOrPkgBlock(url, filename, appName, baseName, name),
    livecheckBlock: urlVersionLivecheckBlock(url),
  };
}

/**
 * Prefer explicit option, then path/query version, then GitHub latest release tag.
 * Returns null only when nothing can be determined (caller emits `version :latest`).
 */
export async function resolveCaskVersion(
  url: string,
  options: any = {},
): Promise<string | null> {
  if (options.version) return String(options.version);

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
      // fall through to :latest
    }
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
  if (url.toLowerCase().endsWith(".pkg")) {
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

async function detectAppName(url: string, localPath?: string) {
  const lower = url.toLowerCase();

  if (lower.endsWith(".dmg")) {
    try {
      if (localPath) {
        const apps = await listDmgAppNames(localPath);
        if (apps.length > 0) return apps[0];
      } else {
        const { downloadToTemp } = await import("../sha256.ts");
        const { path, cleanup } = await downloadToTemp(url);
        try {
          const apps = await listDmgAppNames(path);
          if (apps.length > 0) return apps[0];
        } finally {
          await cleanup();
        }
      }
    } catch {
      // fall through to filename heuristic
    }
  }

  if (lower.endsWith(".zip")) {
    try {
      if (localPath) {
        const entries = await listZipEntries(localPath);
        const appEntry = entries.find((e) => /\.app\/?$/i.test(e));
        if (appEntry) {
          return appEntry.replace(/\/$/, "").split("/").pop();
        }
      } else {
        const { downloadToTemp } = await import("../sha256.ts");
        const { path, cleanup } = await downloadToTemp(url);
        try {
          const entries = await listZipEntries(path);
          const appEntry = entries.find((e) => /\.app\/?$/i.test(e));
          if (appEntry) {
            return appEntry.replace(/\/$/, "").split("/").pop();
          }
        } finally {
          await cleanup();
        }
      }
    } catch {
      // fall through
    }
  }

  const filename = url.split("/").pop().split("?")[0];
  return filename.replace(/\.(dmg|zip|pkg)$/i, "") + ".app";
}

function extractVersionFromUrl(url: string) {
  // Ignore GitHub "/releases/latest/download/" — "latest" is not a version.
  if (/\/releases\/latest\//i.test(url)) return null;
  const match = url.match(/[/-]v?(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}
