import { toCaskToken, rubyString, writeCask } from '../utils.ts';

export async function generateMasApp(appStoreUrl, options: any = {}) {
  const appId = extractAppId(appStoreUrl);
  if (!appId) {
    throw new Error(`Could not extract App Store ID from URL: ${appStoreUrl}`);
  }

  const metadata = await fetchAppMetadata(appId);

  const name = options.name || toCaskToken(metadata.trackName);
  const appName = metadata.trackName;
  const desc = options.desc || metadata.description?.split('\n')[0]?.slice(0, 100) || `Install ${appName} from the Mac App Store`;
  const homepage = metadata.sellerUrl || appStoreUrl;
  const version = metadata.version;
  const bundleId = metadata.bundleId;

  let ruby = `cask ${rubyString(name)} do\n`;
  ruby += `  version ${rubyString(version)}\n`;
  ruby += `  sha256 :no_check\n\n`;

  ruby += `  url "macappstore://apps.apple.com/app/id${appId}?mt=12"\n`;
  ruby += `  name ${rubyString(appName)}\n`;
  ruby += `  desc ${rubyString(desc)}\n`;
  ruby += `  homepage ${rubyString(homepage)}\n\n`;

  ruby += `  depends_on formula: "mas"\n\n`;

  ruby += `  installer script: {\n`;
  ruby += `    executable: "mas",\n`;
  ruby += `    args: ["install", "${appId}"],\n`;
  ruby += `  }\n\n`;

  ruby += `  uninstall delete: "/Applications/${appName}.app"\n\n`;

  ruby += `  zap trash: [\n`;
  if (bundleId) {
    ruby += `    "~/Library/Application Support/${appName}",\n`;
    ruby += `    "~/Library/Caches/${bundleId}",\n`;
    ruby += `    "~/Library/Preferences/${bundleId}.plist",\n`;
    ruby += `    "~/Library/Saved Application State/${bundleId}.savedState",\n`;
  } else {
    ruby += `    "~/Library/Application Support/${appName}",\n`;
  }
  ruby += `  ]\n`;
  ruby += `end\n`;

  const filePath = await writeCask(name, ruby, options.tapPath);
  return { filePath, name, type: 'cask', appId, appName };
}

function extractAppId(url) {
  const match = url.match(/\/id(\d+)/);
  return match ? match[1] : null;
}

async function fetchAppMetadata(appId) {
  const response = await fetch(`https://itunes.apple.com/lookup?id=${appId}`, {
    headers: { 'User-Agent': 'allbrew/1.0' },
  });

  if (!response.ok) {
    throw new Error(`iTunes Lookup API failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`No app found with ID ${appId}`);
  }

  return data.results[0];
}
