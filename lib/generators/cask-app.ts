import { toCaskToken, rubyString, writeCask } from '../utils.ts';
import { downloadAndHash } from '../sha256.ts';
import { inspectArchive, listZipEntries } from '../archive-inspector.ts';

export async function generateCaskApp(url, options: any = {}) {
  const { sha256 } = await downloadAndHash(url);

  let appName = options.appName;
  if (!appName) {
    appName = await detectAppName(url);
  }

  const filename = url.split('/').pop().split('?')[0];
  const baseName = filename
    .replace(/\.(dmg|zip|pkg)$/i, '')
    .replace(/-[\d.]+$/, '');

  const name = options.name || toCaskToken(baseName);
  const desc = options.desc || `Install ${appName || baseName}`;
  const version = options.version || extractVersionFromUrl(url);

  let ruby = `cask ${rubyString(name)} do\n`;
  if (version) {
    ruby += `  version ${rubyString(version)}\n`;
  }
  ruby += `  sha256 ${rubyString(sha256)}\n\n`;

  ruby += `  url ${rubyString(url)}\n`;
  ruby += `  name ${rubyString(appName || baseName)}\n`;
  ruby += `  desc ${rubyString(desc)}\n`;
  if (options.homepage) {
    ruby += `  homepage ${rubyString(options.homepage)}\n`;
  }
  ruby += `\n`;

  if (url.toLowerCase().endsWith('.pkg')) {
    const pkgName = filename;
    ruby += `  pkg ${rubyString(pkgName)}\n\n`;
    ruby += `  uninstall pkgutil: "com.example.${name}"\n`;
  } else {
    ruby += `  app ${rubyString(appName || baseName + '.app')}\n`;
  }

  ruby += `end\n`;

  const filePath = await writeCask(name, ruby, options.tapPath);
  return { filePath, name, type: 'cask' };
}

async function detectAppName(url) {
  const lower = url.toLowerCase();

  if (lower.endsWith('.zip')) {
    try {
      const { downloadToTemp } = await import('../sha256.ts');
      const { path } = await downloadToTemp(url);
      const entries = await listZipEntries(path);
      const appEntry = entries.find(e => /\.app\/?$/i.test(e));
      if (appEntry) {
        return appEntry.replace(/\/$/, '').split('/').pop();
      }
    } catch {
      // fall through
    }
  }

  const filename = url.split('/').pop().split('?')[0];
  return filename.replace(/\.(dmg|zip|pkg)$/i, '') + '.app';
}

function extractVersionFromUrl(url) {
  const match = url.match(/[/-]v?(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}
