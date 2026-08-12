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
 * Repos that never publish GitHub Releases but still tag versions (e.g. electrum)
 * fall through to the newest stable-looking tag as a synthetic release with a
 * source tarball and empty assets (source-build / README paths consume it).
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
    if (usable.length > 0) {
      // listReleases is newest-first from GitHub.
      const picked = usable[0];
      return {
        ...picked,
        /** True when we fell back because /releases/latest 404'd. */
        usedPrereleaseFallback: true,
      };
    }
  } catch {
    // continue to tag fallback
  }

  // No Releases at all — use a version-like git tag as a synthetic release so
  // source-build gets a stable url/sha256 instead of HEAD-only.
  try {
    const tag = await getLatestStableTag(owner, repo);
    if (!tag) return null;
    return mapTagToSyntheticRelease(owner, repo, tag);
  } catch {
    return null;
  }
}

/**
 * List recent tags (newest first per GitHub). Used when a repo has no Releases
 * but still tags versioned source (electrum, some research tools).
 */
export async function listTags(
  owner: string,
  repo: string,
  opts: { perPage?: number } = {},
) {
  const perPage = Math.min(Math.max(opts.perPage ?? 30, 1), 100);
  try {
    const { data } = await getOctokit().rest.repos.listTags({
      owner,
      repo,
      per_page: perPage,
    });
    return (data || []).map((t: any) => ({
      name: t.name as string,
      commitSha: t.commit?.sha as string | undefined,
      tarballUrl: t.tarball_url as string | undefined,
      zipballUrl: t.zipball_url as string | undefined,
    }));
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/** Match plain semver / multi-segment tags; exclude seed_v*, password_v*, bare words. */
const STABLE_TAG_RE =
  /^v?(\d+(?:\.\d+)+(?:[-+]?[0-9A-Za-z.]+)?)$/i;
const PRERELEASE_TAG_RE = /(?:^|[.\-])(alpha|beta|rc|pre|dev|a\d|b\d)(?:[.\-]|$)/i;

/**
 * Pick the newest stable-looking version tag from a list (GitHub order is
 * typically push-newest-first, but we still sort by semver descending).
 */
export function pickLatestStableTag(
  tags: Array<{ name: string; tarballUrl?: string; zipballUrl?: string }>,
): { name: string; tarballUrl?: string; zipballUrl?: string } | null {
  const scored: Array<{
    name: string;
    tarballUrl?: string;
    zipballUrl?: string;
    parts: number[];
    prerelease: boolean;
  }> = [];
  for (const t of tags || []) {
    const name = String(t?.name || "").trim();
    if (!name || !STABLE_TAG_RE.test(name)) continue;
    const ver = name.replace(/^v/i, "");
    const prerelease = PRERELEASE_TAG_RE.test(ver);
    const parts = ver
      .split(/[.\-+]/)
      .map((p) => {
        const n = parseInt(p, 10);
        return Number.isFinite(n) ? n : 0;
      });
    scored.push({
      name,
      tarballUrl: t.tarballUrl,
      zipballUrl: t.zipballUrl,
      parts,
      prerelease,
    });
  }
  if (scored.length === 0) return null;
  const stable = scored.filter((s) => !s.prerelease);
  const pool = stable.length > 0 ? stable : scored;
  pool.sort((a, b) => {
    const len = Math.max(a.parts.length, b.parts.length);
    for (let i = 0; i < len; i++) {
      const d = (b.parts[i] || 0) - (a.parts[i] || 0);
      if (d !== 0) return d;
    }
    return 0;
  });
  const best = pool[0];
  return {
    name: best.name,
    tarballUrl: best.tarballUrl,
    zipballUrl: best.zipballUrl,
  };
}

export async function getLatestStableTag(owner: string, repo: string) {
  // Page a few times — electrum has many historical tags; first page may be seed_v*.
  const collected: Array<{
    name: string;
    tarballUrl?: string;
    zipballUrl?: string;
  }> = [];
  for (let page = 1; page <= 3; page++) {
    try {
      const { data } = await getOctokit().rest.repos.listTags({
        owner,
        repo,
        per_page: 100,
        page,
      });
      if (!data || data.length === 0) break;
      for (const t of data) {
        collected.push({
          name: t.name,
          tarballUrl: t.tarball_url,
          zipballUrl: t.zipball_url,
        });
      }
      if (data.length < 100) break;
    } catch (err) {
      if (err.status === 404) break;
      throw err;
    }
  }
  return pickLatestStableTag(collected);
}

function mapTagToSyntheticRelease(
  owner: string,
  repo: string,
  tag: { name: string; tarballUrl?: string; zipballUrl?: string },
) {
  const full = `${owner}/${repo}`;
  const tarballUrl =
    tag.tarballUrl ||
    `https://github.com/${full}/archive/refs/tags/${tag.name}.tar.gz`;
  const zipballUrl =
    tag.zipballUrl ||
    `https://github.com/${full}/archive/refs/tags/${tag.name}.zip`;
  return {
    tagName: tag.name,
    name: tag.name,
    body: "",
    draft: false,
    prerelease: false,
    assets: [] as Array<{
      name: string;
      url: string;
      size: number;
      contentType: string;
    }>,
    // Prefer codeload archive URL (hashable over HTTPS) over API tarball redirects.
    tarballUrl: `https://github.com/${full}/archive/refs/tags/${tag.name}.tar.gz`,
    zipballUrl,
    /** True when constructed from a git tag because the repo has no Releases. */
    usedTagFallback: true,
  };
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
