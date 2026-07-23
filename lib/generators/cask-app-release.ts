import {
  toCaskToken,
  extractVersionFromTag,
  rubyEscape,
  isAppAsset,
} from "../utils.ts";
import { downloadToTemp } from "../sha256.ts";
import { listZipEntries } from "../archive-inspector.ts";
import type { CaskAppReleasePayload } from "../template-payload.ts";
import { writeRenderedCask } from "../template-renderer.ts";
import { githubLatestLivecheckBlock } from "./livecheck.ts";

export async function collectCaskAppReleasePayload(
  repoInfo: any,
  release: any,
  options: any = {},
): Promise<CaskAppReleasePayload> {
  const version = extractVersionFromTag(release.tagName);

  const appAssets = release.assets.filter((a: any) => isAppAsset(a.name));
  if (appAssets.length === 0) {
    throw new Error("No .dmg or macOS .zip assets found in release");
  }

  const dmgAsset = appAssets.find((a: any) =>
    a.name.toLowerCase().endsWith(".dmg"),
  );
  const bestAsset = dmgAsset || appAssets[0];

  let appName = options.appName;

  const { sha256, cleanup, path } = await downloadToTemp(bestAsset.url, bestAsset.name);
  try {
    if (!appName) {
      appName = await detectAppNameFromAsset(bestAsset, path);
    }
  } finally {
    await cleanup();
  }

  if (!appName) {
    appName =
      repoInfo.name.charAt(0).toUpperCase() + repoInfo.name.slice(1) + ".app";
  }

  if (!appName.toLowerCase().endsWith(".app")) {
    appName += ".app";
  }

  const name = options.name || toCaskToken(repoInfo.name);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const homepage = options.homepage || repoInfo.homepage || repoInfo.htmlUrl;
  const displayName = appName.replace(/\.app$/i, "");

  const urlTemplate = bestAsset.url
    .replace(version, "#{version}")
    .replace(release.tagName, "v#{version}");

  const zapPaths = [
    `~/Library/Application Support/${displayName}`,
    `~/Library/Caches/#{name}`,
    `~/Library/Preferences/#{name}.plist`,
  ];

  return {
    template: "cask_app_release",
    name,
    version: rubyEscape(version),
    sha256: rubyEscape(sha256),
    url: rubyEscape(urlTemplate),
    displayName: rubyEscape(displayName),
    appName: rubyEscape(appName),
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
    livecheckBlock: githubLatestLivecheckBlock(repoInfo.fullName),
    zapBlock: buildZapBlock(zapPaths),
  };
}

function buildZapBlock(zapPaths: string[]): string {
  let block = "  zap trash: [\n";
  for (const path of zapPaths) {
    block += `    "${rubyEscape(path)}",\n`;
  }
  block += "  ]\n";
  return block;
}

export async function generateCaskAppRelease(
  repoInfo: any,
  release: any,
  options: any = {},
) {
  const payload = await collectCaskAppReleasePayload(
    repoInfo,
    release,
    options,
  );
  return writeRenderedCask(payload, options.tapPath);
}

async function detectAppNameFromAsset(asset: any, zipPath?: string) {
  const lower = asset.name.toLowerCase();

  if (lower.endsWith(".dmg")) {
    const base = asset.name
      .replace(/\.(dmg)$/i, "")
      .replace(/[-_](?:aarch64|arm64|x64|amd64|universal)$/i, "")
      .replace(/-[\d.]+$/, "")
      .replace(/_[\d.]+$/, "");
    return base + ".app";
  }

  if (lower.endsWith(".zip")) {
    try {
      if (zipPath) {
        const entries = await listZipEntries(zipPath);
        const appEntry = entries.find((e) => /\.app\/?$/i.test(e.trim()));
        if (appEntry) {
          return appEntry.trim().replace(/\/$/, "").split("/").pop();
        }
      } else {
        const { downloadToTemp } = await import("../sha256.ts");
        const { path, cleanup } = await downloadToTemp(asset.url, asset.name);
        try {
          const entries = await listZipEntries(path);
          const appEntry = entries.find((e) => /\.app\/?$/i.test(e.trim()));
          if (appEntry) {
            return appEntry.trim().replace(/\/$/, "").split("/").pop();
          }
        } finally {
          await cleanup();
        }
      }
    } catch {
      // fall through
    }
  }

  return null;
}
