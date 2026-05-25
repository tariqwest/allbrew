import { Octokit } from 'octokit';

let octokit = null;

export function initOctokit(token) {
  octokit = new Octokit(token ? { auth: token } : {});
}

function getOctokit() {
  if (!octokit) initOctokit(process.env.GITHUB_TOKEN);
  return octokit;
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
