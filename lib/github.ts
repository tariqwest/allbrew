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

export async function getLatestRelease(owner, repo) {
  try {
    const { data } = await getOctokit().rest.repos.getLatestRelease({ owner, repo });
    return {
      tagName: data.tag_name,
      name: data.name,
      body: data.body,
      assets: data.assets.map(a => ({
        name: a.name,
        url: a.browser_download_url,
        size: a.size,
        contentType: a.content_type,
      })),
      tarballUrl: data.tarball_url,
      zipballUrl: data.zipball_url,
    };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
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
