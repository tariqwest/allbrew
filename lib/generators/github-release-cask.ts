import {
  toCaskToken,
  extractVersionFromTag,
  rubyEscape,
  isAppAsset,
} from "../utils.ts";
import { downloadAndHash } from "../sha256.ts";
import { listZipEntries } from "../archive-inspector.ts";
import type { GithubReleaseCaskPayload } from "../template-payload.ts";
import { writeRenderedCask } from "../template-renderer.ts";

export async function collectGithubReleaseCaskPayload(
  repoInfo: any,
  release: any,
  options: any = {},
): Promise<GithubReleaseCaskPayload> {
  const version = extractVersionFromTag(release.tagName);

  const appAssets = release.assets.filter((a: any) => isAppAsset(a.name));
  if (appAssets.length === 0) {
    throw new Error("No .dmg or macOS .zip assets found in release");
  }

  const dmgAsset = appAssets.find((a: any) =>
    a.name.toLowerCase().endsWith(".dmg"),
  );
  const bestAsset = dmgAsset || appAssets[0];

  const { sha256 } = await downloadAndHash(bestAsset.url);

  let appName = options.appName;
  if (!appName) {
    appName = await detectAppNameFromAsset(bestAsset);
  }
  if (!appName) {
    appName =
      repoInfo.name.charAt(0).toUpperCase() + repoInfo.name.slice(1) + ".app";
  }

  const name = options.name || toCaskToken(repoInfo.name);
  const desc =
    options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;
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
    template: "github_release",
    name,
    version: rubyEscape(version),
    sha256: rubyEscape(sha256),
    url: rubyEscape(urlTemplate),
    displayName: rubyEscape(displayName),
    appName: rubyEscape(appName),
    desc: rubyEscape(desc),
    homepage: rubyEscape(homepage),
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

export async function generateGithubReleaseCask(
  repoInfo: any,
  release: any,
  options: any = {},
) {
  const payload = await collectGithubReleaseCaskPayload(
    repoInfo,
    release,
    options,
  );
  return writeRenderedCask(payload, options.tapPath);
}

async function detectAppNameFromAsset(asset: any) {
  const lower = asset.name.toLowerCase();

  if (lower.endsWith(".dmg")) {
    const base = asset.name
      .replace(/\.(dmg)$/i, "")
      .replace(/-[\d.]+$/, "")
      .replace(/_[\d.]+$/, "");
    return base + ".app";
  }

  if (lower.endsWith(".zip")) {
    try {
      const { downloadToTemp } = await import("../sha256.ts");
      const { path } = await downloadToTemp(asset.url, asset.name);
      const entries = await listZipEntries(path);
      const appEntry = entries.find((e) => /\.app\/?$/i.test(e.trim()));
      if (appEntry) {
        return appEntry.trim().replace(/\/$/, "").split("/").pop();
      }
    } catch {
      // fall through
    }
  }

  return null;
}
