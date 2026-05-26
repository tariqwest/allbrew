import { toCaskToken, extractVersionFromTag, rubyString, isAppAsset, writeCask } from '../utils.js';
import { downloadAndHash } from '../sha256.js';
import { listZipEntries } from '../archive-inspector.js';

export async function generateGithubReleaseCask(repoInfo, release, options = {}) {
  const version = extractVersionFromTag(release.tagName);

  const appAssets = release.assets.filter(a => isAppAsset(a.name));
  if (appAssets.length === 0) {
    throw new Error('No .dmg or macOS .zip assets found in release');
  }

  const dmgAsset = appAssets.find(a => a.name.toLowerCase().endsWith('.dmg'));
  const bestAsset = dmgAsset || appAssets[0];

  const { sha256 } = await downloadAndHash(bestAsset.url);

  let appName = options.appName;
  if (!appName) {
    appName = await detectAppNameFromAsset(bestAsset);
  }
  if (!appName) {
    appName = repoInfo.name.charAt(0).toUpperCase() + repoInfo.name.slice(1) + '.app';
  }

  const name = options.name || toCaskToken(repoInfo.name);
  const desc = options.desc || repoInfo.description || `Install ${repoInfo.name}`;
  const homepage = repoInfo.homepage || repoInfo.htmlUrl;

  const urlTemplate = bestAsset.url
    .replace(version, '#{version}')
    .replace(release.tagName, 'v#{version}');

  let ruby = `cask ${rubyString(name)} do\n`;
  ruby += `  version ${rubyString(version)}\n`;
  ruby += `  sha256 ${rubyString(sha256)}\n\n`;

  ruby += `  url ${rubyString(urlTemplate)}\n`;
  ruby += `  name ${rubyString(appName.replace(/\.app$/i, ''))}\n`;
  ruby += `  desc ${rubyString(desc)}\n`;
  ruby += `  homepage ${rubyString(homepage)}\n\n`;

  ruby += `  livecheck do\n`;
  ruby += `    url :url\n`;
  ruby += `    strategy :github_latest\n`;
  ruby += `  end\n\n`;

  ruby += `  app ${rubyString(appName)}\n\n`;

  ruby += `  zap trash: [\n`;
  ruby += `    "~/Library/Application Support/${appName.replace(/\.app$/i, '')}",\n`;
  ruby += `    "~/Library/Caches/#{name}",\n`;
  ruby += `    "~/Library/Preferences/#{name}.plist",\n`;
  ruby += `  ]\n`;
  ruby += `end\n`;

  const filePath = await writeCask(name, ruby, options.tapPath);
  return { filePath, name, type: 'cask' };
}

async function detectAppNameFromAsset(asset) {
  const lower = asset.name.toLowerCase();

  if (lower.endsWith('.dmg')) {
    const base = asset.name.replace(/\.(dmg)$/i, '').replace(/-[\d.]+$/, '').replace(/_[\d.]+$/, '');
    return base + '.app';
  }

  if (lower.endsWith('.zip')) {
    try {
      const { downloadToTemp } = await import('../sha256.js');
      const { path } = await downloadToTemp(asset.url, asset.name);
      const entries = await listZipEntries(path);
      const appEntry = entries.find(e => /\.app\/?$/i.test(e.trim()));
      if (appEntry) {
        return appEntry.trim().replace(/\/$/, '').split('/').pop();
      }
    } catch {
      // fall through
    }
  }

  return null;
}
