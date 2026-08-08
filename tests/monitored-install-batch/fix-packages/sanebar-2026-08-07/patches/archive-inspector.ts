import { execFile } from 'node:child_process';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { downloadToTemp } from './sha256.ts';

const execFileAsync = promisify(execFile);

const SUPPORTED_ARCHIVE_EXTENSIONS = [
  '.zip',
  '.tar.gz', '.tgz', '.tar.bz2', '.tar.xz', '.tar',
];

export async function inspectArchive(url, downloader = downloadToTemp) {
  const download = await downloader(url);
  const { path: archivePath, dir: tempDir, sha256, cleanup } = download;

  try {
    const extractDir = join(tempDir, '_extracted');
    await extractArchive(archivePath, extractDir);

    const files = await listFilesRecursive(extractDir);
    const relativePaths = files.map(f => f.slice(extractDir.length + 1));

    const classification = await classifyContents(extractDir, relativePaths);

    return {
      ...classification,
      sha256,
      files: relativePaths,
      downloadUrl: url,
    };
  } finally {
    await cleanup();
  }
}

async function extractArchive(archivePath, destDir) {
  const lower = archivePath.toLowerCase();

  if (!SUPPORTED_ARCHIVE_EXTENSIONS.some(ext => lower.endsWith(ext))) {
    throw new Error(
      `Unsupported archive format: ${archivePath}. Supported formats: ${SUPPORTED_ARCHIVE_EXTENSIONS.join(', ')}`,
    );
  }

  const entries = await listArchiveEntries(archivePath);
  const dangerous = entries.filter(isDangerousArchiveEntry);
  if (dangerous.length > 0) {
    throw new Error(
      `Archive contains dangerous paths and will not be extracted: ${dangerous.slice(0, 5).join(', ')}`,
    );
  }

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
  }
}

async function listArchiveEntries(archivePath) {
  const lower = archivePath.toLowerCase();

  if (lower.endsWith('.zip')) {
    try {
      const { stdout } = await execFileAsync('zipinfo', ['-1', archivePath]);
      return stdout.split('\n').map(line => line.trim()).filter(Boolean);
    } catch {
      const { stdout } = await execFileAsync('unzip', ['-l', archivePath]);
      return stdout
        .split('\n')
        .slice(3)
        .map(line => line.trim().split(/\s+/).slice(3).join(' '))
        .filter(f => f && !f.startsWith('---'));
    }
  }

  const { stdout } = await execFileAsync('tar', ['-tf', archivePath]);
  return stdout.split('\n').map(line => line.trim()).filter(Boolean);
}

function isDangerousArchiveEntry(entry) {
  const normalized = entry.trim();
  if (!normalized) return true;
  if (normalized.startsWith('/')) return true;
  if (/^[A-Za-z]:[\\/]/.test(normalized)) return true;
  const parts = normalized.split(/[\\/]/);
  return parts.some(part => part === '..');
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

/**
 * Prefer the outermost installable .app (e.g. SaneBar.app), not nested helper
 * bundles such as Sparkle's Frameworks/.../Updater.app which also have
 * Contents/Info.plist and can appear first in filesystem walk order.
 */
function pickPrimaryAppName(relativePaths) {
  const plistPaths = relativePaths.filter((f) =>
    /\.app\/Contents\/Info\.plist$/i.test(f),
  );
  if (plistPaths.length === 0) return null;

  const candidates = plistPaths.map((f) => {
    const appPath = f.replace(/\/Contents\/Info\.plist$/i, "");
    // Nested if another ".app/" segment appears before the final bundle name.
    const nested = /\.app\//i.test(appPath.replace(/[^/]+\.app$/i, ""));
    const depth = appPath.split("/").length;
    const appName = appPath.split("/").pop() || "";
    return { appPath, appName, nested, depth };
  });

  const outer = candidates.filter((c) => !c.nested);
  const pool = outer.length > 0 ? outer : candidates;
  pool.sort((a, b) => a.depth - b.depth || a.appName.localeCompare(b.appName));
  return pool[0]?.appName ?? null;
}

async function classifyContents(extractDir, relativePaths) {
  const appName = pickPrimaryAppName(relativePaths);
  if (appName) {
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

    const isExec = (fileStat.mode & 0o111) !== 0;
    if (isExec && fd[0] === 0x23 && fd[1] === 0x21) return true;

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

/**
 * Mount a DMG read-only and return top-level .app bundle names found inside.
 * Falls back to empty array on any failure so callers can use filename heuristics.
 */
export async function listDmgAppNames(dmgPath: string): Promise<string[]> {
  const mountRoot = join(
    tmpdir(),
    `allbrew-dmg-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await execFileAsync('mkdir', ['-p', mountRoot]);

  let attached = false;
  try {
    await execFileAsync('hdiutil', [
      'attach',
      dmgPath,
      '-readonly',
      '-nobrowse',
      '-noverify',
      '-noautoopen',
      '-mountpoint',
      mountRoot,
    ], { timeout: 120_000 });
    attached = true;

    const entries = await readdir(mountRoot, { withFileTypes: true });
    const apps: string[] = [];
    for (const entry of entries) {
      if (!entry.name.toLowerCase().endsWith('.app')) continue;
      // Prefer directory bundles; some DMGs expose .app as a mount entry with isDirectory true.
      if (entry.isDirectory() || entry.isFile() || entry.isSymbolicLink()) {
        apps.push(entry.name);
      }
    }

    // Nested apps (rare): look one level deeper if nothing at top level.
    if (apps.length === 0) {
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        try {
          const nested = await readdir(join(mountRoot, entry.name), { withFileTypes: true });
          for (const child of nested) {
            if (child.name.toLowerCase().endsWith('.app') && child.isDirectory()) {
              apps.push(child.name);
            }
          }
        } catch {
          // ignore unreadable nested dirs
        }
      }
    }

    return apps;
  } catch {
    return [];
  } finally {
    if (attached) {
      try {
        await execFileAsync('hdiutil', ['detach', mountRoot, '-force'], { timeout: 60_000 });
      } catch {
        try {
          await execFileAsync('hdiutil', ['detach', mountRoot], { timeout: 30_000 });
        } catch {
          // best-effort unmount
        }
      }
    }
    try {
      await rm(mountRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
