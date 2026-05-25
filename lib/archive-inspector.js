import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { downloadToTemp } from './sha256.js';

const execFileAsync = promisify(execFile);

export async function inspectArchive(url) {
  const download = await downloadToTemp(url);
  const { path: archivePath, dir: tempDir, sha256 } = download;

  const extractDir = join(tempDir, '_extracted');
  await extractArchive(archivePath, extractDir);

  const files = await listFilesRecursive(extractDir);
  const relativePaths = files.map(f => f.slice(extractDir.length + 1));

  const classification = await classifyContents(extractDir, relativePaths);

  return {
    ...classification,
    sha256,
    archivePath,
    extractDir,
    files: relativePaths,
    downloadUrl: url,
  };
}

async function extractArchive(archivePath, destDir) {
  const lower = archivePath.toLowerCase();

  await execFileAsync('mkdir', ['-p', destDir]);

  if (lower.endsWith('.zip')) {
    await execFileAsync('unzip', ['-o', '-q', archivePath, '-d', destDir]);
  } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    await execFileAsync('tar', ['xzf', archivePath, '-C', destDir]);
  } else if (lower.endsWith('.tar.bz2')) {
    await execFileAsync('tar', ['xjf', archivePath, '-C', destDir]);
  } else if (lower.endsWith('.tar.xz')) {
    await execFileAsync('tar', ['xJf', archivePath, '-C', destDir]);
  } else if (lower.endsWith('.tar')) {
    await execFileAsync('tar', ['xf', archivePath, '-C', destDir]);
  } else {
    await execFileAsync('tar', ['xf', archivePath, '-C', destDir]);
  }
}

async function listFilesRecursive(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

async function classifyContents(extractDir, relativePaths) {
  const hasApp = relativePaths.some(f => /\.app\/Contents\/Info\.plist$/i.test(f));
  if (hasApp) {
    const appPath = relativePaths
      .find(f => /\.app\/Contents\/Info\.plist$/i.test(f))
      .replace(/\/Contents\/Info\.plist$/, '');
    const appName = appPath.split('/').pop();
    return { type: 'app', appName };
  }

  const binaries = [];
  for (const relPath of relativePaths) {
    const fullPath = join(extractDir, relPath);
    if (await isBinaryExecutable(fullPath)) {
      binaries.push(relPath);
    }
  }

  const baseNames = relativePaths.map(f => f.split('/').pop().toLowerCase());
  const hasBuildMarkers = baseNames.some(n =>
    ['makefile', 'gnumakefile', 'cmakelists.txt', 'configure', 'meson.build',
     'setup.py', 'pyproject.toml', 'cargo.toml', 'package.json',
     'install.sh', 'setup.sh', 'build.sh'].includes(n)
  );

  const hasReadme = baseNames.some(n =>
    ['readme', 'readme.md', 'readme.txt', 'readme.rst', 'install', 'install.md', 'install.txt'].includes(n)
  );

  const hasSourceFiles = relativePaths.some(f =>
    /\.(c|cpp|cc|cxx|h|hpp|rs|go|py|js|ts|java|swift|m|mm)$/i.test(f)
  );

  if (hasBuildMarkers || (hasReadme && hasSourceFiles)) {
    return { type: 'source', hasBuildMarkers, hasReadme };
  }

  if (binaries.length > 0) {
    const extras = {
      manPages: relativePaths.filter(f => /\.\d$/.test(f) || /\/man\d?\//.test(f)),
      completions: relativePaths.filter(f =>
        /completion/i.test(f) || /\.bash$|\.zsh$|\.fish$/i.test(f)
      ),
      licenses: relativePaths.filter(f => /^(.*\/)?licen[cs]e/i.test(f)),
    };
    return { type: 'binary', binaries, extras };
  }

  return { type: 'unknown' };
}

const MACHO_MAGICS = new Set([
  0xfeedface, 0xfeedfacf, 0xcafebabe, 0xcefaedfe, 0xcffaedfe, 0xbebafeca,
]);
const ELF_MAGIC = 0x7f454c46;

async function isBinaryExecutable(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.size < 4) return false;

    const fd = await readFile(filePath, { flag: 'r' });
    if (fd.length < 4) return false;

    const magic = fd.readUInt32BE(0);
    if (MACHO_MAGICS.has(magic) || magic === ELF_MAGIC) return true;

    const magicLE = fd.readUInt32LE(0);
    if (MACHO_MAGICS.has(magicLE)) return true;

    return false;
  } catch {
    return false;
  }
}

export async function listZipEntries(zipPath) {
  try {
    const { stdout } = await execFileAsync('unzip', ['-l', zipPath]);
    return stdout
      .split('\n')
      .slice(3)
      .map(line => line.trim().split(/\s+/).slice(3).join(' '))
      .filter(f => f && !f.startsWith('---'));
  } catch {
    return [];
  }
}
