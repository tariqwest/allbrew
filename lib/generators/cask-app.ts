import { toCaskToken, rubyEscape } from "../utils.ts";
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

  const downloaded = await downloadToTemp(url);
  const {
    sha256,
    cleanup,
    path,
    contentType = "",
    contentDisposition = "",
    versionHeader = null,
    serverFilename = null,
    finalUrl = url,
  } = downloaded as {
    sha256: string;
    cleanup: () => Promise<void>;
    path: string;
    contentType?: string;
    contentDisposition?: string;
    versionHeader?: string | null;
    serverFilename?: string | null;
    finalUrl?: string;
  };
  // Prefer the URL that actually returned a complete body (may include a
  // cache-bust query when the bare path was a poisoned CDN 206).
  const artifactUrl = finalUrl || url;
  try {
    if (!appName) {
      appName = await detectAppName(artifactUrl, path, {
        contentType,
        contentDisposition,
        serverFilename,
      });
    }
  } finally {
    await cleanup();
  }

  const pathFilename = artifactUrl.split("/").pop().split("?")[0];
  const filename =
    (serverFilename && String(serverFilename)) ||
    (/\.(dmg|zip|pkg)$/i.test(pathFilename) ? pathFilename : null) ||
    pathFilename;
  const baseName = String(filename)
    .replace(/\.(dmg|zip|pkg)$/i, "")
    .replace(/-[\d.]+$/, "")
    // Avoid basing token/app on placeholder path segments from /download/latest APIs
    .replace(/^(latest|download|current|stable)$/i, "")
    .replace(/-latest$/i, "");

  const name =
    options.name ||
    (baseName ? toCaskToken(baseName) : null) ||
    toCaskToken(String(appName || "app").replace(/\.app$/i, ""));
  const rawApp = appName || baseName || name;
  const displayName = String(rawApp).replace(/\.app$/i, "") || baseName || name;
  const desc =
    options.desc ||
    `Install ${displayName}`.replace(/\s+from\s+https?:\/\/\S+/i, "");
  // Always emit a version: Homebrew 4+ can crash (`latest?` on nil) when version is omitted.
  const version =
    options.version ||
    (versionHeader && String(versionHeader).match(/\d+\.\d+(?:\.\d+)?/)?.[0]) ||
    extractVersionFromUrl(artifactUrl) ||
    extractCompactVersion(String(filename)) ||
    extractVersionFromUrl(String(serverFilename || "")) ||
    "1.0.0";

  return {
    template: "cask_app",
    name,
    sha256: rubyEscape(sha256),
    url: rubyEscape(artifactUrl),
    displayName: rubyEscape(displayName),
    desc: rubyEscape(desc),
    versionLine: `  version "${rubyEscape(version)}"\n`,
    homepageLine: options.homepage
      ? `  homepage "${rubyEscape(options.homepage)}"\n`
      : "",
    appOrPkgBlock: buildAppOrPkgBlock(
      artifactUrl,
      String(filename),
      appName,
      baseName || String(displayName),
      name,
    ),
    livecheckBlock: urlVersionLivecheckBlock(artifactUrl),
  };
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

async function detectAppName(
  url: string,
  localPath?: string,
  meta: {
    contentType?: string;
    contentDisposition?: string;
    serverFilename?: string | null;
  } = {},
) {
  const lower = url.toLowerCase();
  const pathLower = (localPath || "").toLowerCase();
  const serverLower = String(meta.serverFilename || "").toLowerCase();
  const ct = (meta.contentType || "").toLowerCase();
  const looksDmg =
    lower.endsWith(".dmg") ||
    pathLower.endsWith(".dmg") ||
    serverLower.endsWith(".dmg") ||
    ct.includes("application/x-apple-diskimage") ||
    /filename[^;]*\.dmg/i.test(meta.contentDisposition || "");
  const looksZip =
    lower.endsWith(".zip") ||
    pathLower.endsWith(".zip") ||
    serverLower.endsWith(".zip") ||
    ct.includes("application/zip");

  // Prefer inspecting a real local artifact for extensionless download APIs.
  if (localPath && (looksDmg || !looksZip)) {
    try {
      const apps = await listDmgAppNames(localPath);
      if (apps.length > 0) return apps[0];
    } catch {
      // fall through
    }
  }

  if (looksDmg && !localPath) {
    try {
      const { downloadToTemp } = await import("../sha256.ts");
      const { path, cleanup } = await downloadToTemp(url);
      try {
        const apps = await listDmgAppNames(path);
        if (apps.length > 0) return apps[0];
      } finally {
        await cleanup();
      }
    } catch {
      // fall through to filename heuristic
    }
  }

  if (looksZip || lower.endsWith(".zip")) {
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

  // Last resort: path/server filename — never invent placeholder "latest.app"
  const fromServer = meta.serverFilename
    ? String(meta.serverFilename).replace(/\.(dmg|zip|pkg)$/i, "")
    : null;
  if (
    fromServer &&
    !/^(latest|download|current|stable)$/i.test(fromServer) &&
    !/-latest$/i.test(fromServer)
  ) {
    return `${fromServer}.app`;
  }
  const filename = url.split("/").pop().split("?")[0];
  const stem = filename.replace(/\.(dmg|zip|pkg)$/i, "");
  if (/^(latest|download|current|stable)$/i.test(stem)) {
    return null;
  }
  return `${stem}.app`;
}

function extractVersionFromUrl(url: string) {
  // Allow _, -, / separators so MonkMode_0.1.0_aarch64.dmg → 0.1.0
  const match = url.match(/[/_-]v?(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

/**
 * Filenames like Unfatten16.dmg / App15.zip encode dotted versions as two
 * trailing digits (1.6 / 1.5) without a separator — common on marketing sites.
 */
function extractCompactVersion(filename: string): string | null {
  const base = filename.replace(/\.(dmg|zip|pkg)$/i, "");
  // Do not treat arch tags (aarch64, x86_64, arm64, amd64, x64) as Unfatten-style compact versions
  if (/(?:^|[_-])(?:aarch64|x86_64|amd64|arm64|x64)$/i.test(base)) return null;
  const m = base.match(/([A-Za-z])(\d)(\d)$/);
  if (!m) return null;
  return `${m[2]}.${m[3]}`;
}

export { extractVersionFromUrl, extractCompactVersion };
