import { readFileSync } from 'node:fs';
import { Octokit } from 'octokit';
import { getConfigPath } from './config.ts';

let octokit = null;

function getConfigTokenSync(): string | null {
  try {
    const config = JSON.parse(readFileSync(getConfigPath(), 'utf-8'));
    return config.githubToken || null;
  } catch {
    return null;
  }
}

export function initOctokit(token?: string | null) {
  const baseUrl = process.env.GITHUB_API_URL;
  const opts: Record<string, unknown> = {
    // Disable Octokit's built-in throttling retry. Without a token the rate
    // limit reset can be far in the future; fail fast instead of hanging.
    throttle: { enabled: false },
  };
  if (token) opts.auth = token;
  if (baseUrl) opts.baseUrl = baseUrl;
  octokit = new Octokit(opts);
}

function getOctokit() {
  if (!octokit) initOctokit(process.env.GITHUB_TOKEN || getConfigTokenSync());
  return octokit;
}

export async function getAuthenticatedUser(): Promise<{ login: string; name: string | null } | null> {
  try {
    const { data } = await getOctokit().rest.users.getAuthenticated();
    return { login: data.login, name: data.name ?? null };
  } catch {
    return null;
  }
}

export async function createTapRepo(
  owner: string,
  repoName: string,
  description: string = "My personal Homebrew tap",
): Promise<{ htmlUrl: string; cloneUrl: string; sshUrl: string }> {
  const { data } = await getOctokit().rest.repos.createForAuthenticatedUser({
    name: repoName,
    description,
    private: false,
    auto_init: true,
    gitignore_template: null,
    license_template: null,
  });
  return {
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
    sshUrl: data.ssh_url,
  };
}

export async function repoExists(owner: string, repo: string): Promise<boolean> {
  try {
    await getOctokit().rest.repos.get({ owner, repo });
    return true;
  } catch {
    return false;
  }
}

/**
 * GitHub Device Flow OAuth — opens browser URL, polls until user authorizes.
 * CLIENT_ID is the allbrew GitHub OAuth App client ID.
 * Returns a user access token, or null if the user declined / timed out.
 */
export async function deviceFlowOAuth(clientId: string): Promise<string | null> {
  const codeRes = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: "public_repo" }),
  });
  if (!codeRes.ok) throw new Error(`Device code request failed: ${codeRes.status}`);

  const { device_code, user_code, verification_uri, expires_in, interval } =
    await codeRes.json();

  return { device_code, user_code, verification_uri, expires_in, interval } as any;
}

export async function getRepoInfo(owner, repo) {
  const { data } = await getOctokit().rest.repos.get({ owner, repo });
  return {
    name: data.name,
    fullName: data.full_name,
    description: data.description,
    homepage: data.homepage || data.html_url,
    htmlUrl: data.html_url,
    license: data.license?.spdx_id || null,
    defaultBranch: data.default_branch,
    topics: data.topics || [],
    language: data.language,
  };
}

/**
 * Synthesize a macOS app asset name so isAppAsset / matchAssetToArch work when
 * the real CDN URL is extensionless (e.g. CrabNebula asset IDs).
 */
function synthesizeMacAppAssetName(
  product: string,
  keyOrLabel: string,
  url: string,
): string {
  try {
    const u = new URL(url);
    const base = decodeURIComponent(u.pathname.split("/").pop() || "");
    if (/\.(dmg|pkg|zip)$/i.test(base)) return base;
  } catch {
    /* ignore */
  }
  const k = String(keyOrLabel || "").toLowerCase();
  let arch = "macos";
  if (/arm64|aarch64|apple\s*silicon|\bm[1-4]\b/i.test(k)) arch = "macos_arm64";
  else if (/x64|x86_64|amd64|intel/i.test(k)) arch = "macos_x64";
  else if (/universal/i.test(k)) arch = "macos_universal";
  const safe = String(product || "App").replace(/[^\w.-]+/g, "") || "App";
  return `${safe}_${arch}.dmg`;
}

function isMacOsDownloadLabel(label: string): boolean {
  const l = String(label || "").toLowerCase();
  if (!l) return false;
  if (/\b(windows|win32|linux|android|deb|rpm|appimage)\b/i.test(l)) {
    return false;
  }
  return /mac\s*os|macos|apple\s*silicon|darwin|osx|\bmac\b|intel.*mac|mac.*intel|aarch64|arm64/i.test(
    l,
  );
}

/**
 * Parse macOS app download URLs from a GitHub release body when the API
 * `assets` array is empty (common for CrabNebula / CDN-hosted Tauri apps).
 *
 * Supports:
 * - `<!-- DOWNLOADS_JSON {"macos-arm64":"https://..."} -->`
 * - Markdown links like `[macOS (Apple Silicon)](https://cdn…)`
 */
