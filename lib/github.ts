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

function mapRelease(data: any) {
  return {
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
}

/**
 * GitHub's /releases/latest only returns the newest *non-prerelease* release.
 * Repos that ship only prereleases (e.g. portdeck) 404 that endpoint even when
 * list_releases has usable assets. Fall back to the newest non-draft prerelease.
 */
export async function getLatestRelease(owner, repo) {
  try {
    const { data } = await getOctokit().rest.repos.getLatestRelease({ owner, repo });
    return mapRelease(data);
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  // No stable "latest" — prefer newest non-draft release (prerelease ok).
  try {
    const releases = await listReleases(owner, repo, { perPage: 20 });
    const usable = (releases || []).filter((r) => r && !r.draft);
    if (usable.length === 0) return null;
    // listReleases is newest-first from GitHub.
    const picked = usable[0];
    return {
      ...picked,
      /** True when we fell back because /releases/latest 404'd. */
      usedPrereleaseFallback: true,
    };
  } catch {
    return null;
  }
}

/** Ruby comment lines when a formula/cask was generated from a prerelease-only repo. */
export function prereleaseFormulaComment(release: {
  tagName?: string;
  prerelease?: boolean;
  usedPrereleaseFallback?: boolean;
} | null | undefined): string {
  if (!release) return "";
  if (!release.usedPrereleaseFallback && !release.prerelease) return "";
  const tag = release.tagName || "unknown";
  return (
    `  # allbrew: using prerelease tag ${tag}` +
    (release.usedPrereleaseFallback
      ? " (no stable GitHub /releases/latest)\n"
      : "\n")
  );
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

/** Normalize product tokens for monorepo tag/asset matching. */
export function normalizeProductToken(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/_/g, "-")
    .trim();
}

/**
 * True when tag or asset text belongs to the named product.
 * e.g. product "cua-driver" matches "cua-driver-rs-v0.19.3" and
 * "cua-driver-rs-0.19.3-darwin-arm64.tar.gz" but not "lume-v0.5.3".
 */
export function textMatchesProductName(
  productName: string,
  text: string,
): boolean {
  const n = normalizeProductToken(productName);
  const t = normalizeProductToken(text);
  if (!n || !t || n.length < 2) return false;
  if (t === n) return true;
  // product as delimited prefix of tag/asset (allows -rs, -cli, -v1.2.3, .tar.gz…)
  if (t.startsWith(n + "-") || t.startsWith(n + ".")) return true;
  return false;
}

/**
 * True when a release's tag, title, or any asset name matches the product.
 * Used for monorepos that ship product-prefixed tags (cua-driver-rs-v*, lume-v*).
 */
export function releaseMatchesProductName(
  release: {
    tagName?: string;
    name?: string;
    assets?: { name: string }[];
  } | null | undefined,
  productName: string,
): boolean {
  if (!release) return false;
  const product = normalizeProductToken(productName);
  if (!product) return true;
  if (textMatchesProductName(product, release.tagName || "")) return true;
  if (textMatchesProductName(product, release.name || "")) return true;
  return (release.assets || []).some((a) =>
    textMatchesProductName(product, a.name || ""),
  );
}

/**
 * Prefer the newest non-draft release that has macOS-usable binary assets.
 * When `productName` is set, only product-matching releases are considered
 * (monorepo --name cua-driver must not pick lume-v* latest).
 *
 * Preference order (first match wins within each tier, newest-first list):
 * 1. stable (non-prerelease), non-nightly tag
 * 2. stable, any tag
 * 3. prerelease, non-nightly tag (e.g. cua-driver-rs-v0.19.3 marked prerelease)
 * 4. any usable (includes nightly-*)
 */
export function pickReleaseWithBinaryAssets(
  releases: ReturnType<typeof mapRelease>[],
  opts: {
    isBinaryAssetFn: (name: string) => boolean;
    matchAssetToArchFn: (name: string) => string | null;
    productName?: string | null;
    requireMacosArmOrUniversal?: boolean;
  },
): ReturnType<typeof mapRelease> | null {
  const usable = (releases || []).filter((r) => r && !r.draft);
  const product = opts.productName
    ? normalizeProductToken(opts.productName)
    : "";
  const requireArm = opts.requireMacosArmOrUniversal !== false;

  const isNightlyTag = (tag: string): boolean =>
    /nightly/i.test(String(tag || ""));

  const hasUsableMacosBin = (rel: ReturnType<typeof mapRelease>): boolean => {
    if (product && !releaseMatchesProductName(rel, product)) return false;
    const tagMatch =
      !product ||
      textMatchesProductName(product, rel.tagName || "") ||
      textMatchesProductName(product, rel.name || "");
    const macos = (rel.assets || []).filter((a) => {
      if (!opts.isBinaryAssetFn(a.name)) return false;
      const arch = opts.matchAssetToArchFn(a.name);
      if (
        arch !== "macosArm" &&
        arch !== "macosIntel" &&
        arch !== "macosUniversal"
      ) {
        return false;
      }
      if (!product) return true;
      if (tagMatch) return true;
      return textMatchesProductName(product, a.name);
    });
    if (macos.length === 0) return false;
    if (!requireArm) return true;
    return macos.some((a) => {
      const arch = opts.matchAssetToArchFn(a.name);
      return arch === "macosArm" || arch === "macosUniversal";
    });
  };

  const pools = [
    usable.filter((r) => !r.prerelease && !isNightlyTag(r.tagName || "")),
    usable.filter((r) => !r.prerelease),
    usable.filter((r) => r.prerelease && !isNightlyTag(r.tagName || "")),
    usable,
  ];

  for (const pool of pools) {
    for (const rel of pool) {
      if (hasUsableMacosBin(rel)) return rel;
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
