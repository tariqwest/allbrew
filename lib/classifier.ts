const GITHUB_REPO_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/;
const GITHUB_REPO_TREE_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(tree|blob)\//;

const APP_STORE_RE = /^https?:\/\/(apps\.apple\.com|itunes\.apple\.com)\//;

const SETAPP_APP_RE = /^https?:\/\/setapp\.com\/apps\/([^/?#]+)/i;

const NPM_PACKAGE_RE = /^https?:\/\/(?:www\.)?npmjs\.com\/package\/(@[^/]+\/[^/]+|[^/]+)/;
const PYPI_PACKAGE_RE = /^https?:\/\/(?:www\.)?pypi\.org\/project\/([^/]+)/;
const RUBYGEMS_PACKAGE_RE = /^https?:\/\/(?:www\.)?rubygems\.org\/gems\/([^/]+)/;
const NUGET_PACKAGE_RE = /^https?:\/\/(?:www\.)?nuget\.org\/packages\/([^/]+)/;

const SCRIPT_EXTENSIONS = ['.sh', '.bash'];
const RAW_GITHUB_RE = /^https?:\/\/raw\.githubusercontent\.com\//;

const ARCHIVE_EXTENSIONS = [
  '.tar.gz', '.tgz', '.tar.bz2', '.tar.xz',
  '.zip', '.pkg', '.gz', '.bz2', '.xz',
];

export function classify(url) {
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();

  if (APP_STORE_RE.test(url)) {
    return { type: 'mac-app-store', url };
  }

  const setappMatch = url.match(SETAPP_APP_RE);
  if (setappMatch) {
    return { type: 'setapp-app', url, slug: setappMatch[1] };
  }

  const npmMatch = url.match(NPM_PACKAGE_RE);
  if (npmMatch) {
    return { type: 'npm-package', url, packageName: npmMatch[1] };
  }

  const pypiMatch = url.match(PYPI_PACKAGE_RE);
  if (pypiMatch) {
    return { type: 'pip-package', url, packageName: pypiMatch[1] };
  }

  const gemMatch = url.match(RUBYGEMS_PACKAGE_RE);
  if (gemMatch) {
    return { type: 'gem-package', url, gemName: gemMatch[1] };
  }

  const nugetMatch = url.match(NUGET_PACKAGE_RE);
  if (nugetMatch) {
    return { type: 'dotnet-package', url, packageName: nugetMatch[1] };
  }

  const ghMatch = url.match(GITHUB_REPO_RE);
  if (ghMatch) {
    return {
      type: 'github-repo',
      url,
      owner: ghMatch[1],
      repo: ghMatch[2].replace(/\.git$/, ''),
    };
  }

  const ghTreeMatch = url.match(GITHUB_REPO_TREE_RE);
  if (ghTreeMatch) {
    return {
      type: 'github-repo',
      url: `https://github.com/${ghTreeMatch[1]}/${ghTreeMatch[2]}`,
      owner: ghTreeMatch[1],
      repo: ghTreeMatch[2].replace(/\.git$/, ''),
    };
  }

  if (SCRIPT_EXTENSIONS.some(ext => path.endsWith(ext)) || RAW_GITHUB_RE.test(url)) {
    if (RAW_GITHUB_RE.test(url) && !SCRIPT_EXTENSIONS.some(ext => path.endsWith(ext))) {
      // raw github but not .sh -- could be anything, check extension
      if (ARCHIVE_EXTENSIONS.some(ext => path.endsWith(ext))) {
        return { type: 'archive', url };
      }
    }
    return { type: 'bash-script', url };
  }

  if (path.endsWith('.dmg')) {
    return { type: 'cask-dmg', url };
  }

  if (ARCHIVE_EXTENSIONS.some(ext => path.endsWith(ext))) {
    return { type: 'archive', url };
  }

  return { type: 'unknown', url };
}

export async function classifyWithHead(url) {
  const result = classify(url);
  if (result.type !== 'unknown') return result;

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'allbrew/1.0' },
      signal: AbortSignal.timeout(30_000),
    });

    const ct = (response.headers.get('content-type') || '').toLowerCase();
    const disp = (response.headers.get('content-disposition') || '').toLowerCase();

    if (ct.includes('application/x-apple-diskimage') || disp.includes('.dmg')) {
      return { type: 'cask-dmg', url };
    }

    if (ct.includes('application/zip') || ct.includes('application/gzip') ||
        ct.includes('application/x-tar') || ct.includes('application/x-bzip2') ||
        ct.includes('application/x-xz')) {
      return { type: 'archive', url };
    }

    if (ct.includes('text/x-shellscript') || ct.includes('application/x-sh')) {
      return { type: 'bash-script', url };
    }
  } catch {
    // fall through
  }

  return { type: 'unknown', url };
}
