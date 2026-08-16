import {
  toCaskToken,
  extractVersionFromTag,
  rubyEscape,
  isAppAsset,
  matchAssetToArch,
} from "../utils.ts";
import { downloadToTemp } from "../sha256.ts";
import {
  listDmgAppNames,
  listZipEntries,
  listArchiveEntries,
} from "../archive-inspector.ts";
import type { CaskAppReleasePayload } from "../template-payload.ts";
import { writeRenderedCask } from "../template-renderer.ts";
import { githubLatestLivecheckBlock } from "./livecheck.ts";
import { templateReleaseUrl } from "./binary-release.ts";

/** True when cask-app-release rejected a false-positive app asset (CLI zip, etc.). */
export function isMissingAppBundleError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /No \.app bundle found/i.test(msg);
}

/** Prefer DMG, then host-arch zip, then first app asset. */
export function pickBestAppReleaseAsset<
  T extends { name: string; url?: string },
>(appAssets: T[]): T {
  if (appAssets.length === 0) {
    throw new Error("No .dmg or macOS .zip assets found in release");
  }
  const dmgAsset = appAssets.find((a) => a.name.toLowerCase().endsWith(".dmg"));
  if (dmgAsset) return dmgAsset;

  const hostArch =
    process.arch === "arm64"
      ? "macosArm"
      : process.arch === "x64"
        ? "macosIntel"
        : null;
  if (hostArch) {
    const archMatch = appAssets.find(
      (a) => matchAssetToArch(a.name) === hostArch,
    );
    if (archMatch) return archMatch;
  }
  const universal = appAssets.find(
    (a) => matchAssetToArch(a.name) === "macosUniversal",
  );
  if (universal) return universal;
  return appAssets[0];
}

export async function collectCaskAppReleasePayload(
  repoInfo: any,
  release: any,
  options: any = {},
): Promise<CaskAppReleasePayload> {
  const version = extractVersionFromTag(release.tagName);

  // extraAppAssetNames: arch-tagged macOS zips that failed isAppAsset filename
  // heuristics but were content-peeked and confirmed to contain a .app bundle
  // (e.g. go2tv_v2.5.0_macOS_arm64.zip).
  const extraNames = new Set(
    (options.extraAppAssetNames || [])
      .map((n: unknown) => String(n || ""))
      .filter(Boolean),
  );
  const allNames = release.assets.map((a: any) => a.name);
  const appAssets = release.assets.filter(
    (a: any) => isAppAsset(a.name, allNames) || extraNames.has(a.name),
  );
  if (appAssets.length === 0) {
    throw new Error("No .dmg or macOS .zip assets found in release");
  }

  const bestAsset = pickBestAppReleaseAsset(appAssets);

  let appName = options.appName;
  let nestedContainer: string | null = null;

  const { sha256, cleanup, path } = await downloadToTemp(bestAsset.url, bestAsset.name);
  try {
    const detected = await detectAppAndNestedFromAsset(bestAsset, path);
    if (!appName) appName = detected.appName;
    nestedContainer = detected.nestedContainer;
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

  // Use shared templateReleaseUrl so bare tags (tag == version) replace ALL
  // occurrences without inventing a spurious "v" prefix in the asset basename
  // (e.g. ComicTagger-1.5.5-osx-….app.zip must not become ComicTagger-v#{version}-…).
  const urlTemplate = templateReleaseUrl(bestAsset.url, version, release.tagName);

  // Nested DMG basenames often embed the version (nicotine+-3.3.10.dmg).
  let containerBlock = "";
  if (nestedContainer) {
    const nestedTemplated = templateReleaseUrl(
      nestedContainer,
      version,
      release.tagName,
    );
    containerBlock = `  container nested: "${rubyEscape(nestedTemplated)}"\n`;
  }

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
    containerBlock,
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

/** @deprecated Prefer detectAppAndNestedFromAsset; kept for unit tests. */
export async function detectAppNameFromAsset(asset: any, localPath?: string) {
  const r = await detectAppAndNestedFromAsset(asset, localPath);
  return r.appName;
}

export async function detectAppAndNestedFromAsset(
  asset: any,
  localPath?: string,
): Promise<{ appName: string | null; nestedContainer: string | null }> {
  const lower = asset.name.toLowerCase();

  if (lower.endsWith(".dmg")) {
    try {
      if (localPath) {
        const apps = await listDmgAppNames(localPath);
        if (apps.length > 0) return { appName: apps[0], nestedContainer: null };
      } else {
        const { downloadToTemp } = await import("../sha256.ts");
        const { path, cleanup } = await downloadToTemp(asset.url, asset.name);
        try {
          const apps = await listDmgAppNames(path);
          if (apps.length > 0) return { appName: apps[0], nestedContainer: null };
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
    return { appName: base + ".app", nestedContainer: null };
  }

  if (
    lower.endsWith(".zip") ||
    lower.endsWith(".tar.gz") ||
    lower.endsWith(".tgz") ||
    lower.endsWith(".tar.bz2") ||
    lower.endsWith(".tar.xz") ||
    lower.endsWith(".tar")
  ) {
    try {
      const listEntries = async (p: string) => {
        if (lower.endsWith(".zip")) return listZipEntries(p);
        return listArchiveEntries(p);
      };
      const findApp = (entries: string[]) => {
        const appDir = entries.find((e) => /\.app\/?$/i.test(e.trim()));
        if (appDir) {
          return appDir.trim().replace(/\/$/, "").split("/").pop();
        }
        // tar listings often only show nested files under .app/
        const nested = entries.find((e) => /\.app\//i.test(e));
        if (nested) {
          const m = nested.match(/([^/]+\.app)\//i);
          if (m) return m[1];
        }
        return null;
      };
      const findNestedDmg = (entries: string[]) => {
        const dmg = entries.find((e) => /\.dmg$/i.test(e.trim()));
        return dmg ? dmg.trim().replace(/^\.\//, "").split("/").pop()! : null;
      };

      const inspectPath = async (p: string) => {
        const entries = await listEntries(p);
        const name = findApp(entries);
        if (name) return { appName: name, nestedContainer: null as string | null };

        const nestedDmg = findNestedDmg(entries);
        if (nestedDmg && lower.endsWith(".zip")) {
          const { mkdtemp, rm } = await import("node:fs/promises");
          const { tmpdir } = await import("node:os");
          const { join } = await import("node:path");
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const execFileAsync = promisify(execFile);
          const dir = await mkdtemp(join(tmpdir(), "allbrew-nested-dmg-"));
          try {
            await execFileAsync("unzip", ["-o", "-q", p, nestedDmg, "-d", dir]);
            const dmgPath = join(dir, nestedDmg);
            const apps = await listDmgAppNames(dmgPath);
            if (apps.length > 0) {
              return { appName: apps[0], nestedContainer: nestedDmg };
            }
          } finally {
            await rm(dir, { recursive: true, force: true });
          }
        }
        return { appName: null as string | null, nestedContainer: null as string | null };
      };

      if (localPath) {
        return await inspectPath(localPath);
      } else {
        const { downloadToTemp } = await import("../sha256.ts");
        const { path, cleanup } = await downloadToTemp(asset.url, asset.name);
        try {
          return await inspectPath(path);
        } finally {
          await cleanup();
        }
      }
    } catch {
      // fall through
    }
  }

  return { appName: null, nestedContainer: null };
}
