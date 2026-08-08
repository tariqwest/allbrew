import { assertSafeFetchUrl } from "./utils.ts";

const GITHUB_REPO_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/;
const GITHUB_REPO_TREE_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(tree|blob)\//;

const APP_STORE_RE = /^https?:\/\/(apps\.apple\.com|itunes\.apple\.com)\//;

const SETAPP_APP_RE = /^https?:\/\/setapp\.com\/apps\/([^/?#]+)/i;

const NPM_PACKAGE_RE = /^https?:\/\/(?:www\.)?npmjs\.com\/package\/(@[^/]+\/[^/]+|[^/]+)/;
const PYPI_PACKAGE_RE = /^https?:\/\/(?:www\.)?pypi\.org\/project\/([^/]+)/;
const RUBYGEMS_PACKAGE_RE = /^https?:\/\/(?:www\.)?rubygems\.org\/gems\/([^/]+)/;
const NUGET_PACKAGE_RE = /^https?:\/\/(?:www\.)?nuget\.org\/packages\/([^/]+)/;

const CRATES_PACKAGE_RE = /^https?:\/\/(?:www\.)?crates\.io\/crates\/([^/]+)/;

const HOMEBREW_FORMULA_RE =
  /^https?:\/\/formulae\.brew\.sh\/formula\/([^/?#]+)/i;
const HOMEBREW_CASK_RE =
  /^https?:\/\/formulae\.brew\.sh\/cask\/([^/?#]+)/i;

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

  const cratesMatch = url.match(CRATES_PACKAGE_RE);
  if (cratesMatch) {
    return { type: 'cargo-package', url, crateName: cratesMatch[1] };
  }

  const homebrewFormulaMatch = url.match(HOMEBREW_FORMULA_RE);
  if (homebrewFormulaMatch) {
    return { type: 'homebrew-formula', url, name: homebrewFormulaMatch[1] };
  }

  const homebrewCaskMatch = url.match(HOMEBREW_CASK_RE);
  if (homebrewCaskMatch) {
    return { type: 'homebrew-cask', url, name: homebrewCaskMatch[1] };
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

/** True when a text/snippet looks like a POSIX/bash shell script. */
export function looksLikeShellScript(snippet: string): boolean {
  if (!snippet) return false;
  const head = String(snippet).slice(0, 512);
  if (/^#!\s*\/(?:usr\/)?(?:bin\/(?:env\s+)?(?:ba)?sh|bin\/(?:ba)?sh)\b/m.test(head)) {
    return true;
  }
  // Some hosts strip shebang but serve pure bootstrap shells (rare).
  if (
    /^(?:set\s+-[euxo]+\b|dir=|ARCH=|OS=)/m.test(head) &&
    /\b(?:curl|wget)\b/.test(head) &&
    /\b(?:tar|chmod|install)\b/.test(head)
  ) {
    return true;
  }
  return false;
}

/**
 * Probe body bytes when HEAD content-type is unhelpful (e.g. application/octet-stream
 * for extensionless installers like https://zellij.dev/launch or https://sh.rustup.rs).
 */
export async function sniffBodyForScript(url: string): Promise<{ type: string; url: string } | null> {
  assertSafeFetchUrl(url);
  try {
    const bodyRes = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'allbrew/1.0',
        Range: 'bytes=0-4095',
      },
      signal: AbortSignal.timeout(30_000),
    });
    // Binary archives often start with non-text magic; bail if clearly not text.
    const buf = new Uint8Array(await bodyRes.arrayBuffer());
    const sample = buf.slice(0, Math.min(buf.length, 4096));
    // Reject if high ratio of NUL / non-text bytes
    let nonText = 0;
    for (let i = 0; i < sample.length; i++) {
      const b = sample[i];
      if (b === 0) {
        nonText += 4;
        continue;
      }
      if (b < 9 || (b > 13 && b < 32 && b !== 27)) nonText++;
    }
    if (sample.length > 0 && nonText / sample.length > 0.05) return null;

    const snippet = new TextDecoder('utf-8', { fatal: false }).decode(sample);
    if (looksLikeShellScript(snippet)) {
      return { type: 'bash-script', url };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function classifyWithHead(url) {
  const result = classify(url);
  if (result.type !== 'unknown') return result;

  assertSafeFetchUrl(url);

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

    // Extensionless installers (zellij.dev/launch, sh.rustup.rs) are often served as
    // application/octet-stream or text/plain without a script content-type.
    const maybeScriptCt =
      !ct ||
      ct.includes('application/octet-stream') ||
      ct.includes('text/plain') ||
      ct.includes('text/x-') ||
      ct.includes('application/x-download') ||
      ct.includes('binary/octet-stream');
    if (maybeScriptCt) {
      const sniffed = await sniffBodyForScript(url);
      if (sniffed) return sniffed;
    }
  } catch {
    // fall through — still try body sniff once if HEAD failed entirely
    const sniffed = await sniffBodyForScript(url);
    if (sniffed) return sniffed;
  }

  return { type: 'unknown', url };
}