export function extractAssetsFromReleaseBody(
  body: string | null | undefined,
  opts: { productName?: string } = {},
): Array<{ name: string; url: string; size: number; contentType: string }> {
  if (!body || typeof body !== "string") return [];
  const product =
    String(opts.productName || "App").replace(/[^\w.-]+/g, "") || "App";
  const found = new Map<
    string,
    { name: string; url: string; size: number; contentType: string }
  >();

  const jsonMatch = body.match(/DOWNLOADS_JSON\s*(\{[\s\S]*?\})/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
      for (const [key, rawUrl] of Object.entries(obj)) {
        if (typeof rawUrl !== "string" || !/^https?:\/\//i.test(rawUrl)) {
          continue;
        }
        const k = key.toLowerCase();
        if (!/mac|darwin|osx|apple/i.test(k)) continue;
        if (/windows|win32|linux|android/i.test(k)) continue;
        const name = synthesizeMacAppAssetName(product, key, rawUrl);
        found.set(rawUrl, {
          name,
          url: rawUrl,
          size: 0,
          contentType: "application/octet-stream",
        });
      }
    } catch {
      /* ignore malformed DOWNLOADS_JSON */
    }
  }

  for (const m of body.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    const label = m[1];
    const url = m[2];
    if (!isMacOsDownloadLabel(label)) continue;
    if (found.has(url)) continue;
    found.set(url, {
      name: synthesizeMacAppAssetName(product, label, url),
      url,
      size: 0,
      contentType: "application/octet-stream",
    });
  }

  return [...found.values()];
}

/**
 * When GitHub release assets are empty, merge macOS app URLs parsed from the
 * release body so cask-app-release can see DMGs hosted on external CDNs.
 */
export function mergeBodyAssetsIntoRelease<
  T extends { body?: string | null; assets?: Array<{ name: string; url: string }> },
>(release: T | null | undefined, opts: { productName?: string } = {}): T | null {
  if (!release) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const hasDmgOrAppZip = assets.some((a) => {
    const n = String(a?.name || "").toLowerCase();
    return n.endsWith(".dmg") || n.endsWith(".pkg") || (n.endsWith(".zip") && /mac|osx|darwin|\.app/i.test(n));
  });
  if (hasDmgOrAppZip) return release;
  const bodyAssets = extractAssetsFromReleaseBody(release.body, opts);
  if (bodyAssets.length === 0) return release;
  return {
    ...release,
    assets: [...assets, ...bodyAssets],
  };
}

function mapRelease(data: any) {
  const mapped = {
    tagName: data.tag_name,
    name: data.name,
    body: data.body,
    draft: Boolean(data.draft),
    prerelease: Boolean(data.prerelease),
    assets: (data.assets || []).map((a: any) => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
      contentType: a.content_type,
    })),
    tarballUrl: data.tarball_url,
    zipballUrl: data.zipball_url,
  };
  // Prefer body-derived macOS DMG links when the assets array is empty
  // (CrabNebula / CDN releases, e.g. CapSoftware/Cap).
  return mergeBodyAssetsIntoRelease(mapped, {
    productName: data.name || data.tag_name,
  }) as typeof mapped;
}

export async function getLatestRelease(owner, repo) {
  try {
    const { data } = await getOctokit().rest.repos.getLatestRelease({ owner, repo });
    return mapRelease(data);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * List recent releases (newest first). Used when the "latest" tag has no
 * macOS app/binary assets but an older release still ships a .dmg/.app zip.
 */
export async function listReleases(
  owner: string,
  repo: string,
  opts: { perPage?: number } = {},
) {
  const perPage = Math.min(Math.max(opts.perPage ?? 20, 1), 100);
  try {
    const { data } = await getOctokit().rest.repos.listReleases({
      owner,
      repo,
      per_page: perPage,
    });
    return (data || []).map(mapRelease);
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/**
 * Prefer the newest non-draft release that has at least one app asset
 * (DMG / macOS .app zip). Skips pure prereleases unless nothing else qualifies.
 */
export function pickReleaseWithAppAssets(
  releases: ReturnType<typeof mapRelease>[],
  isAppAssetFn: (name: string) => boolean,
): ReturnType<typeof mapRelease> | null {
  const usable = (releases || []).filter((r) => r && !r.draft);
  const stable = usable.filter((r) => !r.prerelease);
  for (const pool of [stable, usable]) {
    for (const rel of pool) {
      if ((rel.assets || []).some((a) => isAppAssetFn(a.name))) {
        return rel;
      }
    }
  }
  return null;
}

export async function getReadme(owner, repo) {
  try {
    const { data } = await getOctokit().rest.repos.getReadme({ owner, repo });
    return Buffer.from(data.content, data.encoding || 'base64').toString('utf-8');
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function getRepoContents(owner, repo, path = '') {
  try {
    const { data } = await getOctokit().rest.repos.getContent({ owner, repo, path });
    if (Array.isArray(data)) {
      return data.map(item => ({
        name: item.name,
        type: item.type,
        path: item.path,
        size: item.size,
      }));
    }
    return data;
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

export async function getFileContent(owner, repo, path) {
  try {
    const { data } = await getOctokit().rest.repos.getContent({ owner, repo, path });
    if (data.type !== 'file') return null;
    return Buffer.from(data.content, data.encoding || 'base64').toString('utf-8');
  } catch {
    return null;
  }
}
