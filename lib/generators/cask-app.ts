import { toCaskToken, rubyEscape, stripCaskArtifactSuffixes } from "../utils.ts";
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
    finalUrl = null,
  } = downloaded as {
    sha256: string;
    cleanup: () => Promise<void>;
    path: string;
    contentType?: string;
    contentDisposition?: string;
    versionHeader?: string | null;
    serverFilename?: string | null;
    finalUrl?: string | null;
  };
  try {
    if (!appName) {
      appName = await detectAppName(url, path, {
        contentType,
        contentDisposition,
        serverFilename,
        finalUrl,
      });
    }
  } finally {
    await cleanup();
  }

  const effectiveUrl = finalUrl || url;
  const pathFilename = url.split("/").pop().split("?")[0];
  const finalFilename = effectiveUrl.split("/").pop().split("?")[0];
  const filename =
    (serverFilename && String(serverFilename)) ||
    (/\.(dmg|zip|pkg)$/i.test(pathFilename) ? pathFilename : null) ||
    (/\.(dmg|zip|pkg)$/i.test(finalFilename) ? finalFilename : null) ||
    pathFilename;

  const baseName = stripCaskArtifactSuffixes(
    String(filename)
      .replace(/^(latest|download|current|stable)$/i, ""),
  );

  const name =
    options.name ||
    (baseName ? toCaskToken(baseName) : null) ||
    toCaskToken(String(appName || "app").replace(/\.app$/i, ""));
  const rawApp = appName || baseName || name;
  const displayName =
    stripCaskArtifactSuffixes(String(rawApp).replace(/\.app$/i, "")) ||
    baseName ||
    name;
  const desc =
    options.desc ||
    `Install ${displayName}`.replace(/\s+from\s+https?:\/\/\S+/i, "");

  // Always emit a version: Homebrew 4+ can crash (`latest?` on nil) when version is omitted.
  const version =
    options.version ||
    (versionHeader && String(versionHeader).match(/\d+\.\d+(?:\.\d+)?/)?.[0]) ||
    extractVersionFromUrl(url) ||
    extractVersionFromUrl(String(finalUrl || "")) ||
    extractVersionFromUrl(String(serverFilename || "")) ||
    extractCompactVersion(String(filename)) ||
    "1.0.0";

  return {
    template: "cask_app",
    name,
    sha256: rubyEscape(sha256),
    url: rubyEscape(url),
    displayName: rubyEscape(displayName),
    desc: rubyEscape(desc),
    versionLine: `  version "${rubyEscape(version)}"\n`,
    homepageLine: options.homepage
      ? `  homepage "${rubyEscape(options.homepage)}"\n`
      : "",
    appOrPkgBlock: buildAppOrPkgBlock(
      url,
      String(filename),
      appName,
      baseName || String(displayName),
      name,
    ),
    zapBlock: buildCaskAppZapBlock(displayName),
    livecheckBlock: urlVersionLivecheckBlock(url),
  };
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
    const pkgId = appName
      ? `com.${toCaskToken(appName.replace(/\.app$/i, ""))}.pkg.${caskToken}`
      : `com.example.${rubyEscape(caskToken)}`;
    block += `  uninstall pkgutil: "${rubyEscape(pkgId)}"\n`;
    return block;
  }

  const app = (appName || baseName).replace(/\.app$/i, "") + ".app";
  return `  app "${rubyEscape(app)}"\n`;
}

function buildCaskAppZapBlock(displayName: string): string {
  if (!displayName) return "";
  const app = String(displayName);
  return (
    `  zap trash: [\n` +
    `    "~/Library/Application Support/${rubyEscape(app)}",\n` +
    `    "~/Library/Caches/${rubyEscape(app)}",\n` +
    `    "~/Library/Preferences/${rubyEscape(app)}.plist",\n` +
    `  ]\n`
  );
}

async function detectAppName(
  url: string,
  localPath?: string,
  meta: {
    contentType?: string;
    contentDisposition?: string;
    serverFilename?: string | null;
    finalUrl?: string | null;
  } = {},
) {
  const lower = url.toLowerCase();
  const pathLower = (localPath || "").toLowerCase();
  const serverLower = String(meta.serverFilename || "").toLowerCase();
  const finalLower = String(meta.finalUrl || "").toLowerCase();
  const ct = (meta.contentType || "").toLowerCase();
  const looksDmg =
    lower.endsWith(".dmg") ||
    pathLower.endsWith(".dmg") ||
    serverLower.endsWith(".dmg") ||
    finalLower.endsWith(".dmg") ||
    ct.includes("application/x-apple-diskimage") ||
    /filename[^;]*\.dmg/i.test(meta.contentDisposition || "");
  const looksZip =
    lower.endsWith(".zip") ||
    pathLower.endsWith(".zip") ||
    serverLower.endsWith(".zip") ||
    finalLower.endsWith(".zip") ||
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

  // Last resort: use the final redirected filename or the server filename when
  // the original URL is an extensionless API (e.g. Xirp /api/latest-download).
  const fromServer = meta.serverFilename
    ? String(meta.serverFilename).replace(/\.(dmg|zip|pkg)$/i, "")
    : null;
  if (
    fromServer &&
    !/^(latest|download|current|stable)$/i.test(fromServer) &&
    !/-latest$/i.test(fromServer)
  ) {
    return `${stripCaskArtifactSuffixes(fromServer)}.app`;
  }

  const effectiveUrl = meta.finalUrl || url;
  const candidate = /\.(dmg|zip|pkg)$/i.test(effectiveUrl)
    ? effectiveUrl
    : url;
  const filename = candidate.split("/").pop().split("?")[0];
  const stem = stripCaskArtifactSuffixes(
    filename.replace(/\.(dmg|zip|pkg)$/i, ""),
  );
  if (!stem || /^(latest|download|current|stable)$/i.test(stem)) {
    return null;
  }
  return `${stem}.app`;
}

function extractVersionFromUrl(url: string) {
  if (!url) return null;
  // Allow _, -, /, ., or space separators so names like
  // Xirp-0.14.0-arm64-external.dmg or MyApp_1.2.3.dmg work.
  const match = url.match(/[/_\s.-]v?(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

/**
 * Filenames like Unfatten16.dmg / App15.zip encode dotted versions as two
 * trailing digits (1.6 / 1.5) without a separator — common on marketing sites.
 */
function extractCompactVersion(filename: string): string | null {
  const base = stripCaskArtifactSuffixes(filename);
  // Do not treat arch tags (aarch64, x86_64, arm64, amd64, x64) as Unfatten-style compact versions
  if (/(?:^|[_-])(?:aarch64|x86_64|amd64|arm64|x64)$/i.test(base)) return null;
  const m = base.match(/([A-Za-z])(\d)(\d)$/);
  if (!m) return null;
  return `${m[2]}.${m[3]}`;
}

export { extractVersionFromUrl, extractCompactVersion };

export async function generateCaskApp(url: string, options: any = {}) {
  const payload = await collectCaskAppPayload(url, options);
  return writeRenderedCask(payload, options.tapPath);
}
