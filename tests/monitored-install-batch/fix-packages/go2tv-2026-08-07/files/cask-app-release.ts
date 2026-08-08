import {
  toCaskToken,
  extractVersionFromTag,
  rubyEscape,
  isAppAsset,
  matchAssetToArch,
} from "../utils.ts";
import { downloadToTemp } from "../sha256.ts";
import { listDmgAppNames, listZipEntries } from "../archive-inspector.ts";
import type { CaskAppReleasePayload } from "../template-payload.ts";
import { writeRenderedCask } from "../template-renderer.ts";
import { githubLatestLivecheckBlock } from "./livecheck.ts";

export async function collectCaskAppReleasePayload(
  repoInfo: any,
  release: any,
  options: any = {},
): Promise<CaskAppReleasePayload> {
  const version = extractVersionFromTag(release.tagName);

  const extraNames = new Set(
    (options.extraAppAssetNames as string[] | undefined) || [],
  );
  const appAssets = release.assets.filter(
    (a: any) => isAppAsset(a.name) || extraNames.has(a.name),
  );
  if (appAssets.length === 0) {
    throw new Error("No .dmg or macOS .zip assets found in release");
  }

  // Prefer host-arch when arch-tagged mac app zips are present (e.g. go2tv macOS_arm64).
  const hostArch =
    process.arch === "arm64"
      ? "macosArm"
      : process.arch === "x64"
        ? "macosIntel"
        : null;
  let bestAsset = appAssets.find((a: any) =>
    a.name.toLowerCase().endsWith(".dmg"),
  );
  if (!bestAsset && hostArch) {
    bestAsset = appAssets.find(
      (a: any) => matchAssetToArch(a.name) === hostArch,
    );
  }
  if (!bestAsset) bestAsset = appAssets[0];

  let appName = options.appName;

  const { sha256, cleanup, path } = await downloadToTemp(bestAsset.url, bestAsset.name);
  try {
    if (!appName) {
      appName = await detectAppNameFromAsset(bestAsset, path);
    }
  } finally {
    await cleanup();
  }

  // Never invent a .app name for CLI/darwin archives — brew cask then fails with
  // "App source ... is not there".
  if (!appName) {
    throw new Error(
      `No .app bundle found inside release asset ${bestAsset.name}; not generating a cask`,
    );
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
    `~/Library/Caches/${displayName}`,
    `~/Library/Preferences/${displayName}.plist`,
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

async function detectAppNameFromAsset(asset: any, localPath?: string) {
  const lower = asset.name.toLowerCase();

  if (lower.endsWith(".dmg")) {
    try {
      if (localPath) {
        const apps = await listDmgAppNames(localPath);
        if (apps.length > 0) return apps[0];
      } else {
        const { downloadToTemp } = await import("../sha256.ts");
        const { path, cleanup } = await downloadToTemp(asset.url, asset.name);
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

    const base = asset.name
      .replace(/\.(dmg)$/i, "")
      .replace(/[-_](?:aarch64|arm64|x64|amd64|universal)$/i, "")
      .replace(/-[\d.]+$/, "")
      .replace(/_[\d.]+$/, "");
    return base + ".app";
  }

  if (lower.endsWith(".zip")) {
    try {
      if (localPath) {
        const entries = await listZipEntries(localPath);
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
