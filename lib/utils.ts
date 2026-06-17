import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export function toFormulaName(name) {
  return name
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function toClassName(formulaName) {
  return formulaName
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function toCaskToken(name) {
  return name
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function extractVersionFromTag(tag) {
  return tag.replace(/^v/i, '');
}

export function indent(text, spaces = 2) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map(line => (line.trim() ? pad + line : line))
    .join('\n');
}

export async function writeFormula(name, content, tapPath) {
  const dir = join(tapPath, 'Formula');
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${name}.rb`);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

export async function writeCask(name, content, tapPath) {
  const dir = join(tapPath, 'Casks');
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${name}.rb`);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

export function rubyString(value) {
  if (!value) return '""';
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function guessLicenseIdentifier(license) {
  if (!license) return null;
  const map = {
    'mit': 'MIT',
    'apache-2.0': 'Apache-2.0',
    'apache 2.0': 'Apache-2.0',
    'gpl-2.0': 'GPL-2.0-only',
    'gpl-3.0': 'GPL-3.0-only',
    'gpl-2.0-only': 'GPL-2.0-only',
    'gpl-3.0-only': 'GPL-3.0-only',
    'lgpl-2.1': 'LGPL-2.1-only',
    'lgpl-3.0': 'LGPL-3.0-only',
    'bsd-2-clause': 'BSD-2-Clause',
    'bsd-3-clause': 'BSD-3-Clause',
    'isc': 'ISC',
    'mpl-2.0': 'MPL-2.0',
    'unlicense': 'Unlicense',
    'artistic-2.0': 'Artistic-2.0',
  };
  const key = license.toLowerCase().trim();
  return map[key] || license;
}

export function archPatterns() {
  return {
    macosArm: [/darwin.*arm64/i, /macos.*arm64/i, /arm64.*darwin/i, /arm64.*macos/i, /aarch64.*darwin/i, /aarch64.*apple/i, /apple.*silicon/i],
    macosIntel: [/darwin.*amd64/i, /macos.*amd64/i, /darwin.*x86_64/i, /macos.*x86_64/i, /darwin.*x64/i, /macos.*x64/i],
    linuxArm: [/linux.*arm64/i, /linux.*aarch64/i, /arm64.*linux/i, /aarch64.*linux/i],
    linuxIntel: [/linux.*amd64/i, /linux.*x86_64/i, /linux.*x64/i, /amd64.*linux/i, /x86_64.*linux/i],
  };
}

export function matchAssetToArch(assetName) {
  const patterns = archPatterns();
  for (const [arch, regexes] of Object.entries(patterns)) {
    if (regexes.some(r => r.test(assetName))) return arch;
  }
  return null;
}

export function isAppAsset(assetName) {
  const lower = assetName.toLowerCase();
  return lower.endsWith('.dmg') ||
    (lower.endsWith('.zip') && /mac|macos|osx|darwin|app/i.test(lower));
}

export function isBinaryAsset(assetName) {
  const lower = assetName.toLowerCase();
  const archiveExts = ['.tar.gz', '.tgz', '.tar.bz2', '.tar.xz', '.zip'];
  return archiveExts.some(ext => lower.endsWith(ext)) && !isAppAsset(assetName);
}
