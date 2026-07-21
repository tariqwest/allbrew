import { toCaskToken, rubyEscape } from "../utils.ts";
import { downloadToTemp } from "../sha256.ts";
import { listZipEntries } from "../archive-inspector.ts";
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
  const version = options.version || extractVersionFromUrl(url);
  const displayName = appName || baseName;

  return {
    template: "cask_app",
    name,
    sha256: rubyEscape(sha256),
    url: rubyEscape(url),
    displayName: rubyEscape(displayName),
    desc: rubyEscape(desc),
    versionLine: version ? `  version "${rubyEscape(version)}"\n` : "",
    homepageLine: options.homepage
      ? `  homepage "${rubyEscape(options.homepage)}"\n`
      : "",
    appOrPkgBlock: buildAppOrPkgBlock(url, filename, appName, baseName, name),
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

async function detectAppName(url: string, zipPath?: string) {
  const lower = url.toLowerCase();

  if (lower.endsWith(".zip")) {
    try {
      if (zipPath) {
        const entries = await listZipEntries(zipPath);
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
  const match = url.match(/[/-]v?(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}
